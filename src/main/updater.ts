// 自动更新：从 GitHub Releases 检查、后台下载，下载完成后由用户选择「重启更新」（或下次退出时自动安装）
// 安装包的完整性由 latest.yml 里的 SHA512 校验保证
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { autoUpdater } from 'electron-updater'
import { load, save } from './store'

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'none' | 'error' | 'unsupported'
  current: string
  version: string
  percent: number
  message: string
  notes: string
}

const state: UpdateState = { status: 'idle', current: app.getVersion(), version: '', percent: 0, message: '', notes: '' }
let notify: (s: UpdateState) => void = () => {}
let beforeInstall: () => void = () => {}
let enabled = false
let manual = false

const set = (patch: Partial<UpdateState>) => {
  Object.assign(state, patch)
  notify({ ...state })
}

const notesText = (notes: any) => {
  const raw = Array.isArray(notes) ? notes.map(n => n?.note ?? '').join('\n') : String(notes ?? '')
  // GitHub 返回的是 HTML：保留列表和换行，其余标签去掉
  const html = /<\/?[a-z][^>]*>/i.test(raw)
  return (html ? raw.replace(/\s*\n\s*/g, ' ') : raw).replace(/\r/g, '')
    .replace(/<li[^>]*>/gi, '· ').replace(/<\/(li|p|h\d|ul|ol|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n').slice(0, 3000)
}

const friendlyError = (err: any) => {
  const msg = String(err?.message ?? err)
  if (/net::|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|timeout|socket/i.test(msg)) return '连接 GitHub 失败，请检查网络或代理后重试'
  if (/404|latest\.yml|No published versions/i.test(msg)) return '还没有发布可用的更新'
  if (/sha512|checksum/i.test(msg)) return '更新文件校验失败，已放弃这次更新'
  return msg.split('\n')[0].slice(0, 200)
}

export const initUpdater = (onState: (s: UpdateState) => void, onBeforeInstall: () => void) => {
  notify = onState
  beforeInstall = onBeforeInstall

  // 仅开发环境：用本地地址模拟更新源，方便自测
  const devUrl = !app.isPackaged ? process.env.VEYA_UPDATE_URL : ''
  if (!app.isPackaged && !devUrl) {
    state.status = 'unsupported'
    state.message = '开发模式下不检查更新'
    return
  }
  if (devUrl) {
    // 未打包时没有 app-update.yml，这里临时生成一份
    const conf = path.join(app.getPath('userData'), 'dev-app-update.yml')
    fs.mkdirSync(path.dirname(conf), { recursive: true })
    fs.writeFileSync(conf, `provider: generic\nurl: ${devUrl}\nupdaterCacheDirName: veya-music-updater-dev\n`)
    autoUpdater.updateConfigPath = conf
    autoUpdater.forceDevUpdateConfig = true
  }
  enabled = true
  autoUpdater.autoDownload = true
  // 用本地地址自测时绝不自动安装，避免把测试包装到真实环境里
  autoUpdater.autoInstallOnAppQuit = !devUrl
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', message: '' }))
  autoUpdater.on('update-available', info => set({ status: 'available', version: info.version, notes: notesText(info.releaseNotes), percent: 0 }))
  autoUpdater.on('update-not-available', () => set({ status: 'none', message: '' }))
  autoUpdater.on('download-progress', p => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', info => {
    const notes = notesText(info.releaseNotes)
    // 存下来：装完重启后还能显示这次更新了什么
    if (notes) save('updateNotes', { version: info.version, notes }, true)
    set({ status: 'downloaded', version: info.version, notes, percent: 100 })
  })
  autoUpdater.on('error', err => {
    // 自动检查失败时不打扰用户，只有手动检查才显示错误
    if (manual || state.status == 'downloading') set({ status: 'error', message: friendlyError(err) })
    else set({ status: 'idle', message: '' })
  })

  if (load<any>('settings', {}).autoUpdate !== false) {
    setTimeout(() => void check(false), 12_000)
    setInterval(() => { if (load<any>('settings', {}).autoUpdate !== false) void check(false) }, 6 * 3600_000)
  }
}

export const getState = () => ({ ...state })

/** 上次下载更新时保存的发布说明（仅当版本号对得上） */
export const savedNotes = (version: string) => {
  const saved = load<any>('updateNotes', null)
  return saved?.version == version ? String(saved.notes ?? '') : ''
}

export const check = async(isManual = true) => {
  if (!enabled) return getState()
  if (state.status == 'checking' || state.status == 'downloading' || state.status == 'downloaded') return getState()
  manual = isManual
  try {
    const result = await autoUpdater.checkForUpdates()
    // 下载失败会通过 error 事件上报，这里只是避免出现未处理的 Promise 拒绝
    result?.downloadPromise?.catch(() => {})
  } catch (err) {
    if (isManual) set({ status: 'error', message: friendlyError(err) })
    else set({ status: 'idle' })
  }
  return getState()
}

export const install = () => {
  if (state.status != 'downloaded') return
  beforeInstall()
  // isSilent=true：不再弹安装向导；isForceRunAfter=true：装完自动重新打开
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}
