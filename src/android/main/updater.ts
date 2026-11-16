// 手机版自动更新：读 GitHub Release 里的 veya-android.json（版本号、APK 文件名、SHA-256），
// 下载 APK（GitHub 连不上时走加速镜像）→ 校验 → 交给系统安装（签名不一致时系统会拒绝，镜像无法替换安装包）
import { load, save } from '../../main/store'
import { httpRaw } from '../http'
import { call, nativeInfo, onNative } from '../native'

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'none' | 'error' | 'unsupported'
  current: string
  version: string
  percent: number
  message: string
  notes: string
}

const REPO = 'aileboeth/Veya-Music'
const MIRRORS = ['', 'https://p.jackyu.cn/']
const state: UpdateState = { status: 'idle', current: nativeInfo.version, version: '', percent: 0, message: '', notes: '' }
let notify: (s: UpdateState) => void = () => {}
let apkPath = ''

const set = (patch: Partial<UpdateState>) => {
  Object.assign(state, patch)
  notify({ ...state })
}

const cmp = (a: string, b: string) => {
  const pa = a.split('.').map(n => parseInt(n) || 0)
  const pb = b.split('.').map(n => parseInt(n) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) != (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

const getText = async(url: string) => {
  let last: any
  for (const m of MIRRORS) {
    try {
      const r = await httpRaw({ url: m + url, timeout: 15_000, purpose: 'update' })
      if (r.status == 200) return Buffer.from(r.body, 'base64').toString('utf8')
      last = new Error(`服务器返回 ${r.status}`)
    } catch (err) { last = err }
  }
  throw last ?? new Error('连接 GitHub 失败')
}

const loadNotes = async(version: string) => {
  for (const url of [`https://raw.githubusercontent.com/${REPO}/v${version}/src/renderer/src/changelog.json`, `https://cdn.jsdelivr.net/gh/${REPO}@v${version}/src/renderer/src/changelog.json`]) {
    try {
      const r = await httpRaw({ url, timeout: 12_000, purpose: 'update' })
      if (r.status != 200) continue
      const entry = (JSON.parse(Buffer.from(r.body, 'base64').toString('utf8')) as any[]).find(c => c?.version == version)
      const notes = (entry?.items ?? []).map((i: any) => `· ${String(i)}`).join('\n').slice(0, 3000)
      if (notes) return notes
    } catch {}
  }
  return ''
}

const friendly = (err: any) => {
  const msg = String(err?.message ?? err)
  if (/timeout|resolve|connect|reset|refused|ssl|handshake/i.test(msg)) return '连接 GitHub 失败，请检查网络后重试'
  if (/404/.test(msg)) return '还没有发布手机版的更新'
  return msg.split('\n')[0].slice(0, 200)
}

export const initUpdater = (onState: (s: UpdateState) => void, _onBeforeInstall: () => void) => {
  notify = onState
  onNative('update', (e: any) => {
    if (e?.type == 'progress' && state.status == 'downloading') set({ percent: Math.round(e.percent) })
  })
  if (nativeInfo.debug) {
    state.status = 'unsupported'
    state.message = '测试版不检查更新'
    return
  }
  if (load<any>('settings', {}).autoUpdate !== false) {
    setTimeout(() => void check(false), 15_000)
    setInterval(() => { if (load<any>('settings', {}).autoUpdate !== false) void check(false) }, 6 * 3600_000)
  }
}

export const getState = () => ({ ...state })

export const savedNotes = (version: string) => {
  const saved = load<any>('updateNotes', null)
  return saved?.version == version ? String(saved.notes ?? '') : ''
}

export const check = async(manual = true) => {
  if (state.status == 'unsupported' || ['checking', 'downloading', 'downloaded'].includes(state.status)) return getState()
  set({ status: 'checking', message: '' })
  try {
    const info = JSON.parse(await getText(`https://github.com/${REPO}/releases/latest/download/veya-android.json`))
    if (!info?.version || cmp(info.version, nativeInfo.version) <= 0) {
      set({ status: manual ? 'none' : 'idle' })
      return getState()
    }
    set({ status: 'available', version: info.version, percent: 0, notes: '' })
    void loadNotes(info.version).then(notes => { if (notes && state.version == info.version) set({ notes }) })
    set({ status: 'downloading' })
    const urls = MIRRORS.map(m => `${m}https://github.com/${REPO}/releases/download/v${info.version}/${info.apk}`)
    const r = await call<{ path: string }>('update.download', { urls, sha256: info.sha256, size: info.size })
    apkPath = r.path
    if (state.notes) save('updateNotes', { version: info.version, notes: state.notes }, true)
    set({ status: 'downloaded', percent: 100 })
  } catch (err) {
    if (manual || state.status == 'downloading') set({ status: 'error', message: friendly(err) })
    else set({ status: 'idle' })
  }
  return getState()
}

export const install = () => {
  if (state.status != 'downloaded' || !apkPath) return
  void call('update.install', { path: apkPath }).catch(err => set({ status: 'error', message: String(err?.message ?? err) }))
}
