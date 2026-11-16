// 所有网络请求都交给原生层（OkHttp）：没有跨域限制，可以设置 Referer / User-Agent / Cookie，代理设置也在原生层统一处理
import { call, newId } from './native'

export interface HttpOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  /** 文本或 base64（bodyType = base64） */
  body?: string
  bodyType?: 'text' | 'base64'
  /** 毫秒 */
  timeout?: number
  /** 是否跟随重定向 */
  follow?: boolean
  /** 最多读这么多字节就停（试探链接时用） */
  maxBytes?: number
  /** update = 「只有检查更新走代理」的那一类请求 */
  purpose?: 'update' | 'music'
  /** 同步服务器的自签名证书指纹 */
  pin?: string
  /** 取消用的 id */
  cancelId?: string
}
export interface HttpResponse {
  status: number
  statusText: string
  url: string
  headers: Record<string, string>
  /** 响应内容（base64） */
  body: string
}

export const httpRaw = (opts: HttpOptions) => call<HttpResponse>('http', { method: 'GET', timeout: 30_000, follow: true, ...opts })
export const httpCancel = (cancelId: string) => void call('httpCancel', { cancelId }).catch(() => {})

const headersToObj = (h: any): Record<string, string> => {
  if (!h) return {}
  if (typeof h.forEach == 'function' && !Array.isArray(h)) {
    const o: Record<string, string> = {}
    h.forEach((v: string, k: string) => { o[k] = v })
    return o
  }
  if (Array.isArray(h)) return Object.fromEntries(h)
  return { ...h }
}

/** 和 window.fetch 用法一样（电脑版代码里的 session.defaultSession.fetch） */
export const nativeFetch = async(url: string, init: any = {}): Promise<any> => {
  const headers = headersToObj(init.headers)
  const range = /bytes=(\d+)-(\d+)/.exec(headers.Range ?? headers.range ?? '')
  const cancelId = newId('f')
  const signal: AbortSignal | undefined = init.signal
  if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  let body: string | undefined
  let bodyType: 'text' | 'base64' = 'text'
  if (init.body != null) {
    if (typeof init.body == 'string') body = init.body
    else {
      body = Buffer.from(init.body).toString('base64')
      bodyType = 'base64'
    }
  }
  const req = httpRaw({
    url, method: init.method ?? 'GET', headers, body, bodyType, cancelId,
    timeout: init.timeout ?? 30_000,
    follow: init.redirect != 'manual',
    maxBytes: range ? Number(range[2]) - Number(range[1]) + 1 : undefined,
  })
  const r = await (signal ? Promise.race([req, new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => {
      httpCancel(cancelId)
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    }, { once: true })
  })]) : req)
  const bytes = Buffer.from(r.body ?? '', 'base64')
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    statusText: r.statusText,
    url: r.url,
    headers: new Headers(r.headers),
    text: async() => bytes.toString('utf8'),
    json: async() => JSON.parse(bytes.toString('utf8')),
    arrayBuffer: async() => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: {
      getReader() {
        let done = false
        return {
          read: async() => {
            if (done || !bytes.length) return { done: true, value: undefined }
            done = true
            return { done: false, value: new Uint8Array(bytes) }
          },
          cancel: async() => {},
        }
      },
    },
  }
}
