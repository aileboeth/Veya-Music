import { contextBridge, ipcRenderer } from 'electron'

const EVENTS = new Set(['sources:changed', 'sources:speed', 'downloads:changed', 'player:command', 'settings:changed', 'lyric:visible', 'lyric:data', 'lyric:conf', 'lyric:request', 'update:state', 'app:toast', 'import:progress'])

contextBridge.exposeInMainWorld('veya', {
  /** 返回 { ok, data } 或 { ok: false, message, details }，由渲染进程的 api() 包装成异常 */
  invoke(method: string, ...args: any[]) {
    return ipcRenderer.invoke('veya', method, ...args)
  },
  on(channel: string, handler: (...args: any[]) => void) {
    if (!EVENTS.has(channel)) throw new Error('unknown channel ' + channel)
    const fn = (_e: any, ...args: any[]) => handler(...args)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.removeListener(channel, fn)
  },
})
