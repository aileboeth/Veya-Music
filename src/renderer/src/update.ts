// 应用更新状态（主进程 updater.ts 推送）+ 更新日志
import { reactive } from 'vue'
import { api, on } from './api'
import changelog from './changelog.json'
import { settings } from './settings'
import { alertDialog, confirmDialog, toast } from './ui'

export const update = reactive({ status: 'idle', current: '', version: '', percent: 0, message: '', notes: '' })

const cmpVersion = (a: string, b: string) => {
  const pa = a.split('.').map(n => parseInt(n) || 0)
  const pb = b.split('.').map(n => parseInt(n) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) != (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** 内置更新日志里 (after, upTo] 之间的版本，拼成文本 */
const changelogText = (after = '', upTo = '') => (changelog as Array<{ version: string, date: string, items: string[] }>)
  .filter(c => (!after || cmpVersion(c.version, after) > 0) && (!upTo || cmpVersion(c.version, upTo) <= 0))
  .map(c => `${c.version}（${c.date}）\n${c.items.map(i => `· ${i}`).join('\n')}`)
  .join('\n\n')

export const showChangelog = () => void alertDialog('更新日志', changelogText())

export const initUpdate = async() => {
  Object.assign(update, await api('update.state'))
  on('update:state', (s: any) => {
    const wasDownloaded = update.status == 'downloaded'
    Object.assign(update, s)
    if (s.status == 'downloaded' && !wasDownloaded) toast(`新版本 ${s.version} 已下载好，点左下角「重启更新」查看更新内容并安装`, 'success', 6000)
  })

  // 升级后的第一次启动：显示这次更新了什么
  const { version } = await api<{ version: string }>('app.info')
  const last = settings.lastVersion
  if (last && cmpVersion(version, last) > 0) {
    const text = changelogText(last, version) || await api<string>('update.savedNotes', version).catch(() => '')
    if (text) void alertDialog(`已更新到 ${version}`, text)
  }
  if (last != version) settings.lastVersion = version
}

export const checkUpdate = async() => {
  const s = await api<any>('update.check')
  Object.assign(update, s)
}

export const installUpdate = async() => {
  const notes = update.notes ? `更新内容：\n${update.notes}\n\n` : ''
  if (await confirmDialog(`安装新版本 ${update.version}？`, `${notes}Veya Music 会关闭并自动重新打开，正在播放的音乐会中断。`, { okText: '重启更新' })) void api('update.install')
}

export const updateText = () => {
  switch (update.status) {
    case 'checking': return '正在检查更新…'
    case 'available': return `发现新版本 ${update.version}，准备下载…`
    case 'downloading': return `正在下载新版本 ${update.version}：${update.percent}%`
    case 'downloaded': return `新版本 ${update.version} 已下载，重启后生效`
    case 'none': return '已经是最新版本'
    case 'error': return `检查更新失败：${update.message}`
    case 'unsupported': return update.message
    default: return ''
  }
}
