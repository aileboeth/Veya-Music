// 同步引擎：本地数据 ⇄ 记录镜像 ⇄ 自部署服务器
//
// - 镜像（syncMirror）记着每条记录最后一次同步时的修改时间、写入设备、内容哈希、排序位置；不存内容本身
// - 本地数据保存时重新生成记录，和镜像比对：变了的记录放进待发送（syncOutbox），推给服务器
// - 服务器上有新记录时（实时通道通知 / 定时检查）拉下来，比镜像新的写回本地数据
// - 同一条记录两边都改了：修改时间晚的胜出（时间用服务器时钟校准过）
import os from 'os'
import { bumpVersion, flushAll, load, save, setSaveHook } from '../store'
import { DOMAINS, domainOfKey, type Change, type Ctx, type Domain, type Group } from './domains'
import { hashOf } from './util'
import * as net from './transport'

export interface SyncConf {
  url: string
  key: string
  fp?: string
  pem?: string
  server?: string
  device: { id: string, name: string }
  enabled: boolean
  store?: string
  rev: number
  groups: Record<Group, boolean>
  pairedAt?: number
  /** 已经完成过第一次同步（第一次以服务器上的数据为准） */
  synced?: boolean
}
interface MirrorEntry { t: number, d: string, h: string, p?: number }
interface OutRec { k: string, v: any, t: number }

export interface SyncState {
  paired: boolean
  enabled: boolean
  url: string
  server: string
  deviceId: string
  deviceName: string
  groups: Record<Group, boolean>
  online: boolean
  syncing: boolean
  lastSync: number
  error: string
  pending: number
  devices: any[]
}

const DEFAULT_GROUPS: Record<Group, boolean> = { lists: true, history: true, sources: true, settings: true }
const PLATFORM = process.platform == 'win32' ? 'windows' : process.platform

let conf: SyncConf | null = null
let mirror = new Map<string, MirrorEntry>()
let outbox = new Map<string, OutRec>()
let offset = 0 // 服务器时间 - 本机时间
const state = { online: false, syncing: false, lastSync: 0, error: '', devices: [] as any[] }
let socket: net.Socket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let reconnectDelay = 2000
let periodicTimer: NodeJS.Timeout | null = null
let localTimer: NodeJS.Timeout | null = null
let pullWanted = false
let running: Promise<void> | null = null
const dirty = new Set<string>()
let applying = false

type Listener = { state: (s: SyncState) => void, data: (keys: string[]) => void, np: (device: string, st: any) => void, cmd: (msg: any) => void }
let listeners: Listener = { state: () => {}, data: () => {}, np: () => {}, cmd: () => {} }

// ---------------- 持久化 ----------------
const loadConf = (): SyncConf | null => {
  const c = load<SyncConf | null>('sync', null)
  if (!c?.url || !c.key) return null
  c.groups = { ...DEFAULT_GROUPS, ...(c.groups ?? {}) }
  return c
}
const saveConf = () => save('sync', conf, true)
/**
 * 同步进度（rev / store / synced）和镜像、待发送写在同一个文件里：
 * 应用被强行关掉时，两者要么都是新的、要么都是旧的。如果只有进度是新的，
 * 下次启动会把本地数据当成新修改推上去，覆盖掉别的设备的改动。
 */
const loadMirror = () => {
  const doc = load<any>('syncMirror', null)
  mirror = new Map(Object.entries(doc?.entries ?? {}))
  outbox = new Map(Object.entries(doc?.outbox ?? {}))
  if (conf) {
    conf.rev = Number(doc?.rev) || 0
    conf.store = doc?.store || conf.store
    conf.synced = !!doc?.synced
  }
}
let mirrorTimer: NodeJS.Timeout | null = null
const saveMirror = (now = false) => {
  const write = () => {
    mirrorTimer = null
    // 先把本地数据写盘：保证磁盘上的镜像不会比数据「更新」
    flushAll()
    save('syncMirror', { rev: conf?.rev ?? 0, store: conf?.store, synced: !!conf?.synced, entries: Object.fromEntries(mirror), outbox: Object.fromEntries(outbox) }, true)
  }
  if (mirrorTimer) clearTimeout(mirrorTimer)
  if (now) write()
  else mirrorTimer = setTimeout(write, 2000)
}

