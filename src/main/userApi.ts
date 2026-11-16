// 音源脚本管理：每个脚本运行在独立的隐藏窗口里（无 Node 权限的页面世界 + 受控的 lx API）
import { BrowserWindow, ipcMain, session } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { dataDir, load, save } from './store'
import { nodeProxy } from './net'

export interface SourceMeta {
  id: string
  name: string
  description: string
  version: string
  author: string
  homepage: string
  enabled: boolean
  addedAt: number
  /** 脚本初始化后上报的支持情况：{ kw: { actions, qualitys } } */
  sources?: Record<string, { actions: string[], qualitys: string[] }>
  updateAlert?: { log: string, updateUrl?: string }
}

interface Runtime {
  win: BrowserWindow | null
  status: 'loading' | 'ready' | 'failed'
  message: string
  init: Promise<void>
  pending: Map<string, { resolve: (v: any) => void, reject: (e: Error) => void, timer: NodeJS.Timeout }>
  idleTimer: NodeJS.Timeout | null
  /** 只是为了检查更新 / 测速临时启动的：用完很快关掉，不占内存 */
  transient: boolean
}

const runtimes = new Map<string, Runtime>()
const initResolvers = new Map<number, { id: string, done: (ok: boolean, msg: string, info?: any) => void }>()
let onChange: () => void = () => {}
export const setOnChange = (fn: () => void) => { onChange = fn }

const IDLE_CLOSE_MS = 10 * 60_000
const TRANSIENT_CLOSE_MS = 15_000
const HTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>User api</title></head><body></body></html>'

