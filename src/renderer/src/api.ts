declare global {
  interface Window {
    veya: {
      invoke: (method: string, ...args: any[]) => Promise<{ ok: boolean, data?: any, message?: string, details?: string[] }>
      on: (channel: string, handler: (...args: any[]) => void) => () => void
    }
  }
}

export interface Song {
  id: string
  name: string
  singer: string
  source: string
  songmid: string | number
  interval: string
  albumName: string
  img?: string | null
  types: Array<{ type: string, size?: string }>
  _types: Record<string, any>
  _reason?: string
  _playedAt?: number
  [key: string]: any
}

/** 去掉 Vue 的响应式代理，保证能通过 IPC 传输 */
const plain = (v: any) => v === undefined ? undefined : JSON.parse(JSON.stringify(v))

export const api = async<T = any>(method: string, ...args: any[]): Promise<T> => {
  const r = await window.veya.invoke(method, ...args.map(plain))
  if (r.ok) return r.data as T
  const err: any = new Error(r.message || '操作失败')
  err.details = r.details
  throw err
}

export const on = (channel: string, handler: (...args: any[]) => void) => window.veya.on(channel, handler)

export const SOURCES = [
  { id: 'kw', name: '酷我' },
  { id: 'kg', name: '酷狗' },
  { id: 'tx', name: 'QQ' },
  { id: 'wy', name: '网易' },
  { id: 'mg', name: '咪咕' },
]
/** 不能搜索、只在导入的歌单里出现的平台 */
const EXTRA_SOURCES: Record<string, string> = { qs: '汽水' }
export const sourceName = (id: string) => SOURCES.find(s => s.id == id)?.name ?? EXTRA_SOURCES[id] ?? id

export const QUALITYS = [
  { id: '128k', name: '标准', desc: '128k' },
  { id: '320k', name: '高品', desc: '320k' },
  { id: 'flac', name: '无损', desc: 'FLAC' },
  { id: 'flac24bit', name: 'Hi-Res', desc: '24bit' },
]
export const qualityName = (id: string) => QUALITYS.find(q => q.id == id)?.name ?? id
export const bestQuality = (song: Song) => {
  for (const q of ['flac24bit', 'flac', '320k']) if (song._types?.[q]) return q
  return ''
}
export const qualityLabel: Record<string, string> = { flac24bit: 'Hi-Res', flac: 'SQ', '320k': 'HQ' }

export const formatTime = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

/** 给封面地址加上缩略图参数，减少列表里的流量和内存占用 */
export const thumb = (url: string | null | undefined, size = 120) => {
  if (!url) return ''
  if (url.includes('music.126.net') && !url.includes('?')) return `${url}?param=${size}y${size}`
  if (url.includes('y.gtimg.cn/music/photo_new') && size <= 300) return url.replace(/R\d+x\d+M/, 'R300x300M')
  if (url.includes('douyinpic.com')) return url.replace(/~c5_\d+x\d+\./, `~c5_${size <= 150 ? '150x150' : size <= 375 ? '375x375' : '500x500'}.`)
  if (url.includes('{size}')) return url.replace('{size}', String(size <= 150 ? 150 : 480))
  return url
}
