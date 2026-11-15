// 网络代理设置：跟随系统 / 全部直连 / 固定端口
// Chromium 侧（音频播放、封面、检查更新）用 session.setProxy；Node 侧（搜索接口、音源脚本、下载）用 tunnel agent
import { session } from 'electron'
import net from 'net'
import { httpOverHttp, httpsOverHttp } from 'tunnel'
import { load } from './store'
import { proxy as sdkProxy } from './lx/utils/request'

export interface ProxyConf {
  mode: 'system' | 'direct' | 'custom'
  host: string
  port: number
  /** 固定端口的作用范围：update = 只有检查更新走代理（音乐直连），all = 全部网络 */
  scope: 'update' | 'all'
}

export const proxyConf = (): ProxyConf => {
  const p = load<any>('settings', {}).proxy ?? {}
  const port = Math.floor(Number(p.port))
  const host = String(p.host ?? '').trim()
  return {
    mode: p.mode == 'direct' || p.mode == 'custom' ? p.mode : 'system',
    host: /^[\w.-]{1,100}$/.test(host) ? host : '127.0.0.1',
    port: port > 0 && port < 65536 ? port : 7890,
    scope: p.scope == 'all' ? 'all' : 'update',
  }
}

/** 「跟随系统」时探测到的 Windows 系统代理（没开就是 null） */
let systemProxy: { host: string, port: number } | null = null
/** 「固定端口」但端口连不上：临时按直连处理，恢复后自动切回 */
let customDown = false

/** Node 侧请求使用的代理；不需要走代理时返回 null */
export const nodeProxy = () => {
  const c = proxyConf()
  if (c.mode == 'system') return systemProxy
  if (c.mode == 'custom' && c.scope == 'all' && !customDown) return { host: c.host, port: c.port }
  return null
}

export const agentFor = (url: string) => {
  const p = nodeProxy()
  if (!p) return undefined
  return (/^https:/.test(url) ? httpsOverHttp : httpOverHttp)({ proxy: p })
}

let confKey = ''
let sessionKey = ''
let onNodeProxyChange: () => void = () => {}
let notice: (text: string, type: 'error' | 'success') => void = () => {}
export const setProxyHandlers = (onNodeChange: () => void, onNotice: (text: string, type: 'error' | 'success') => void) => {
  onNodeProxyChange = onNodeChange
  notice = onNotice
}

const tcpAlive = (host: string, port: number) => new Promise<boolean>(resolve => {
  const socket = net.connect({ host, port })
  const done = (ok: boolean) => { socket.destroy(); resolve(ok) }
  socket.setTimeout(1500, () => done(false))
  socket.once('connect', () => done(true))
  socket.once('error', () => done(false))
})

const detectSystemProxy = async() => {
  try {
    const m = /^PROXY ([\w.-]+):(\d+)/.exec(await session.defaultSession.resolveProxy('https://example.com/'))
    return m ? { host: m[1], port: Number(m[2]) } : null
  } catch { return null }
}

const sync = async() => {
  const c = proxyConf()
  const first = !sessionKey
  const key = JSON.stringify([c, customDown])
  if (key != sessionKey) {
    sessionKey = key
    const fixed = { mode: 'fixed_servers' as const, proxyRules: `http://${c.host}:${c.port}`, proxyBypassRules: '<local>' }
    const direct = { mode: 'direct' as const }
    const system = { mode: 'system' as const }
    const custom = c.mode == 'custom' && !customDown
    const forUpdate = custom ? fixed : c.mode == 'system' ? system : direct
    const forMusic = custom && c.scope == 'all' ? fixed : c.mode == 'system' ? system : direct
    const set = async(ses: Electron.Session, conf: Electron.ProxyConfig) => {
      try {
        await ses.setProxy(conf)
        if (!first) await ses.closeAllConnections()
      } catch (err) {
        console.error('[proxy]', err)
      }
    }
    await Promise.all([
      set(session.defaultSession, forMusic),
      set(session.fromPartition('electron-updater', { cache: false }), forUpdate),
    ])
  }
  systemProxy = c.mode == 'system' ? await detectSystemProxy() : null

  const node = nodeProxy()
  const host = node?.host ?? ''
  const port = String(node?.port ?? '')
  if (sdkProxy.host == host && String(sdkProxy.port) == port) return
  sdkProxy.host = host
  sdkProxy.port = port
  // 音源脚本在启动时拿到代理配置：关掉它们，下次用到时按新配置重新启动
  if (!first) onNodeProxyChange()
}

/** 定时检查：系统代理有没有开/关、固定端口还通不通 */
const check = async() => {
  const c = proxyConf()
  if (c.mode == 'custom') {
    const down = !await tcpAlive(c.host, c.port)
    if (down != customDown) {
      customDown = down
      if (down) notice(`代理 ${c.host}:${c.port} 连不上，已临时改为直连。请确认代理软件已经打开`, 'error')
      else notice(`代理 ${c.host}:${c.port} 已恢复`, 'success')
    }
  }
  await sync()
}

let timer: NodeJS.Timeout | null = null
/** 按当前设置应用代理；设置没变时什么都不做 */
export const applyProxy = async() => {
  const key = JSON.stringify(proxyConf())
  if (key == confKey) return
  const first = !confKey
  confKey = key
  customDown = false
  await sync()
  if (first) {
    setTimeout(() => void check(), 5000)
    timer ??= setInterval(() => void check(), 60_000)
  } else void check()
}
