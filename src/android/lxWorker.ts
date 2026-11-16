// 音源脚本的运行环境（手机版）：每个脚本一个 Web Worker，接口与 lx-music 的自定义源 API 兼容
// Worker 里拿不到页面的任何东西（包括原生接口），网络请求通过消息交给页面，由原生层发出
// 参考：src/preload/userApi.js（电脑版）、lx-music-desktop userApi preload（Apache-2.0）
import { Buffer } from 'buffer'
import * as cryptoShim from './shims/crypto'
import * as zlibShim from './shims/zlib'

const g = self as any
g.Buffer = Buffer
g.window = self
g.global = self

const post = (msg: any) => (self as any).postMessage(msg)

const EVENT_NAMES = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' }
const eventNames = Object.values(EVENT_NAMES)
const events: { request: any } = { request: null }
// qs = 汽水音乐：LX 没有这个平台，部分音源脚本自己声明了它
const allSources = ['kw', 'kg', 'tx', 'wy', 'mg', 'qs', 'local']
const supportQualitys: Record<string, string[]> = {
  kw: ['128k', '320k', 'flac', 'flac24bit'], kg: ['128k', '320k', 'flac', 'flac24bit'], tx: ['128k', '320k', 'flac', 'flac24bit'],
  wy: ['128k', '320k', 'flac', 'flac24bit'], mg: ['128k', '320k', 'flac', 'flac24bit'], qs: ['128k', '320k', 'flac', 'flac24bit'], local: [],
}
const supportActions: Record<string, string[]> = {
  kw: ['musicUrl'], kg: ['musicUrl'], tx: ['musicUrl'], wy: ['musicUrl'], mg: ['musicUrl'], qs: ['musicUrl'], local: ['musicUrl', 'lyric', 'pic'],
}

let isInitedApi = false
let isShowedUpdateAlert = false

const verifyLyricInfo = (info: any) => {
  if (typeof info != 'object' || typeof info.lyric != 'string') throw new Error('failed')
  if (info.lyric.length > 51200) throw new Error('failed')
  return {
    lyric: info.lyric,
    tlyric: (typeof info.tlyric == 'string' && info.tlyric.length < 5120) ? info.tlyric : null,
    rlyric: (typeof info.rlyric == 'string' && info.rlyric.length < 5120) ? info.rlyric : null,
    lxlyric: (typeof info.lxlyric == 'string' && info.lxlyric.length < 8192) ? info.lxlyric : null,
  }
}

const handleRequest = (requestKey: string, data: any) => {
  if (!events.request) return post({ type: 'response', requestKey, ok: false, message: 'Request event is not defined' })
  try {
    Promise.resolve(events.request.call(g.lx, { source: data.source, action: data.action, info: data.info })).then(response => {
      let result: any
      switch (data.action) {
        case 'musicUrl':
          if (typeof response != 'string' || response.length > 2048 || !/^https?:/.test(response)) throw new Error('failed')
          result = { source: data.source, action: data.action, data: { type: data.info.type, url: response } }
          break
        case 'lyric':
          result = { source: data.source, action: data.action, data: verifyLyricInfo(response) }
          break
        case 'pic':
          if (typeof response != 'string' || response.length > 2048 || !/^https?:/.test(response)) throw new Error('failed')
          result = { source: data.source, action: data.action, data: response }
          break
      }
      post({ type: 'response', requestKey, ok: true, result })
    }).catch(err => post({ type: 'response', requestKey, ok: false, message: String(err?.message ?? err) }))
  } catch (err: any) {
    post({ type: 'response', requestKey, ok: false, message: String(err?.message ?? err) })
  }
}

const handleInit = (info: any) => {
  if (!info) return post({ type: 'init', ok: false, message: 'Missing required parameter init info' })
  const sourceInfo: any = { sources: {} }
  try {
    for (const source of allSources) {
      const userSource = info.sources?.[source]
      if (!userSource || userSource.type !== 'music') continue
      sourceInfo.sources[source] = {
        type: 'music',
        actions: supportActions[source].filter(a => userSource.actions.includes(a)),
        qualitys: supportQualitys[source].filter(q => userSource.qualitys.includes(q)),
      }
    }
  } catch (error: any) {
    return post({ type: 'init', ok: false, message: error.message })
  }
  post({ type: 'init', ok: true, info: sourceInfo })
}

const onError = (errorMessage: string) => {
  if (isInitedApi) return
  isInitedApi = true
  post({ type: 'init', ok: false, message: errorMessage.length > 1024 ? errorMessage.slice(0, 1024) + '...' : errorMessage })
}

// ---------------- 网络请求：交给页面 ----------------
let httpSeq = 0
const httpCallbacks = new Map<number, (msg: any) => void>()

