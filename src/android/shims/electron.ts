// electron 模块：手机版只用到 app.getPath / getVersion 和 session.fetch，其余给空壳
import { call, nativeInfo } from '../native'
import { nativeFetch } from '../http'

const ROOT = '/veya'
export const app = {
  getPath: (name: string) => name == 'userData' ? ROOT : name == 'music' ? '/music' : `${ROOT}/${name}`,
  getVersion: () => nativeInfo.version,
  isPackaged: true,
  quit: () => {},
  exit: () => {},
}

const ses = {
  fetch: nativeFetch,
  setProxy: async() => {},
  closeAllConnections: async() => {},
  resolveProxy: async() => 'DIRECT',
  setPermissionRequestHandler: () => {},
  webRequest: { onHeadersReceived: () => {} },
}
export const session = { defaultSession: ses, fromPartition: () => ses }

export const shell = {
  openExternal: (url: string) => call('app.open', { url }),
  openPath: async() => '',
  showItemInFolder: () => {},
}
export const clipboard = { writeText: (text: string) => void call('app.copy', { text }) }

const noop = () => {}
export class BrowserWindow { constructor() { throw new Error('手机版没有窗口') } }
export const ipcMain = { on: noop, handle: noop }
export const ipcRenderer = { on: noop, send: noop, invoke: async() => null }
export const contextBridge = { exposeInMainWorld: noop }
export const webFrame = { executeJavaScript: async() => null }
export const dialog = { showOpenDialog: async() => ({ canceled: true, filePaths: [] }) }
export const Menu = { setApplicationMenu: noop, buildFromTemplate: () => ({}) }
export const nativeImage = { createFromPath: () => ({ isEmpty: () => true }), createEmpty: () => ({}) }
export const screen = { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 0, height: 0 } }), getAllDisplays: () => [], getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 0, height: 0 } }) }
export class Tray {}

export default { app, session, shell, clipboard, BrowserWindow, ipcMain, ipcRenderer, contextBridge, webFrame, dialog, Menu, nativeImage, screen, Tray }