const deviceId = () => {
  const saved = load<any>('syncDevice', null)
  if (saved?.id) return saved as { id: string, name: string }
  const d = { id: `${PLATFORM}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`, name: os.hostname() || '电脑' }
  save('syncDevice', d, true)
  return d
}

export const getState = (): SyncState => ({
  paired: !!conf,
  enabled: !!conf?.enabled,
  url: conf?.url ?? '',
  server: conf?.server ?? '',
  deviceId: conf?.device.id ?? deviceId().id,
  deviceName: conf?.device.name ?? deviceId().name,
  groups: conf?.groups ?? { ...DEFAULT_GROUPS },
  online: state.online,
  syncing: state.syncing,
  lastSync: state.lastSync,
  error: state.error,
  pending: outbox.size,
  devices: state.devices,
})
const emitState = () => listeners.state(getState())

const tconf = (): net.TransportConf => ({ url: conf!.url, key: conf!.key, device: conf!.device.id, fp: conf!.fp, pem: conf!.pem })
const now = () => Math.round(Date.now() + offset)

const enabledDomain = (d: Domain | undefined) => !!d && !!conf?.groups[d.group]

const ctx = (): Ctx => ({
  device: conf?.device.id ?? '',
  pos: (k: string) => {
    const e = mirror.get(k)
    return e && e.h ? e.p : undefined
  },
})

// ---------------- 本地变化 → 待发送 ----------------
/** 重新生成这一类数据的记录，和镜像比对，变化放进待发送 */
const diffDomain = (d: Domain) => {
  const c = ctx()
  const proj = d.project(c)
  const t0 = now()
  let changed = 0
  for (const [k, e] of proj) {
    const h = e.h ?? hashOf(e.v)
    const m = mirror.get(k)
    if (m && m.h == h) continue
    const t = Math.max(t0, (m?.t ?? 0) + 1)
    mirror.set(k, { t, d: c.device, h, p: typeof e.v?.p == 'number' ? e.v.p : undefined })
    outbox.set(k, { k, v: e.v, t })
    changed++
  }
  for (const [k, m] of mirror) {
    if (!m.h || proj.has(k) || domainOfKey(k) !== d) continue
    // 别的设备的记录（例如它的听歌统计）：本机没有不代表删掉了，不能发删除，否则两台设备会来回互删
    if (d.owns && !d.owns(c, k)) continue
    const t = Math.max(t0, m.t + 1)
    mirror.set(k, { t, d: c.device, h: '' })
    outbox.set(k, { k, v: null, t })
    changed++
  }
  return changed
}

const flushLocal = () => {
  if (!conf) return 0
  let n = 0
  for (const d of DOMAINS) {
    if (!enabledDomain(d)) continue
    if (dirty.size && !d.storeKeys.some(k => dirty.has(k))) continue
    n += diffDomain(d)
  }
  dirty.clear()
  if (n) saveMirror()
  return n
}

const onSave = (key: string) => {
  if (!conf?.enabled || applying) return
  if (!DOMAINS.some(d => d.storeKeys.includes(key))) return
  dirty.add(key)
  if (localTimer) clearTimeout(localTimer)
  localTimer = setTimeout(() => {
    localTimer = null
    if (flushLocal() || outbox.size) void kick()
  }, 1500)
}

