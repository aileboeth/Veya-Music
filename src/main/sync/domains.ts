// 同步的数据范围：每一类数据怎样变成同步记录（project），以及收到别的设备的记录后怎样写回本地（apply）
//
// 记录键：
//   L/<歌单id>                 歌单信息 { n 名称, c 创建时间, src/sid 来源, rm 删掉的歌, p 排序位置 }
//   S/<歌单id>/<歌曲id>        歌单里的一首歌 { s 歌曲, p 排序位置 }
//   T/<设备id>/<歌曲id>        某台设备上一首歌的听歌统计（每台设备只写自己的，推荐时加在一起）
//   D/<歌曲id>  DS/<歌手>      不喜欢的歌 / 歌手
//   H                          搜索历史        Y   每日推荐（同一天各设备看到同一份）
//   G/<设置项>                 设置（只同步和设备无关的几项）
//   U/<音源id>  X/<音源id>     音源脚本的信息 / 脚本内容
import { load, save } from '../store'
import * as userApi from '../userApi'
import { assignPositions, dec, enc, hashOf, sortByPositions } from './util'

export type Group = 'lists' | 'history' | 'sources' | 'settings'
export interface Change { k: string, v: any }
export interface Ctx {
  device: string
  /** 记录在镜像里的位置值（没有 / 已删除 = undefined） */
  pos(k: string): number | undefined
}
export interface ProjEntry { v: any, h?: string }
export interface Domain {
  id: string
  group: Group
  prefixes: string[]
  storeKeys: string[]
  project(ctx: Ctx): Map<string, ProjEntry>
  /**
   * 这条记录是不是本机「管」的（project 只会生成这些）。不填 = 这一类的记录都归本机管。
   * 听歌统计每台设备只写自己的：别的设备的记录不在 project 里，但不能当成本机删掉了
   */
  owns?(ctx: Ctx, k: string): boolean
  /** 返回改动过的本地数据键（用来通知界面重新读取） */
  apply(ctx: Ctx, changes: Change[]): string[]
}

const isObj = (v: any) => v && typeof v == 'object' && !Array.isArray(v)

// ---------------- 歌单 ----------------
const listKey = (id: string) => `L/${enc(id)}`
const songKey = (listId: string, songId: string) => `S/${enc(listId)}/${enc(songId)}`

const lists: Domain = {
  id: 'lists',
  group: 'lists',
  prefixes: ['L/', 'S/'],
  storeKeys: ['lists'],
  project(ctx) {
    const out = new Map<string, ProjEntry>()
    const all = load<any[]>('lists', []) ?? []
    const valid = all.filter(l => l && typeof l.id == 'string')
    const lp = assignPositions(valid.map(l => l.id), new Map(valid.map(l => [l.id, ctx.pos(listKey(l.id))]).filter(([, p]) => p !== undefined) as Array<[string, number]>))
    for (const l of valid) {
      out.set(listKey(l.id), { v: { n: String(l.name ?? ''), c: l.createdAt ?? 0, src: l.source || undefined, sid: l.sourceListId || undefined, rm: l.removed?.length ? l.removed : undefined, p: lp.get(l.id) } })
      const seen = new Set<string>()
      const songs = (l.songs ?? []).filter((s: any) => s?.id && !seen.has(s.id) && seen.add(s.id))
      const ids = songs.map((s: any) => s.id as string)
      const old = new Map<string, number>()
      for (const id of ids) {
        const p = ctx.pos(songKey(l.id, id))
        if (p !== undefined) old.set(id, p)
      }
      const sp = assignPositions(ids, old)
      for (const s of songs) {
        const { _reason, _playedAt, ...song } = s
        out.set(songKey(l.id, s.id), { v: { s: song, p: sp.get(s.id) } })
      }
    }
    return out
  },
  apply(ctx, changes) {
    const all = load<any[]>('lists', []) ?? []
    const byId = new Map<string, any>(all.filter(l => l?.id).map(l => [l.id, l]))
    const order: string[] = all.filter(l => l?.id).map(l => l.id)
    const touched = new Set<string>()
    let reorder = false
    // 先处理歌单信息，再处理歌曲（新歌单的歌和歌单信息常常在同一批里）
    const sorted = [...changes].sort((a, b) => (a.k[0] == 'L' ? 0 : 1) - (b.k[0] == 'L' ? 0 : 1))
    for (const { k, v } of sorted) {
      if (k.startsWith('L/')) {
        const id = dec(k.slice(2))
        if (v == null) {
          if (id != 'love' && byId.delete(id)) reorder = true
          continue
        }
        let l = byId.get(id)
        if (!l) {
          l = { id, name: '', songs: [] }
          byId.set(id, l)
          order.push(id)
        }
        l.name = String(v.n ?? l.name)
        if (v.c) l.createdAt = v.c
        if (v.src) l.source = v.src
        else delete l.source
        if (v.sid) l.sourceListId = v.sid
        else delete l.sourceListId
        if (Array.isArray(v.rm) && v.rm.length) l.removed = v.rm
        else delete l.removed
        reorder = true
      } else if (k.startsWith('S/')) {
        const [lidEnc, sidEnc] = k.slice(2).split('/')
        const l = byId.get(dec(lidEnc))
        if (!l) continue
        const sid = dec(sidEnc)
        l.songs ??= []
        const idx = l.songs.findIndex((s: any) => s.id == sid)
        if (v == null) {
          if (idx > -1) l.songs.splice(idx, 1)
        } else if (isObj(v.s)) {
          const song = { ...v.s, id: sid }
          if (idx > -1) l.songs[idx] = song
          else l.songs.push(song)
        }
        touched.add(l.id)
      }
    }
    for (const id of touched) {
      const l = byId.get(id)
      if (l) l.songs = sortByPositions(l.songs, (s: any) => ctx.pos(songKey(id, s.id)))
    }
    if (!touched.size && !reorder) return []
    let result = order.filter((id, i) => byId.has(id) && order.indexOf(id) == i).map(id => byId.get(id))
    result = sortByPositions(result, l => ctx.pos(listKey(l.id)))
    if (!result.some(l => l.id == 'love')) result.unshift({ id: 'love', name: '我喜欢', songs: [], createdAt: Date.now() })
    save('lists', result)
    return ['lists']
  },
}

