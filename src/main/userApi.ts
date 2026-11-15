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
}

const runtimes = new Map<string, Runtime>()
const initResolvers = new Map<number, { id: string, done: (ok: boolean, msg: string, info?: any) => void }>()
let onChange: () => void = () => {}
export const setOnChange = (fn: () => void) => { onChange = fn }

const IDLE_CLOSE_MS = 10 * 60_000
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

export const importScript = (script: string, fileName = '') => {
  if (script.length > 9_000_000) throw new Error('脚本文件过大')
  // 很多音源脚本经过混淆，无法靠文本特征判断；是否可用以初始化结果为准
  if (script.trim().length < 50) throw new Error('脚本内容为空')
  const hash = crypto.createHash('md5').update(script).digest('hex').slice(0, 12)
  const list = getList()
  const meta = parseMeta(script, fileName.replace(/\.js$/i, '') || '未命名音源')
  const exist = list.find(m => m.id == hash || m.name == meta.name)
  if (exist) {
    // 同名脚本视为更新
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
  rt.idleTimer = setTimeout(() => { void unload(id) }, IDLE_CLOSE_MS)
}

const loadScript = (meta: SourceMeta): Runtime => {
  const exist = runtimes.get(meta.id)
  if (exist) return exist

  const rt: Runtime = { win: null, status: 'loading', message: '', init: Promise.resolve(), pending: new Map(), idleTimer: null }
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
    item.updateAlert = { log: String(data.log ?? ''), updateUrl: data.updateUrl }
    saveList(list)
  })
}

/** 预热首选音源，减少第一首歌的等待 */
export const warmup = () => {
  const first = getList().find(m => m.enabled)
  if (first) loadScript(first)
}

/** 确保脚本已初始化；成功返回空字符串，失败返回原因 */
export const ensure = async(id: string) => {
  const meta = getList().find(m => m.id == id)
  if (!meta) return '音源不存在'
  const rt = loadScript(meta)
  await rt.init
  return rt.status == 'ready' ? '' : (rt.message || '初始化失败')
}

export const reload = async(id: string) => {
  await unload(id)
  const meta = getList().find(m => m.id == id)
  if (!meta || !meta.enabled) return
  await loadScript(meta).init
}

export const request = async(id: string, data: { source: string, action: string, info: any }, timeout = 20_000) => {
  const meta = getList().find(m => m.id == id)
  if (!meta) throw new Error('音源不存在')
  const rt = loadScript(meta)
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