// ---------------- 远端记录 → 本地 ----------------
const applyRemote = (recs: Array<{ k: string, v: any, t: number, d: string }>) => {
  const byDomain = new Map<Domain, Change[]>()
  for (const r of recs) {
    const d = domainOfKey(r.k)
    if (!d || !enabledDomain(d)) continue
    // 别的设备改了「归本机管」的记录（0.1.11 有个 bug 会把别的设备的听歌统计当成删除发出来）：
    // 不接受，稍后用本机的数据覆盖回去
    if (d.owns && r.d != conf?.device.id && d.owns(ctx(), r.k)) {
      foreignOwned.set(r.k, Math.max(foreignOwned.get(r.k) ?? 0, r.t))
      continue
    }
    const m = mirror.get(r.k)
    if (m && (m.t > r.t || (m.t == r.t && m.d >= r.d))) continue
    const h = hashOf(r.v)
    mirror.set(r.k, { t: r.t, d: r.d, h, p: typeof r.v?.p == 'number' ? r.v.p : undefined })
    outbox.delete(r.k)
    let list = byDomain.get(d)
    if (!list) byDomain.set(d, list = [])
    list.push({ k: r.k, v: r.v })
  }
  if (!byDomain.size) return
  const touched = new Set<string>()
  applying = true
  try {
    for (const [d, changes] of byDomain) {
      try {
        for (const k of d.apply(ctx(), changes)) touched.add(k)
      } catch (err) {
        console.error('[sync] apply', d.id, err)
      }
    }
  } finally {
    applying = false
  }
  for (const k of touched) bumpVersion(k)
  saveMirror()
  if (touched.size) listeners.data([...touched])
  // 写回后的数据再比对一次：本地顺序整理之类的差异会作为新的修改发出去
  for (const d of byDomain.keys()) diffDomain(d)
}

/**
 * 把被别的设备改掉的本机记录重新推上去。最多 10 分钟一次：
 * 另一台还是旧版本、还在误删时，不会变成来回互删的死循环
 */
const foreignOwned = new Map<string, number>() // 记录 -> 别的设备写入的修改时间
let lastRestore = 0
const restoreOwned = () => {
  if (!foreignOwned.size || Date.now() - lastRestore < 10 * 60_000) return
  lastRestore = Date.now()
  const doms = new Set<Domain>()
  for (const [k, t] of foreignOwned) {
    // 镜像标成「已删除」、时间取对方那次写入：重新比对时本机的数据会用更晚的时间推上去，盖过对方的写入
    mirror.set(k, { t: Math.max(mirror.get(k)?.t ?? 0, t), d: conf?.device.id ?? '', h: '' })
    const d = domainOfKey(k)
    if (d) doms.add(d)
  }
  foreignOwned.clear()
  for (const d of doms) if (enabledDomain(d)) diffDomain(d)
}

// ---------------- 拉取 / 推送 ----------------
class ResyncError extends Error {}
const resetForNewStore = (storeId: string) => {
  conf!.store = storeId
  conf!.rev = 0
  conf!.synced = false
  mirror.clear()
  outbox.clear()
  saveConf()
  saveMirror(true)
}

const pull = async() => {
  for (let page = 0; page < 500; page++) {
    const r = await net.request(tconf(), 'GET', `/api/pull?since=${conf!.rev}`)
    if (r.status == 401) throw new Error('密钥不对：服务器可能换过密钥，请重新配对')
    if (r.status != 200 || !r.json) throw new Error(r.json?.error ?? `服务器返回 ${r.status}`)
    if (r.json.store && conf!.store && r.json.store != conf!.store) {
      // 服务器数据被清空 / 换了一台：当作第一次同步
      resetForNewStore(r.json.store)
      throw new ResyncError()
    }
    if (!conf!.store) conf!.store = r.json.store
    applyRemote(r.json.records ?? [])
    conf!.rev = r.json.rev ?? conf!.rev
    saveMirror(true)
    if (!r.json.more) break
  }
}