const makeLx = (meta: any, script: string) => ({
  EVENT_NAMES,
  request(url: string, { method = 'get', timeout, headers, body, form, formData }: any = {}, callback: (err: any, resp: any, body: any) => void) {
    const id = ++httpSeq
    let done = false
    httpCallbacks.set(id, msg => {
      httpCallbacks.delete(id)
      if (done) return
      done = true
      try {
        if (msg.error) return callback.call(g.lx, Object.assign(new Error(msg.error), { code: msg.code }), null, null)
        const raw = Buffer.from(msg.raw ?? '', 'base64')
        let parsed: any = raw.toString()
        try { parsed = JSON.parse(parsed) } catch {}
        callback.call(g.lx, null, { statusCode: msg.statusCode, statusMessage: msg.statusMessage, headers: msg.headers, bytes: raw.length, raw, body: parsed }, parsed)
      } catch (err: any) {
        onError(err.message)
      }
    })
    const enc = (v: any) => Buffer.isBuffer(v) || v instanceof Uint8Array ? { b64: Buffer.from(v).toString('base64') } : v
    post({ type: 'http', id, url, method, timeout, headers, body: enc(body), form: enc(form), formData: enc(formData) })
    return () => {
      if (done) return
      done = true
      httpCallbacks.delete(id)
      post({ type: 'httpAbort', id })
    }
  },
  send(eventName: string, data: any) {
    return new Promise<void>((resolve, reject) => {
      if (!eventNames.includes(eventName)) return reject(new Error('The event is not supported: ' + eventName))
      switch (eventName) {
        case EVENT_NAMES.inited:
          if (isInitedApi) return reject(new Error('Script is inited'))
          isInitedApi = true
          handleInit(data)
          resolve()
          break
        case EVENT_NAMES.updateAlert: {
          if (isShowedUpdateAlert) return reject(new Error('The update alert can only be called once.'))
          isShowedUpdateAlert = true
          if (!data || typeof data != 'object') return reject(new Error('parameter format error.'))
          if (!data.log || typeof data.log != 'string') return reject(new Error('log is required.'))
          if (data.updateUrl && (!/^https?:\/\/[^\s$.?#].[^\s]*$/.test(data.updateUrl) || data.updateUrl.length > 1024)) delete data.updateUrl
          post({ type: 'updateAlert', data: { log: data.log.length > 1024 ? data.log.slice(0, 1024) + '...' : data.log, updateUrl: data.updateUrl } })
          resolve()
          break
        }
        default:
          reject(new Error('Unknown event name: ' + eventName))
      }
    })
  },
  on(eventName: string, handler: any) {
    if (eventName !== EVENT_NAMES.request) return Promise.reject(new Error('The event is not supported: ' + eventName))
    events.request = handler
    return Promise.resolve()
  },
  utils: {
    crypto: {
      aesEncrypt(buffer: any, mode: string, key: any, iv: any) {
        const cipher = cryptoShim.createCipheriv(mode, key, iv)
        return Buffer.concat([cipher.update(buffer), cipher.final()])
      },
      rsaEncrypt(buffer: any, key: string) {
        const b = Buffer.from(buffer)
        return cryptoShim.publicEncrypt({ key, padding: cryptoShim.constants.RSA_NO_PADDING }, Buffer.concat([Buffer.alloc(Math.max(0, 128 - b.length)), b]))
      },
      randomBytes: (size: number) => cryptoShim.randomBytes(size),
      md5: (str: any) => cryptoShim.createHash('md5').update(str).digest('hex'),
    },
    buffer: {
      from: (...args: any[]) => (Buffer.from as any)(...args),
      bufToString: (buf: any, format: any) => Buffer.from(buf, 'binary').toString(format),
    },
    zlib: {
      inflate: (buf: any) => new Promise((resolve, reject) => zlibShim.inflate(buf, (err, data) => err ? reject(new Error(err.message)) : resolve(data))),
      deflate: (data: any) => new Promise((resolve, reject) => zlibShim.deflate(data, (err, buf) => err ? reject(new Error(err.message)) : resolve(buf))),
    },
  },
  currentScriptInfo: { ...meta, rawScript: script },
  version: '2.0.0',
  env: 'desktop',
})

self.addEventListener('error', (event: any) => onError(String(event.message ?? 'error').replace(/^Uncaught\sError:\s/, '')))
self.addEventListener('unhandledrejection', (event: any) => {
  const message = typeof event.reason === 'string' ? event.reason : event.reason?.message ?? String(event.reason)
  onError(String(message).replace(/^Error:\s/, ''))
})

self.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data
  if (msg?.type == 'initEnv') {
    g.lx = makeLx(msg.meta, msg.script)
    try {
      // eslint-disable-next-line no-eval
      ;(0, eval)(msg.script)
    } catch (err: any) {
      onError(String(err?.message ?? err))
    }
  } else if (msg?.type == 'request') handleRequest(msg.requestKey, msg.data)
  else if (msg?.type == 'http') httpCallbacks.get(msg.id)?.(msg)
})
