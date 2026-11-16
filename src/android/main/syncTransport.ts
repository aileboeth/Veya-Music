// 手机版的同步网络层：请求和 WebSocket 都由原生层（OkHttp）发出，自签名证书按指纹固定
import { N, call, newId, onNative } from '../native'
import { httpRaw } from '../http'

export interface TransportConf { url: string, key: string, device: string, fp?: string, pem?: string }
export interface Resp { status: number, json: any }
export interface Socket { send(obj: any): void, close(): void }

/** 先只做 TLS 握手核对证书指纹（不发送任何数据），通过后返回证书 */
export const fetchPinnedCert = async(url: string, fp: string) => {
  const r = await call<{ pem: string }>('sync.cert', { url, fp })
  return r.pem
}

export const request = async(c: TransportConf, method: string, path: string, body?: any, timeout = 60_000): Promise<Resp> => {
  let r
  try {
    r = await httpRaw({
      url: c.url + path,
      method,
      headers: {
        Authorization: `Bearer ${c.key}`,
        'X-Veya-Device': c.device,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      timeout,
      follow: false,
      pin: c.fp,
    })
  } catch (err: any) {
    const msg = String(err?.message ?? err)
    throw new Error(/指纹/.test(msg) ? msg : `连不上同步服务器：${msg}`)
  }
  let json: any = null
  try { json = JSON.parse(Buffer.from(r.body, 'base64').toString('utf8')) } catch {}
  return { status: r.status, json }
}

const sockets = new Map<string, { onOpen: () => void, onMessage: (m: any) => void, onClose: (r: string) => void }>()
onNative('ws', (e: any) => {
  const s = sockets.get(e?.id)
  if (!s) return
  if (e.type == 'open') s.onOpen()
  else if (e.type == 'message') {
    try { s.onMessage(JSON.parse(e.data)) } catch {}
  } else if (e.type == 'close') {
    sockets.delete(e.id)
    s.onClose(e.reason || '连接断开')
  }
})

export const openSocket = (c: TransportConf, onOpen: () => void, onMessage: (msg: any) => void, onClose: (reason: string) => void): Socket => {
  const id = newId('ws')
  let closed = false
  sockets.set(id, { onOpen, onMessage, onClose: r => { if (!closed) { closed = true; onClose(r) } } })
  void call('ws.open', { id, url: c.url.replace(/^http/, 'ws') + '/ws', pin: c.fp }).catch(err => {
    sockets.delete(id)
    if (!closed) {
      closed = true
      onClose(String(err?.message ?? err))
    }
  })
  return {
    send: obj => { N.wsSend(id, JSON.stringify(obj)) },
    close: () => {
      if (closed) return
      closed = true
      sockets.delete(id)
      N.wsClose(id)
      onClose('closed')
    },
  }
}

export const resetTransport = () => {}
