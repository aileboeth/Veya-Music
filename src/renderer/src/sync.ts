// 同步状态（界面用）：配对、同步进度、在线设备和它们正在放的歌
import { reactive } from 'vue'
import { api, on } from './api'

export interface SyncDevice { id: string, name: string, platform: string, version: string, lastSeen: number, online: boolean, np?: any }
export interface SyncState {
  paired: boolean
  enabled: boolean
  url: string
  server: string
  deviceId: string
  deviceName: string
  groups: Record<'lists' | 'history' | 'sources' | 'settings', boolean>
  online: boolean
  syncing: boolean
  lastSync: number
  error: string
  pending: number
  devices: SyncDevice[]
  /** 界面上显示「正在同步…」：一次同步超过 1.5 秒才显示，平时的小同步一闪而过，不打扰 */
  showSyncing?: boolean
}

export const sync = reactive<SyncState>({
  paired: false, enabled: false, url: '', server: '', deviceId: '', deviceName: '',
  groups: { lists: true, history: true, sources: true, settings: true },
  online: false, syncing: false, lastSync: 0, error: '', pending: 0, devices: [], showSyncing: false,
})

let slowTimer: any = null
const updateShowSyncing = () => {
  if (!sync.syncing) {
    clearTimeout(slowTimer)
    slowTimer = null
    sync.showSyncing = false
  } else if (!slowTimer && !sync.showSyncing) {
    slowTimer = setTimeout(() => {
      slowTimer = null
      sync.showSyncing = sync.syncing
    }, 1500)
  }
}

/** 其他设备最新上报的「正在播放」：设备 id -> 状态 */
export const remoteNP = reactive<Record<string, any>>({})

let inited = false
export const initSync = async() => {
  if (inited) return
  inited = true
  Object.assign(sync, await api<SyncState>('sync.state'))
  updateShowSyncing()
  on('sync:state', (s: SyncState) => {
    Object.assign(sync, s)
    updateShowSyncing()
    // 下线的设备不再显示它在放什么
    for (const id of Object.keys(remoteNP)) if (!s.devices.some(d => d.id == id && d.online)) delete remoteNP[id]
    for (const d of s.devices) if (d.online && d.np && d.id != s.deviceId) remoteNP[d.id] ??= d.np
  })
  on('sync:np', (device: string, st: any) => {
    if (st) remoteNP[device] = st
    else delete remoteNP[device]
  })
}

export const otherDevices = () => sync.devices.filter(d => d.id != sync.deviceId)

export const platformName = (p: string) => ({ windows: '电脑', android: '手机', darwin: 'Mac', linux: 'Linux' } as Record<string, string>)[p] ?? p

export const timeAgo = (t: number) => {
  if (!t) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return new Date(t).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
