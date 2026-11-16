// 手机版的代理设置：交给原生层（OkHttp 和播放器共用同一个网络客户端）
// 跟随系统 = 用系统 WLAN 里设置的代理；全部直连；固定端口（只有检查更新走 / 全部走）
import { load } from '../../main/store'
import { call } from '../native'

export interface ProxyConf { mode: 'system' | 'direct' | 'custom', host: string, port: number, scope: 'update' | 'all' }

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

/** 页面里的代码不直接连代理（原生层负责） */
export const nodeProxy = (): { host: string, port: number } | null => null
export const agentFor = (_url: string) => undefined

let notice: (text: string, type: 'error' | 'success') => void = () => {}
export const setProxyHandlers = (_onNodeChange: () => void, onNotice: (text: string, type: 'error' | 'success') => void) => { notice = onNotice }

let lastKey = ''
export const applyProxy = async() => {
  const c = proxyConf()
  const key = JSON.stringify(c)
  if (key == lastKey) return
  lastKey = key
  try {
    await call('net.proxy', c)
  } catch (err: any) {
    notice(`代理设置失败：${err?.message ?? err}`, 'error')
  }
}
