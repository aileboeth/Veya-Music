import { nextTick, reactive, watch } from 'vue'
import { api, on } from './api'

export const settings = reactive({
  theme: 'system' as 'light' | 'dark' | 'system',
  dark: false,
  quality: '320k',
  playMode: 'order' as 'order' | 'loop' | 'shuffle' | 'single',
  autoContinue: true,
  autoSwitchSource: true,
  /** auto = 按测速和历史表现优先用快的音源；manual = 按音源列表的顺序 */
  sourceOrder: 'auto' as 'auto' | 'manual',
  proxy: { mode: 'system', host: '127.0.0.1', port: 7890, scope: 'update' } as { mode: 'system' | 'direct' | 'custom', host: string, port: number, scope: 'update' | 'all' },
  /** 上次运行的版本号，用来在升级后显示更新内容 */
  lastVersion: '',
  volume: 0.8,
  closeToTray: true,
  autoUpdate: true,
  downloadDir: '',
  downloadQuality: '320k',
  downloadLyric: true,
  showTranslation: true,
  /** 手机版：锁屏 / 通知栏 / 车载蓝牙显示当前这句歌词 */
  lockLyric: false,
  desktopLyric: { fontSize: 30, locked: false, color: 'aurora' } as Record<string, any>,
  /** 我的歌单里歌曲的排序（所有歌单共用，只影响显示和播放顺序，不改歌单本身） */
  myListSort: 'default' as 'default' | 'plays' | 'recent' | 'name' | 'singer' | 'duration',
  /** 播放页：layout = 封面在左侧 / 居中在上；visual = 律动效果 */
  nowPlaying: { layout: 'side', visual: 'ring' } as { layout: 'side' | 'center', visual: 'ring' | 'wave' | 'bars' | 'off' },
})

const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => {
  const dark = settings.theme == 'dark' || (settings.theme == 'system' && media.matches)
  settings.dark = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  void api('win.theme', dark).catch(() => {})
}

let loaded = false
let ver = 0
let reloading = false
export const initSettings = async() => {
  const r = await api<{ value: any, v: number }>('data.loadV', 'settings', {})
  const saved = r.value
  ver = r.v
  Object.assign(settings, saved ?? {})
  // 0.1.1 及更早的版本没有记录版本号：有旧设置但没有 lastVersion，说明是从旧版升级上来的
  if (!settings.lastVersion && saved && Object.keys(saved).length) settings.lastVersion = '0.1.1'
  applyTheme()
  media.addEventListener('change', applyTheme)
  loaded = true
  watch(() => settings.theme, applyTheme)
  watch(settings, () => { if (loaded && !reloading) void api('data.save', 'settings', settings, ver) }, { deep: true })
  // 主进程修改了设置（桌面歌词窗口被拖动、从别的设备同步过来）时更新
  on('settings:changed', async(s: any) => {
    const fresh = await api<{ value: any, v: number }>('data.loadV', 'settings', {}).catch(() => null)
    reloading = true
    if (fresh) {
      ver = fresh.v
      Object.assign(settings, fresh.value ?? {})
    } else if (s?.desktopLyric) settings.desktopLyric = s.desktopLyric
    await nextTick()
    reloading = false
  })
}