// ---------------- 听歌统计 ----------------
const stats: Domain = {
  id: 'stats',
  group: 'history',
  prefixes: ['T/'],
  storeKeys: ['stats'],
  project(ctx) {
    const out = new Map<string, ProjEntry>()
    const st = load<any>('stats', { songs: {}, recent: [] })
    for (const [id, s] of Object.entries<any>(st?.songs ?? {})) out.set(`T/${enc(ctx.device)}/${enc(id)}`, { v: s })
    return out
  },
  owns: (ctx, k) => k.startsWith(`T/${enc(ctx.device)}/`),
  apply(ctx, changes) {
    const remote = load<Record<string, Record<string, any>>>('statsRemote', {}) ?? {}
    let own: any = null
    for (const { k, v } of changes) {
      const [devEnc, idEnc] = k.slice(2).split('/')
      const dev = dec(devEnc)
      const id = dec(idEnc)
      if (dev == ctx.device) {
        // 自己以前写的记录（例如重装后用同一个设备 id）：本地没有的才补回来
        own ??= load<any>('stats', { songs: {}, recent: [] })
        if (v && !own.songs[id]) own.songs[id] = v
        continue
      }
      if (v == null) {
        if (remote[dev]) delete remote[dev][id]
      } else (remote[dev] ??= {})[id] = v
    }
    save('statsRemote', remote)
    if (own) save('stats', own)
    return ['stats']
  },
}

// ---------------- 不喜欢 / 搜索历史 / 每日推荐 ----------------
const dislikes: Domain = {
  id: 'dislikes',
  group: 'history',
  prefixes: ['D/', 'DS/'],
  storeKeys: ['dislikes'],
  project() {
    const out = new Map<string, ProjEntry>()
    const d = load<any>('dislikes', { songs: {}, singers: [] }) ?? {}
    for (const [id, info] of Object.entries<any>(d.songs ?? {})) out.set(`D/${enc(id)}`, { v: isObj(info) ? info : { id } })
    for (const name of d.singers ?? []) if (name) out.set(`DS/${enc(name)}`, { v: 1 })
    return out
  },
  apply(_ctx, changes) {
    const d = load<any>('dislikes', { songs: {}, singers: [] }) ?? {}
    d.songs ??= {}
    d.singers ??= []
    for (const { k, v } of changes) {
      if (k.startsWith('DS/')) {
        const name = dec(k.slice(3))
        d.singers = d.singers.filter((s: string) => s != name)
        if (v != null) d.singers.push(name)
      } else {
        const id = dec(k.slice(2))
        if (v == null) delete d.songs[id]
        else d.songs[id] = v
      }
    }
    save('dislikes', d)
    return ['dislikes']
  },
}

const single = (id: string, key: string, storeKey: string, group: Group): Domain => ({
  id,
  group,
  prefixes: [key],
  storeKeys: [storeKey],
  project() {
    const v = load<any>(storeKey, null)
    const out = new Map<string, ProjEntry>()
    if (v != null && !(Array.isArray(v) && !v.length)) out.set(key, { v })
    return out
  },
  apply(_ctx, changes) {
    const last = changes.filter(c => c.k == key).pop()
    if (!last) return []
    save(storeKey, last.v ?? (storeKey == 'searchHistory' ? [] : null))
    return [storeKey]
  },
})

