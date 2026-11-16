// needle 模块（LX musicSdk、推荐、音源脚本的请求都走它）：按 needle 的规则组装请求体，交给原生层发送
import { httpCancel, httpRaw } from '../http'
import { newId } from '../native'

const flatten = (obj: any, prefix = '', out: Array<[string, string]> = []) => {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}[${k}]` : k
    if (v && typeof v == 'object' && !Buffer.isBuffer(v)) flatten(v, key, out)
    else if (v !== undefined) out.push([key, String(v ?? '')])
  }
  return out
}

const multipart = (data: any) => {
  const boundary = '----VeyaBoundary' + Math.random().toString(36).slice(2)
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries<any>(data ?? {})) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n`))
    parts.push(Buffer.isBuffer(v) ? v : Buffer.from(String(v ?? '')))
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` }
}

const NEEDLE_UA = 'Needle/3.5.0 (Node.js v22.20.0; win32 x64)'

const errCode = (msg: string) => /timeout|timed out/i.test(msg) ? 'ETIMEDOUT' : /unable to resolve|UnknownHost|ENOTFOUND/i.test(msg) ? 'ENOTFOUND' : /refused/i.test(msg) ? 'ECONNREFUSED' : /reset/i.test(msg) ? 'ECONNRESET' : undefined

export const request = (method: string, url: string, data: any, options: any = {}, callback?: (err: any, resp?: any, body?: any) => void) => {
  if (typeof options == 'function') {
    callback = options
    options = {}
  }
  options ??= {}
  const m = String(method || 'get').toUpperCase()
  // 和 needle 一样的默认请求头（有的接口按 User-Agent 区分客户端；OkHttp 默认的 okhttp/x 可能被拒）
  const headers: Record<string, string> = { accept: options.accept || '*/*', 'user-agent': options.user_agent || NEEDLE_UA }
  if (options.content_type) headers['content-type'] = options.content_type
  for (const [k, v] of Object.entries<any>(options.headers ?? {})) if (v != null) headers[k.toLowerCase()] = String(v)
  // needle：没有明确 json: false 时，请求头写了 application/json 也按 JSON 发送对象
  const json = !!options.json || (options.json !== false && headers['content-type'] == 'application/json')
  let body: string | undefined
  let bodyType: 'text' | 'base64' = 'text'
  if (data != null && data !== '') {
    if (options.multipart) {
      const mp = multipart(data)
      body = mp.body.toString('base64')
      bodyType = 'base64'
      headers['content-type'] = mp.type
    } else if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
      body = Buffer.from(data).toString('base64')
      bodyType = 'base64'
    } else if (m == 'GET' && !json) {
      if (typeof data == 'object') {
        const qs = new URLSearchParams(flatten(data)).toString()
        url = url.replace(/\?.*|$/, '?' + qs)
      }
    } else {
      body = typeof data == 'string' ? data : json ? JSON.stringify(data) : new URLSearchParams(flatten(data)).toString()
    }
    if (body != null && !headers['content-type']) headers['content-type'] = json ? 'application/json; charset=utf-8' : 'application/x-www-form-urlencoded'
  }
  if (options.json && !options.accept && !Object.keys(options.headers ?? {}).some(k => k.toLowerCase() == 'accept')) headers.accept = 'application/json'
  const timeout = Number(options.response_timeout || options.read_timeout || options.timeout || options.open_timeout) || 30_000
  const follow = Number(options.follow_max ?? options.follow ?? 0) > 0 || options.follow === true
  const cancelId = newId('n')
  let aborted = false
  httpRaw({ url, method: m, headers, body, bodyType, timeout, follow, cancelId }).then(r => {
    if (aborted) return
    const raw = Buffer.from(r.body ?? '', 'base64')
    const type = r.headers['content-type'] ?? ''
    let parsed: any = raw
    if (/json/i.test(type) && options.parse !== false) {
      try { parsed = JSON.parse(raw.toString('utf8')) } catch { parsed = raw.toString('utf8') }
    } else if (/text|javascript|xml|html/i.test(type)) parsed = raw.toString('utf8')
    const resp = { statusCode: r.status, statusMessage: r.statusText, headers: r.headers, raw, bytes: raw.length, body: parsed, url: r.url }
    callback?.(null, resp, parsed)
  }, (err: any) => {
    if (aborted) return
    const e: any = err instanceof Error ? err : new Error(String(err))
    e.code ??= errCode(e.message)
    callback?.(e)
  })
  const req = {
    get aborted() { return aborted },
    abort() {
      if (aborted) return
      aborted = true
      httpCancel(cancelId)
    },
    destroy() { req.abort() },
  }
  return { request: req }
}

export const get = (url: string, options: any, cb: any) => request('get', url, null, options, cb)
export const post = (url: string, data: any, options: any, cb: any) => request('post', url, data, options, cb)
export default { request, get, post }