const push = async() => {
  while (outbox.size) {
    // 分批发送，每批不超过约 8 MB
    const batch: OutRec[] = []
    let size = 0
    for (const rec of outbox.values()) {
      const s = typeof rec.v == 'string' ? rec.v.length : JSON.stringify(rec.v ?? null).length
      if (batch.length && size + s > 8 << 20) break
      batch.push(rec)
      size += s
    }
    const r = await net.request(tconf(), 'POST', '/api/push', { store: conf!.store, records: batch }, 120_000)
    if (r.status == 409) {
      resetForNewStore(r.json?.store)
      throw new ResyncError()
    }
    if (r.status == 401) throw new Error('密钥不对：服务器可能换过密钥，请重新配对')
    if (r.status != 200) throw new Error(r.json?.error ?? `服务器返回 ${r.status}`)
    if (r.json?.time) offset = r.json.time - Date.now()
    for (const rec of batch) if (outbox.get(rec.k) === rec) outbox.delete(rec.k)
    saveMirror()
  }
}

const syncRound = async() => {
  if (!conf!.synced) {
    // 第一次同步（或服务器数据被重置过）：先把服务器上已有的拉下来，两边都有的以服务器为准；
    // 本地独有的（歌单里多的歌、服务器上没有的设置）再推上去
    outbox.clear()
    mirror.clear()
    conf!.rev = 0
    await pull()
    for (const d of DOMAINS) if (enabledDomain(d)) diffDomain(d)
    dirty.clear()
    conf!.synced = true
    saveMirror(true)
  } else {
    flushLocal()
    await pull()
  }
  restoreOwned()
  await push()
}

const runOnce = async() => {
  if (!conf?.enabled) return
  state.syncing = true
  emitState()
  try {
    try {
      await syncRound()
    } catch (err) {
      if (!(err instanceof ResyncError)) throw err
      await syncRound()
    }
    state.lastSync = Date.now()
    state.error = ''
  } catch (err: any) {
    state.error = err instanceof ResyncError ? '服务器的数据被重置过，稍后会重新同步' : String(err?.message ?? err)
  } finally {
    state.syncing = false
    saveMirror(true)
    emitState()
  }
}

// ---------------- 前台 / 后台（手机） ----------------
// 手机切到后台后不再同步数据（回到前台时一次补上）；实时通道只在播放时保留（别的设备才能接力这台正在放的歌），
// 不放歌时过一会儿就断开。电脑不调用 setActivity，一直按前台处理。
let foreground = true
let playingNow = false
let idleTimer: NodeJS.Timeout | null = null
const IDLE_DISCONNECT = 60_000
const wantSocket = () => foreground || playingNow

const suspendSocket = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  if (!socket) return
  socket.close()
  socket = null
  state.online = false
  state.devices = []
  emitState()
}

export const setActivity = (a: { foreground?: boolean, playing?: boolean }) => {
  const wasFg = foreground
  if (a.foreground !== undefined) foreground = a.foreground
  if (a.playing !== undefined) playingNow = a.playing
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (!conf?.enabled) return
  if (wantSocket()) connect()
  else idleTimer = setTimeout(() => { idleTimer = null; if (!wantSocket()) suspendSocket() }, IDLE_DISCONNECT)
  if (foreground && !wasFg) {
    // 回到前台：把后台期间别的设备的改动拉下来、本机的改动推上去
    void kick()
  } else if (!foreground && wasFg) {
    // 切到后台：最后同步一次，把还没上传的改动发出去
    if (localTimer) {
      clearTimeout(localTimer)
      localTimer = null
      flushLocal()
    }
    void kick(true)
  }
}

/** 安排一次同步；正在同步时等它结束再来一次。手机在后台时只记下来，回到前台再同步（force 除外） */
const kick = (force = false) => {
  if (!conf?.enabled) return Promise.resolve()
  if (!foreground && !force) {
    return running ?? Promise.resolve()
  }
  if (running) {
    pullWanted = true
    return running
  }
  running = runOnce().finally(() => {
    running = null
    if (pullWanted) {
      pullWanted = false
      void kick()
    }
  })
  return running
}

