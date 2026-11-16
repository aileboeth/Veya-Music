// 音源脚本的运行容器（电脑版）：每个脚本一个隐藏窗口（无 Node 权限的页面 + 受控的 lx API，见 preload/userApi.js）
// 手机版用 Web Worker 实现同样的接口（src/android/main/userApiHost.ts）
import { BrowserWindow, ipcMain, session } from 'electron'
import path from 'path'

export interface HostEvents {
  onInit(ok: boolean, message: string, info?: any): void
  onResponse(requestKey: string, ok: boolean, result: any, message: string): void
  onUpdateAlert(data: { log: string, updateUrl?: string }): void
  onClosed(): void
}
export interface ScriptHost {
  send(msg: { requestKey: string, data: any }): void
  destroy(): void
}
export interface HostMeta { name: string, description: string, version: string, author: string, homepage: string }

const HTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>User api</title></head><body></body></html>'
const byWc = new Map<number, HostEvents>()

export const initHosts = () => {
  session.fromPartition('veya-userapi').setPermissionRequestHandler((_wc, _permission, callback) => { callback(false) })
  ipcMain.on('userApi:init', (event, { data, status, message }) => {
    byWc.get(event.sender.id)?.onInit(!!status, message ?? '', data)
  })
  ipcMain.on('userApi:response', (event, { data, status, message }) => {
    if (!data?.requestKey) return
    byWc.get(event.sender.id)?.onResponse(data.requestKey, !!status, data.result, message ?? '')
  })
  ipcMain.on('userApi:updateAlert', (event, { data }) => {
    if (data) byWc.get(event.sender.id)?.onUpdateAlert(data)
  })
}

export const createHost = (meta: HostMeta, script: string, proxy: { host: string, port: string | number }, ev: HostEvents): ScriptHost => {
  const win = new BrowserWindow({
    show: false,
    width: 300,
    height: 200,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: false,
      spellcheck: false,
      webgl: false,
      images: false,
      disableDialogs: true,
      autoplayPolicy: 'document-user-activation-required',
      session: session.fromPartition('veya-userapi'),
      preload: path.join(__dirname, '../preload/userApi.js'),
    },
  })
  const wcId = win.webContents.id
  byWc.set(wcId, ev)
  for (const eventName of ['will-navigate', 'will-redirect', 'will-attach-webview', 'will-prevent-unload', 'media-started-playing']) {
    win.webContents.on(eventName as any, (event: Electron.Event) => { event.preventDefault() })
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.on('closed', () => {
    byWc.delete(wcId)
    ev.onClosed()
  })
  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(HTML)).then(() => {
    win.webContents.send('userApi:initEnv', { ...meta, script, proxy })
  }).catch(err => ev.onInit(false, String(err?.message ?? err)))
  return {
    send: msg => { if (!win.isDestroyed()) win.webContents.send('userApi:request', msg) },
    destroy: () => {
      byWc.delete(wcId)
      if (!win.isDestroyed()) win.destroy()
    },
  }
}
