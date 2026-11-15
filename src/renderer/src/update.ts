// 应用更新状态（主进程 updater.ts 推送）
import { reactive } from 'vue'
import { api, on } from './api'
import { confirmDialog, toast } from './ui'

export const update = reactive({ status: 'idle', current: '', version: '', percent: 0, message: '', notes: '' })

export const initUpdate = async() => {
  Object.assign(update, await api('update.state'))
  on('update:state', (s: any) => {
    const wasDownloaded = update.status == 'downloaded'
    Object.assign(update, s)
    if (s.status == 'downloaded' && !wasDownloaded) toast(`新版本 ${s.version} 已下载好，点左下角「重启更新」即可安装`, 'success', 6000)
  })
}

export const checkUpdate = async() => {
  const s = await api<any>('update.check')
  Object.assign(update, s)
}

export const installUpdate = async() => {
  const notes = update.notes ? `\n\n更新内容：\n${update.notes}` : ''
  if (await confirmDialog(`安装新版本 ${update.version}？`, `Veya Music 会关闭并自动重新打开，正在播放的音乐会中断。${notes}`, { okText: '重启更新' })) void api('update.install')
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