// ---------------- 实时通道 ----------------
const connect = () => {
  if (!conf?.enabled || socket || !wantSocket()) return
  const c = conf
  socket = net.openSocket(tconf(), () => {
    socket?.send({ type: 'auth', key: c.key, device: { id: c.device.id, name: c.device.name, platform: PLATFORM, version: appVersion } })
  }, msg => {
    switch (msg.type) {
      case 'ready':
        state.online = true
        reconnectDelay = 2000
        if (msg.time) offset = msg.time - Date.now()
        state.devices = msg.devices ?? []
        emitState()
        if (msg.rev != c.rev || outbox.size) void kick()
        socket?.send({ type: 'ping', t0: Date.now() })
        break
      case 'rev':
        if (msg.rev > (conf?.rev ?? 0)) void kick()
        break
      case 'devices':
        state.devices = msg.list ?? []
        emitState()
        break
      case 'np':
        listeners.np(msg.device, msg.state)
        break
      case 'cmd':
      case 'cmdError':
        listeners.cmd(msg)
        break
      case 'pong': {
        const t1 = Date.now()
        if (typeof msg.ts == 'number' && t1 - msg.t0 < 3000) offset = msg.ts - (msg.t0 + t1) / 2
        lastRtt = t1 - msg.t0
        break
      }
      case 'error':
        state.error = msg.error ?? '连接被拒绝'
        emitState()
        break
    }
  }, reason => {
    socket = null
    const wasOnline = state.online
    state.online = false
    state.devices = []
    if (wasOnline) emitState()
    if (!state.error && !wasOnline && reason && reason != 'closed') {
      state.error = reason
      emitState()
    }
    if (!conf?.enabled || reason == 'closed' || !wantSocket()) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, reconnectDelay)
    reconnectDelay = Math.min(60_000, reconnectDelay * 2)
  })
}
let lastRtt = 0
let appVersion = ''

const stopAll = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  socket?.close()
  socket = null
  state.online = false
  state.devices = []
  if (periodicTimer) clearInterval(periodicTimer)
  periodicTimer = null
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
}

const startAll = () => {
  if (!conf?.enabled) return
  connect()
  periodicTimer ??= setInterval(() => {
    if (!state.online && wantSocket()) connect()
    void kick()
    socket?.send({ type: 'ping', t0: Date.now() })
  }, 5 * 60_000)
  void kick()
}

// ---------------- 对外接口 ----------------
export const initSync = (opts: { version: string } & Partial<Listener>) => {
  appVersion = opts.version
  listeners = { ...listeners, ...Object.fromEntries(Object.entries(opts).filter(([k]) => k != 'version')) }
  setSaveHook(onSave)
  conf = loadConf()
  if (!conf) return
  loadMirror()
  startAll()
}

/** 解析配对码：veya1.<base64url(JSON {u 地址, k 密钥, f 证书指纹, n 名称})> */
export const parsePairCode = (code: string) => {
  const m = /veya1\.([\w-]+)/.exec(String(code ?? '').trim())
  if (!m) throw new Error('配对码格式不对：应该是 veya1. 开头的一整行（在服务器上运行 veya-sync info 查看）')
  let p: any
  try { p = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) } catch { throw new Error('配对码不完整，请重新复制一整行') }
  if (!/^https?:\/\/[^\s/]+$/.test(p?.u ?? '') || typeof p.k != 'string' || p.k.length < 16) throw new Error('配对码内容不对')
  return { url: p.u as string, key: p.k as string, fp: (p.f as string) || undefined, name: (p.n as string) || '' }
}

