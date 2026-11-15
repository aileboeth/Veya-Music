import { reactive, watch } from 'vue'
import { api, on } from './api'

export const settings = reactive({
  theme: 'system' as 'light' | 'dark' | 'system',
  dark: false,
  quality: '320k',
  playMode: 'order' as 'order' | 'loop' | 'shuffle' | 'single',
  autoContinue: true,
  autoSwitchSource: true,
  volume: 0.8,
  closeToTray: true,
  autoUpdate: true,
  downloadDir: '',
  downloadQuality: '320k',
  downloadLyric: true,
  showTranslation: true,
  desktopLyric: { fontSize: 30, locked: false, color: 'aurora' } as Record<string, any>,
})

const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => {
  const dark = settings.theme == 'dark' || (settings.theme == 'system' && media.matches)
  settings.dark = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  void api('win.theme', dark).catch(() => {})
}

let loaded = false
export const initSettings = async() => {
  const saved = await api<any>('data.load', 'settings', {})
  Object.assign(settings, saved ?? {})
  applyTheme()
  media.addEventListener('change', applyTheme)
  loaded = true
  watch(() => settings.theme, applyTheme)
  watch(settings, () => { if (loaded) void api('data.save', 'settings', settings) }, { deep: true })
  // 主进程修改了设置（例如桌面歌词窗口被拖动）时同步过来
  on('settings:changed', (s: any) => {
    if (s?.desktopLyric) settings.desktopLyric = s.desktopLyric
  })
}