const sourcesDir = () => {
  const dir = path.join(dataDir(), 'sources')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
const scriptPath = (id: string) => path.join(sourcesDir(), `${id}.js`)

export const getList = (): SourceMeta[] => load<SourceMeta[]>('sources', [])
const saveList = (list: SourceMeta[]) => {
  save('sources', list)
  onChange()
}

export const getStatusList = () => getList().map(m => {
  const rt = runtimes.get(m.id)
  return { ...m, status: rt ? rt.status : (m.enabled ? 'idle' : 'disabled'), message: rt?.message ?? '' }
})

const parseMeta = (script: string, fallbackName: string) => {
  const head = /^\s*\/\*[\s\S]+?\*\//.exec(script)?.[0] ?? script.slice(0, 2000)
  const pick = (key: string, max: number) => {
    const m = new RegExp(`@${key}\\s+(.+)`).exec(head)
    return (m?.[1] ?? '').trim().slice(0, max)
  }
  return {
    name: pick('name', 60) || fallbackName.slice(0, 60),
    description: pick('description', 200),
    version: pick('version', 30),
    author: pick('author', 60),
    homepage: /^https?:\/\//.test(pick('homepage', 1024)) ? pick('homepage', 1024) : '',
  }
}

/** 比较脚本版本号（v3.2.15 / 1.7.17 / 7 这类）；有一边解析不出数字时返回 0 */
const compareVersion = (a: string, b: string) => {
  const pa = (a.match(/\d+/g) ?? []).map(Number)
  const pb = (b.match(/\d+/g) ?? []).map(Number)
  if (!pa.length || !pb.length) return 0
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) != (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

export const importScript = (script: string, fileName = '') => {
  if (script.length > 9_000_000) throw new Error('脚本文件过大')
  // 很多音源脚本经过混淆，无法靠文本特征判断；是否可用以初始化结果为准
  if (script.trim().length < 50) throw new Error('脚本内容为空')
  const hash = crypto.createHash('md5').update(script).digest('hex').slice(0, 12)
  const list = getList()
  const meta = parseMeta(script, fileName.replace(/\.js$/i, '') || '未命名音源')
  const exist = list.find(m => m.id == hash || m.name == meta.name)
  if (exist) {
    // 同名脚本视为更新；但不让旧版本覆盖掉已有的新版本（整个文件夹导入时常见）
    if (exist.id != hash && fs.existsSync(scriptPath(exist.id)) && compareVersion(meta.version, exist.version) < 0) {
      throw new Error(`已经有更新的版本 ${exist.version}，跳过了 ${meta.version}`)
    }
    void unload(exist.id)
    fs.writeFileSync(scriptPath(exist.id), script)
    Object.assign(exist, meta, { sources: undefined, updateAlert: undefined })
    saveList(list)
    return exist
  }
  const item: SourceMeta = { id: hash, ...meta, enabled: true, addedAt: Date.now() }
  fs.writeFileSync(scriptPath(item.id), script)
  list.push(item)
  saveList(list)
  return item
}

export const removeScript = async(id: string) => {
  await unload(id)
  try { fs.unlinkSync(scriptPath(id)) } catch {}
  saveList(getList().filter(m => m.id != id))
}

export const setEnabled = async(id: string, enabled: boolean) => {
  const list = getList()
  const item = list.find(m => m.id == id)
  if (!item) return
  item.enabled = enabled
  if (!enabled) await unload(id)
  saveList(list)
}

export const reorder = (ids: string[]) => {
  const list = getList()
  const map = new Map(list.map(m => [m.id, m]))
  const next = ids.map(id => map.get(id)).filter(Boolean) as SourceMeta[]
  for (const m of list) if (!ids.includes(m.id)) next.push(m)
  saveList(next)
}

const unload = async(id: string) => {
  const rt = runtimes.get(id)
  if (!rt) return
  runtimes.delete(id)
  if (rt.idleTimer) clearTimeout(rt.idleTimer)
  for (const p of rt.pending.values()) {
    clearTimeout(p.timer)
    p.reject(new Error('音源已卸载'))
  }
  rt.pending.clear()
  if (rt.win && !rt.win.isDestroyed()) rt.win.destroy()
  rt.win = null
  onChange()
}

const touchIdle = (id: string, rt: Runtime) => {
  if (rt.idleTimer) clearTimeout(rt.idleTimer)
  rt.idleTimer = setTimeout(() => {
    // 还有请求没回来就再等一轮
    if (rt.pending.size) touchIdle(id, rt)
    else void unload(id)
  }, rt.transient ? TRANSIENT_CLOSE_MS : IDLE_CLOSE_MS)
}

const loadScript = (meta: SourceMeta, transient = false): Runtime => {
  const exist = runtimes.get(meta.id)
  if (exist) {
    // 听歌要用到它了：转成常驻
    if (!transient && exist.transient) {
      exist.transient = false
      touchIdle(meta.id, exist)
    }
    return exist
  }

  const rt: Runtime = { win: null, status: 'loading', message: '', init: Promise.resolve(), pending: new Map(), idleTimer: null, transient }
  runtimes.set(meta.id, rt)

  rt.init = new Promise<void>((resolve) => {
    let script = ''
    try {
      script = fs.readFileSync(scriptPath(meta.id), 'utf8')
    } catch {
      rt.status = 'failed'
      rt.message = '脚本文件丢失'
      resolve()
      return
    }
    const win = new BrowserWindow({
      show: false,
      width: 300,
      height: 200,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        sandbox: false,
        spellcheck: false,
        webgl: false,
        images: false,
        disableDialogs: true,
        autoplayPolicy: 'document-user-activation-required',
        session: session.fromPartition('veya-userapi'),
        preload: path.join(__dirname, '../preload/userApi.js'),
      },
    })
    rt.win = win
    const wcId = win.webContents.id
    for (const eventName of ['will-navigate', 'will-redirect', 'will-attach-webview', 'will-prevent-unload', 'media-started-playing']) {
      win.webContents.on(eventName as any, (event: Electron.Event) => { event.preventDefault() })
    }
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const timer = setTimeout(() => finish(false, '初始化超时'), 25_000)
    const finish = (ok: boolean, msg: string, info?: any) => {
      if (!initResolvers.has(wcId)) return
      initResolvers.delete(wcId)
      clearTimeout(timer)
      rt.status = ok ? 'ready' : 'failed'
      rt.message = ok ? '' : (msg || '初始化失败')
      if (ok && info?.sources) {
        const list = getList()
        const item = list.find(m => m.id == meta.id)
        if (item) {
          item.sources = info.sources
          save('sources', list)
        }
      }
      onChange()
      resolve()
    }
    initResolvers.set(wcId, { id: meta.id, done: finish })
    win.on('closed', () => {
      finish(false, '窗口已关闭')
      if (runtimes.get(meta.id) === rt) void unload(meta.id)
    })

    win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(HTML)).then(() => {
      win.webContents.send('userApi:initEnv', {
        name: meta.name,
        description: meta.description,
        version: meta.version,
        author: meta.author,
        homepage: meta.homepage,
        script,
        proxy: { host: nodeProxy()?.host ?? '', port: nodeProxy()?.port ?? '' },
      })
    }).catch(err => finish(false, String(err?.message ?? err)))
  })
  touchIdle(meta.id, rt)
  // 初始化可能要十几秒：临时启动的从初始化完成开始计时
  void rt.init.then(() => { if (runtimes.get(meta.id) === rt) touchIdle(meta.id, rt) })
  onChange()
  return rt
}

const findBySender = (wcId: number) => {
  for (const [id, rt] of runtimes) {
    if (rt.win && !rt.win.isDestroyed() && rt.win.webContents.id == wcId) return { id, rt }
  }
  return null
}

