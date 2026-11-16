// 电脑版的同步网络层：HTTPS 请求 + WebSocket。
// 自签名证书按配对码里的指纹固定：第一次连接只读证书（不发任何数据）核对指纹，之后用这张证书当作唯一信任的根证书。
import https from 'https'
import http from 'http'
import tls from 'tls'
import crypto from 'crypto'
import WebSocket from 'ws'
import { httpOverHttp, httpsOverHttp } from 'tunnel'
import { nodeProxy } from '../net'

export interface TransportConf { url: string, key: string, device: string, fp?: string, pem?: string }
export interface Resp { status: number, json: any }
export interface Socket { send(obj: any): void, close(): void }

const fpOfDer = (der: Buffer) => crypto.createHash('sha256').update(der).digest('base64url')
const derToPem = (der: Buffer) => `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n').trim()}\n-----END CERTIFICATE-----\n`

const parse = (url: string) => {
  const u = new URL(url)
  return { u, secure: u.protocol == 'https:', host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port) || (u.protocol == 'https:' ? 443 : 80) }
}

const pinCheck = (fp: string) => (_host: string, cert: tls.PeerCertificate) =>
  cert?.raw && fpOfDer(cert.raw) == fp ? undefined : new Error('服务器证书和配对码里的指纹对不上')

/** 按配对码里的地址读出服务器证书并核对指纹；成功返回 PEM（以后只信任这一张） */
export const fetchPinnedCert = (url: string, fp: string): Promise<string> => new Promise((resolve, reject) => {
  const { secure, host, port, u } = parse(url)
  if (!secure) return reject(new Error('带证书指纹的地址必须是 https'))
  const proxy = nodeProxy()
  const done = (der: Buffer | undefined) => {
    if (!der?.length) return reject(new Error('没有读到服务器证书'))
    if (fpOfDer(der) != fp) return reject(new Error('服务器证书和配对码里的指纹对不上（地址填错了，或者连接被拦截）'))
    resolve(derToPem(der))
  }
  if (proxy) {
    // 经过代理：用不校验证书的通道请求一个公开接口，只为读到证书
    const agent = httpsOverHttp({ proxy, rejectUnauthorized: false } as any)
    const req = https.request({ host, port, path: '/api/info', method: 'GET', agent, timeout: 12_000, rejectUnauthorized: false }, res => {
      const der = (res.socket as tls.TLSSocket).getPeerCertificate?.()?.raw
      res.resume()
      done(der)
    })
    req.on('timeout', () => req.destroy(new Error('连接服务器超时')))
    req.on('error', reject)
    req.end()
    return
  }
  const sock = tls.connect({ host, port, servername: /[a-z]/i.test(host) ? host : undefined, rejectUnauthorized: false, timeout: 12_000 }, () => {
    const der = sock.getPeerCertificate()?.raw
    sock.end()
    done(der)
  })
  sock.on('timeout', () => { sock.destroy(); reject(new Error(`连接 ${u.host} 超时`)) })
  sock.on('error', err => reject(new Error(`连不上 ${u.host}：${(err as any).code ?? err.message}`)))
})

const agentFor = (c: TransportConf) => {
  const { secure } = parse(c.url)
  const proxy = nodeProxy()
  const pinned = secure && c.fp && c.pem ? { ca: c.pem, checkServerIdentity: pinCheck(c.fp) } : {}
  if (proxy) return (secure ? httpsOverHttp : httpOverHttp)({ proxy, ...pinned } as any) as http.Agent
  if (!secure) return new http.Agent({ keepAlive: true })
  return new https.Agent({ keepAlive: true, ...pinned })
}

let agentKey = ''
let agent: http.Agent | null = null
const getAgent = (c: TransportConf) => {
  const key = JSON.stringify([c.url, c.fp, c.pem?.length, nodeProxy()])
  if (key != agentKey || !agent) {
    agent?.destroy?.()
    agent = agentFor(c)
    agentKey = key
  }
  return agent
}

export const request = (c: TransportConf, method: string, path: string, body?: any, timeout = 60_000): Promise<Resp> => new Promise((resolve, reject) => {
  const { secure, host, port } = parse(c.url)
  const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body))
  const mod = secure ? https : http
  const req = mod.request({
    host, port, path, method,
    agent: getAgent(c),
    timeout,
    headers: {
      Authorization: `Bearer ${c.key}`,
      'X-Veya-Device': c.device,
      Accept: 'application/json',
      ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
    },
  }, res => {
    const chunks: Buffer[] = []
    res.on('data', d => chunks.push(d))
    res.on('end', () => {
      let json: any = null
      try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch {}
      resolve({ status: res.statusCode ?? 0, json })
    })
    res.on('error', reject)
  })
  req.on('timeout', () => req.destroy(new Error('连接服务器超时')))
  req.on('error', (err: any) => reject(new Error(err?.message?.includes('指纹') ? err.message : `连不上同步服务器：${err?.code ?? err?.message ?? err}`)))
  if (data) req.write(data)
  req.end()
})

export const openSocket = (c: TransportConf, onOpen: () => void, onMessage: (msg: any) => void, onClose: (reason: string) => void): Socket => {
  const wsUrl = c.url.replace(/^http/, 'ws') + '/ws'
  const ws = new WebSocket(wsUrl, { agent: getAgent(c), handshakeTimeout: 15_000, perMessageDeflate: false })
  let closed = false
  const close = (reason: string) => {
    if (closed) return
    closed = true
    onClose(reason)
  }
  ws.on('open', onOpen)
  ws.on('message', (data: WebSocket.RawData) => {
    try { onMessage(JSON.parse(data.toString())) } catch {}
  })
  ws.on('close', (code: number) => close(`连接断开（${code}）`))
  ws.on('error', (err: any) => close(err?.message ?? String(err)))
  return {
    send: (obj: any) => { if (ws.readyState == WebSocket.OPEN) ws.send(JSON.stringify(obj)) },
    close: () => { try { ws.close() } catch {} ; close('closed') },
  }
}

export const resetTransport = () => {
  agent?.destroy?.()
  agent = null
  agentKey = ''
}