// ---------------- 设置 ----------------
/** 只同步和设备无关的设置；窗口、代理、下载目录、音量、播放页布局这类每台设备各自保留 */
export const SYNCED_SETTINGS = ['theme', 'quality', 'playMode', 'autoContinue', 'autoSwitchSource', 'sourceOrder', 'showTranslation', 'downloadQuality', 'downloadLyric', 'nowPlaying.visual', 'desktopLyric.color', 'desktopLyric.effect']
const getPath = (o: any, path: string) => path.split('.').reduce((x, k) => x?.[k], o)
const setPath = (o: any, path: string, v: any) => {
  const ks = path.split('.')
  let x = o
  for (const k of ks.slice(0, -1)) x = isObj(x[k]) ? x[k] : (x[k] = {})
  if (v === null || v === undefined) delete x[ks[ks.length - 1]]
  else x[ks[ks.length - 1]] = v
}
const settingsDomain: Domain = {
  id: 'settings',
  group: 'settings',
  prefixes: ['G/'],
  storeKeys: ['settings'],
  project() {
    const s = load<any>('settings', {}) ?? {}
    const out = new Map<string, ProjEntry>()
    for (const p of SYNCED_SETTINGS) {
      const v = getPath(s, p)
      if (v !== undefined && v !== null) out.set(`G/${p}`, { v })
    }
    return out
  },
  apply(_ctx, changes) {
    const s = load<any>('settings', {}) ?? {}
    for (const { k, v } of changes) {
      const p = k.slice(2)
      if (SYNCED_SETTINGS.includes(p)) setPath(s, p, v)
    }
    save('settings', s)
    return ['settings']
  },
}

// ---------------- 音源脚本 ----------------
const scriptCache = new Map<string, { sig: string, text: string, h: string }>()
const sourcesDomain: Domain = {
  id: 'sources',
  group: 'sources',
  prefixes: ['U/', 'X/'],
  storeKeys: ['sources'],
  project(ctx) {
    const out = new Map<string, ProjEntry>()
    const list = userApi.getList()
    const pos = assignPositions(list.map(m => m.id), new Map(list.map(m => [m.id, ctx.pos(`U/${enc(m.id)}`)]).filter(([, p]) => p !== undefined) as Array<[string, number]>))
    for (const m of list) {
      const file = userApi.scriptFileInfo(m.id)
      if (!file) continue
      out.set(`U/${enc(m.id)}`, { v: { name: m.name, description: m.description, version: m.version, author: m.author, homepage: m.homepage, enabled: m.enabled, addedAt: m.addedAt, p: pos.get(m.id) } })
      // 脚本可能有好几 MB：按文件大小 + 修改时间缓存内容和哈希
      const sig = `${file.size}_${file.mtimeMs}`
      let c = scriptCache.get(m.id)
      if (!c || c.sig != sig) {
        const text = userApi.readScript(m.id)
        if (text == null) continue
        c = { sig, text, h: hashOf(text) }
        scriptCache.set(m.id, c)
      }
      out.set(`X/${enc(m.id)}`, { v: c.text, h: c.h })
    }
    return out
  },
  apply(ctx, changes) {
    const list = userApi.getList()
    // 先写脚本内容，再处理信息（新音源两条记录一起到）
    const sorted = [...changes].sort((a, b) => (a.k[0] == 'X' ? 0 : 1) - (b.k[0] == 'X' ? 0 : 1))
    for (const { k, v } of sorted) {
      const id = dec(k.slice(2))
      if (!/^[\w-]{1,64}$/.test(id)) continue
      if (k.startsWith('X/')) {
        if (typeof v == 'string' && v.length < 9_000_000) userApi.writeRemoteScript(id, v)
        continue
      }
      const idx = list.findIndex(m => m.id == id)
      if (v == null) {
        if (idx > -1) {
          list.splice(idx, 1)
          userApi.deleteScriptFile(id)
        }
        continue
      }
      if (!userApi.scriptFileInfo(id)) continue // 脚本内容还没到（或者太大被拒绝）
      const meta = { name: String(v.name ?? ''), description: String(v.description ?? ''), version: String(v.version ?? ''), author: String(v.author ?? ''), homepage: String(v.homepage ?? ''), enabled: v.enabled !== false, addedAt: v.addedAt ?? Date.now() }
      if (idx > -1) {
        const wasEnabled = list[idx].enabled
        Object.assign(list[idx], meta)
        if (wasEnabled && !meta.enabled) userApi.unloadScript(id)
      } else list.push({ id, ...meta })
    }
    const next = sortByPositions(list, m => ctx.pos(`U/${enc(m.id)}`))
    list.splice(0, list.length, ...next)
    userApi.saveSourceList(list)
    return ['sources']
  },
}

export const DOMAINS: Domain[] = [
  lists,
  stats,
  dislikes,
  single('search', 'H', 'searchHistory', 'history'),
  single('daily', 'Y', 'daily', 'history'),
  settingsDomain,
  sourcesDomain,
]

export const domainOfKey = (k: string) => DOMAINS.find(d => d.prefixes.some(p => p.endsWith('/') ? k.startsWith(p) : k == p))