export const pair = async(code: string, deviceName?: string) => {
  const p = parsePairCode(code)
  const pem = p.fp ? await net.fetchPinnedCert(p.url, p.fp) : undefined
  const dev = deviceId()
  if (deviceName?.trim()) {
    dev.name = deviceName.trim().slice(0, 40)
    save('syncDevice', dev, true)
  }
  const test: SyncConf = { url: p.url, key: p.key, fp: p.fp, pem, server: p.name, device: dev, enabled: true, rev: 0, groups: { ...DEFAULT_GROUPS }, pairedAt: Date.now() }
  net.resetTransport()
  const r = await net.request({ url: test.url, key: test.key, device: dev.id, fp: test.fp, pem }, 'GET', '/api/state', undefined, 20_000)
  if (r.status == 401) throw new Error('密钥不对：配对码可能已经过期（服务器换过密钥）')
  if (r.status == 429) throw new Error(r.json?.error ?? '尝试次数太多，请稍后再试')
  if (r.status != 200 || r.json?.app != 'veya-sync') throw new Error(`这个地址不是 Veya Sync 服务器（返回 ${r.status}）`)
  stopAll()
  // 换了服务器：之前的同步状态作废，按第一次同步处理（两边的数据合并，不会丢）
  const sameServer = conf && conf.url == test.url && conf.store == r.json.store
  if (!sameServer) {
    mirror.clear()
    outbox.clear()
  } else {
    test.store = conf!.store
    test.rev = conf!.rev
    test.groups = conf!.groups
    test.synced = conf!.synced
  }
  test.store ??= r.json.store
  if (r.json.name) test.server = r.json.name
  conf = test
  if (r.json.time) offset = r.json.time - Date.now()
  saveConf()
  saveMirror(true)
  state.error = ''
  startAll()
  emitState()
  return getState()
}

export const unpair = () => {
  stopAll()
  conf = null
  save('sync', null, true)
  mirror.clear()
  outbox.clear()
  saveMirror(true)
  state.error = ''
  emitState()
}

export const setEnabled = (enabled: boolean) => {
  if (!conf) return getState()
  conf.enabled = enabled
  saveConf()
  if (enabled) startAll()
  else stopAll()
  emitState()
  return getState()
}

export const setGroups = (groups: Partial<Record<Group, boolean>>) => {
  if (!conf) return getState()
  const turnedOn = Object.entries(groups).some(([g, v]) => v && !conf!.groups[g as Group])
  conf.groups = { ...conf.groups, ...groups }
  // 新打开的一类数据：从头拉一遍（之前跳过了它的记录）
  if (turnedOn) conf.rev = 0
  saveConf()
  saveMirror(true)
  void kick()
  emitState()
  return getState()
}

export const setDeviceName = (name: string) => {
  const dev = deviceId()
  dev.name = String(name ?? '').trim().slice(0, 40) || dev.name
  save('syncDevice', dev, true)
  if (conf) {
    conf.device = dev
    saveConf()
    socket?.close()
    socket = null
    connect()
  }
  emitState()
  return getState()
}

export const syncNow = async() => {
  if (!conf) throw new Error('还没有配对同步服务器')
  if (!state.online) connect()
  await kick(true)
  if (state.error) throw new Error(state.error)
  return getState()
}

/** 重新生成配对码（给手机扫码用，里面有密钥，只在用户点开时显示） */
export const pairCode = () => {
  if (!conf) throw new Error('还没有配对同步服务器')
  const p: any = { u: conf.url, k: conf.key }
  if (conf.fp) p.f = conf.fp
  if (conf.server) p.n = conf.server
  return 'veya1.' + Buffer.from(JSON.stringify(p)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 上报「正在播放」 */
export const sendNowPlaying = (st: any) => { socket?.send({ type: 'np', state: st }) }
/** 给别的设备发指令（to = 设备 id，* = 所有在线设备） */
export const sendCommand = (to: string, cmd: string, data: any) => {
  if (!socket || !state.online) throw new Error('还没有连上同步服务器')
  const id = Math.random().toString(36).slice(2)
  socket.send({ type: 'cmd', to, cmd, data, id })
  return id
}
export const forgetDevice = (id: string) => { socket?.send({ type: 'forget', to: id }) }
/** 服务器时间（毫秒），一起听对拍子用 */
export const serverNow = () => now()
export const clockInfo = () => ({ offset, rtt: lastRtt })