export const initUserApi = () => {
  session.fromPartition('veya-userapi').setPermissionRequestHandler((_wc, _permission, callback) => { callback(false) })

  ipcMain.on('userApi:init', (event, { data, status, message }) => {
    initResolvers.get(event.sender.id)?.done(!!status, message ?? '', data)
  })
  ipcMain.on('userApi:response', (event, { data, status, message }) => {
    const found = findBySender(event.sender.id)
    if (!found || !data?.requestKey) return
    const p = found.rt.pending.get(data.requestKey)
    if (!p) return
    found.rt.pending.delete(data.requestKey)
    clearTimeout(p.timer)
    if (status) p.resolve(data.result)
    else p.reject(new Error(message || '请求失败'))
  })
  ipcMain.on('userApi:updateAlert', (event, { data }) => {
    const found = findBySender(event.sender.id)
    if (!found || !data) return
    const list = getList()
    const item = list.find(m => m.id == found.id)
    if (!item) return
    const isNew = item.updateAlert?.log != String(data.log ?? '')
    item.updateAlert = { log: String(data.log ?? ''), updateUrl: data.updateUrl }
    saveList(list)
    // 同一条提示只提醒一次
    if (isNew) onUpdateAlert(item.name)
  })
}

let onUpdateAlert: (name: string) => void = () => {}
export const setOnUpdateAlert = (fn: (name: string) => void) => { onUpdateAlert = fn }

/** 把所有启用的音源都启动一遍：脚本在启动时会自己检查新版本并上报（和 LX 的「音源更新提示」同一机制） */
let checking: Promise<void> | null = null
export const checkUpdates = () => {
  checking ??= (async() => {
    const ids = getList().filter(m => m.enabled).map(m => m.id)
    let i = 0
    await Promise.all(Array.from({ length: 3 }, async() => {
      while (i < ids.length) await ensure(ids[i++], true).catch(() => {})
    }))
    // 更新提示通常在初始化之后才发出，稍等一下
    await new Promise(resolve => setTimeout(resolve, 6000))
  })().finally(() => { checking = null })
  return checking
}

/** 把所有启用的音源都初始化一遍，刷新它们上报的「支持哪些平台」（升级后第一次播放汽水歌曲时用） */
let ensuring: Promise<void> | null = null
export const ensureAll = () => {
  ensuring ??= (async() => {
    const ids = getList().filter(m => m.enabled).map(m => m.id)
    let i = 0
    await Promise.all(Array.from({ length: 4 }, async() => {
      while (i < ids.length) await ensure(ids[i++], true).catch(() => {})
    }))
  })().finally(() => { ensuring = null })
  return ensuring
}

/**
 * 按脚本给出的更新地址更新：地址直接返回新脚本时就地替换；返回的是网页时交给调用方用浏览器打开
 */
export const updateFromUrl = async(id: string): Promise<{ updated: boolean, version?: string, url?: string }> => {
  const item = getList().find(m => m.id == id)
  const url = item?.updateAlert?.updateUrl
  if (!item || !url || !/^https?:\/\//.test(url)) throw new Error('这个音源没有提供更新地址')
  let text = ''
  try {
    const res = await session.defaultSession.fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (res.ok && !/text\/html/i.test(res.headers.get('content-type') ?? '')) text = await res.text()
  } catch {}
  const head = text.slice(0, 2000)
  if (!text || text.length > 9_000_000 || /^\s*</.test(head) || !/@name\s+\S/.test(head)) return { updated: false, url }
  const meta = parseMeta(text, '')
  if (meta.name != item.name) return { updated: false, url }
  let current = ''
  try { current = fs.readFileSync(scriptPath(item.id), 'utf8') } catch {}
  if (current.trim() == text.trim()) throw new Error('更新地址给出的脚本和现在用的完全一样，作者可能还没放出新版本')
  const next = importScript(text)
  const err = await ensure(next.id)
  if (err) throw new Error(`新版本 ${next.version} 已导入，但初始化失败：${err}`)
  return { updated: true, version: next.version }
}

/** 预热首选音源，减少第一首歌的等待 */
export const warmup = () => {
  const first = getList().find(m => m.enabled)
  if (first) loadScript(first)
}

/** 确保脚本已初始化；成功返回空字符串，失败返回原因 */
export const ensure = async(id: string, transient = false) => {
  const meta = getList().find(m => m.id == id)
  if (!meta) return '音源不存在'
  const rt = loadScript(meta, transient)
  await rt.init
  return rt.status == 'ready' ? '' : (rt.message || '初始化失败')
}

export const reload = async(id: string) => {
  await unload(id)
  const meta = getList().find(m => m.id == id)
  if (!meta || !meta.enabled) return
  await loadScript(meta).init
}

export const request = async(id: string, data: { source: string, action: string, info: any }, timeout = 20_000, transient = false) => {
  const meta = getList().find(m => m.id == id)
  if (!meta) throw new Error('音源不存在')
  const rt = loadScript(meta, transient)
  await rt.init
  if (rt.status != 'ready' || !rt.win || rt.win.isDestroyed()) throw new Error(rt.message || '音源初始化失败')
  touchIdle(id, rt)
  const requestKey = `request__${Math.random().toString().substring(2)}`
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      rt.pending.delete(requestKey)
      reject(new Error('音源请求超时'))
    }, timeout)
    rt.pending.set(requestKey, { resolve, reject, timer })
    rt.win!.webContents.send('userApi:request', { requestKey, data })
  })
}

export const closeAll = () => {
  for (const id of [...runtimes.keys()]) void unload(id)
}
