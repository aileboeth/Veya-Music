// 和安卓原生层（Kotlin，见 android/app/.../Bridge.kt）通信
// - 同步方法：直接调用 window.VeyaNative.xxx()（文件读写、小查询）
// - 异步方法：call(method, args) → 原生在后台线程做完后调用 __veyaNative.ready(id)，页面再用 take(id) 取结果
//   （结果可能有几 MB，不塞进 evaluateJavascript 的脚本字符串里）
// - 原生事件：__veyaNative.emit(name, json)

export interface NativeSync {
  info(): string
  take(id: string): string | null
  call(id: string, method: string, args: string): void
  fsRead(path: string): string | null
  fsWrite(path: string, data: string): boolean
  fsExists(path: string): boolean
  fsDelete(path: string): boolean
  fsList(path: string): string
  fsStat(path: string): string | null
  fsMkdir(path: string): boolean
  fsRename(from: string, to: string): boolean
  fsCopy(from: string, to: string): boolean
  player(op: string, json: string): void
  wsSend(id: string, text: string): boolean
  wsClose(id: string): void
  fileExists(uri: string): boolean
  toast(text: string): void
}

export const N: NativeSync = (window as any).VeyaNative

const pending = new Map<string, { resolve: (v: any) => void, reject: (e: Error) => void }>()
const listeners = new Map<string, Set<(data: any) => void>>()
let seq = 0

;(window as any).__veyaNative = {
  ready(id: string) {
    const p = pending.get(id)
    if (!p) return
    pending.delete(id)
    let r: any
    try { r = JSON.parse(N.take(id) ?? 'null') } catch { r = null }
    if (r?.ok) p.resolve(r.data)
    else {
      const err: any = new Error(r?.error ?? '原生调用失败')
      if (r?.code) err.code = r.code
      p.reject(err)
    }
  },
  emit(name: string, json: string) {
    let data: any
    try { data = JSON.parse(json) } catch { data = json }
    for (const fn of listeners.get(name) ?? []) {
      try { fn(data) } catch (err) { console.error('[native event]', name, err) }
    }
  },
}

export const call = <T = any>(method: string, args?: any): Promise<T> => new Promise((resolve, reject) => {
  const id = `c${++seq}_${Date.now().toString(36)}`
  pending.set(id, { resolve, reject })
  try {
    N.call(id, method, JSON.stringify(args ?? null))
  } catch (err: any) {
    pending.delete(id)
    reject(err)
  }
})

export const onNative = (name: string, fn: (data: any) => void) => {
  let set = listeners.get(name)
  if (!set) listeners.set(name, set = new Set())
  set.add(fn)
  return () => { set!.delete(fn) }
}

export interface NativeInfo { version: string, versionCode: number, sdk: number, model: string, brand: string, debug: boolean, dataDir: string }
export const nativeInfo: NativeInfo = (() => {
  try { return JSON.parse(N.info()) } catch { return { version: '0.0.0', versionCode: 0, sdk: 0, model: 'Android', brand: '', debug: true, dataDir: '' } }
})()

export const newId = (prefix = 'r') => `${prefix}${++seq}_${Math.random().toString(36).slice(2, 8)}`
