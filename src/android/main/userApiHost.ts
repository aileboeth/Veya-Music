// 音源脚本的运行容器（手机版）：每个脚本一个 Web Worker，接口和电脑版 src/main/userApiHost.ts 一样
import { request as needleRequest } from '../shims/needle'
import type { HostEvents, HostMeta, ScriptHost } from '../../main/userApiHost'

export type { HostEvents, HostMeta, ScriptHost }

export const initHosts = () => {}

const dec = (v: any) => v && typeof v == 'object' && typeof v.b64 == 'string' ? Buffer.from(v.b64, 'base64') : v

export const createHost = (meta: HostMeta, script: string, _proxy: any, ev: HostEvents): ScriptHost => {
  const worker = new Worker(new URL('../lxWorker.ts', import.meta.url), { type: 'module', name: `source:${meta.name}` })
  const aborts = new Map<number, () => void>()
  let destroyed = false

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data
    switch (msg?.type) {
      case 'init':
        ev.onInit(!!msg.ok, msg.message ?? '', msg.info)
        break
      case 'response':
        ev.onResponse(msg.requestKey, !!msg.ok, msg.result, msg.message ?? '')
        break
      case 'updateAlert':
        ev.onUpdateAlert(msg.data)
        break
      case 'http': {
        // 和电脑版 preload 一样的规则：body 原样发送；form / formData 按表单发送
        const options: any = { headers: msg.headers, response_timeout: typeof msg.timeout == 'number' && msg.timeout > 0 ? Math.min(msg.timeout, 60_000) : 60_000 }
        let data: any
        if (msg.body) data = dec(msg.body)
        else if (msg.form) {
          data = dec(msg.form)
          options.json = false
        } else if (msg.formData) {
          data = dec(msg.formData)
          options.json = false
        }
        const { request } = needleRequest(msg.method ?? 'get', msg.url, data, options, (err, resp) => {
          aborts.delete(msg.id)
          if (destroyed) return
          if (err) worker.postMessage({ type: 'http', id: msg.id, error: String(err.message ?? err), code: err.code })
          else worker.postMessage({ type: 'http', id: msg.id, statusCode: resp.statusCode, statusMessage: resp.statusMessage, headers: resp.headers, raw: resp.raw.toString('base64') })
        })
        aborts.set(msg.id, () => request.abort())
        break
      }
      case 'httpAbort':
        aborts.get(msg.id)?.()
        aborts.delete(msg.id)
        break
    }
  }
  worker.onerror = (e: ErrorEvent) => {
    e.preventDefault?.()
    ev.onInit(false, String(e.message ?? '脚本运行出错'))
  }
  worker.postMessage({ type: 'initEnv', meta, script })
  return {
    send: msg => { if (!destroyed) worker.postMessage({ type: 'request', ...msg }) },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      for (const abort of aborts.values()) abort()
      aborts.clear()
      worker.terminate()
    },
  }
}
