// 歌曲下载：按所选音质取链接 → 流式写入文件，可同时保存 .lrc 歌词
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { getLyric, getMusicUrl } from './music'
import { load, save } from './store'

export interface DownloadTask {
  id: string
  song: any
  quality: string
  status: 'waiting' | 'running' | 'done' | 'error' | 'canceled'
  progress: number
  total: number
  downloaded: number
  filePath: string
  message: string
  time: number
}

let tasks: DownloadTask[] = []
const aborts = new Map<string, () => void>()
let notify: (tasks: DownloadTask[]) => void = () => {}
let running = 0
const MAX_RUNNING = 3
let notifyTimer: NodeJS.Timeout | null = null

export const initDownload = (onUpdate: (tasks: DownloadTask[]) => void) => {
  notify = onUpdate
  tasks = load<DownloadTask[]>('downloads', []).map(t => (t.status == 'running' || t.status == 'waiting') ? { ...t, status: 'error', message: '上次未完成' } : t)
}

const emit = (immediate = false) => {
  const run = () => {
    notifyTimer = null
    notify(tasks)
    save('downloads', tasks)
  }
  if (immediate) {
    if (notifyTimer) clearTimeout(notifyTimer)
    run()
  } else notifyTimer ??= setTimeout(run, 300)
}

export const getTasks = () => tasks
export const defaultDir = () => path.join(app.getPath('music'), 'Veya Music')

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
const extOf = (url: string, quality: string) => {
  const m = /\.(mp3|flac|m4a|ogg|wav|ape|aac)(?:\?|$)/i.exec(url)
  if (m) return m[1].toLowerCase()
  return quality.startsWith('flac') ? 'flac' : 'mp3'
}

const fetchToFile = (url: string, file: string, task: DownloadTask, redirects = 0): Promise<void> => new Promise((resolve, reject) => {
  const req = (url.startsWith('https') ? https : http).get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    timeout: 30_000,
  }, res => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
      res.resume()
      fetchToFile(new URL(res.headers.location, url).href, file, task, redirects + 1).then(resolve, reject)
      return
    }
    if (res.statusCode != 200) {
      res.resume()
      reject(new Error(`服务器返回 ${res.statusCode}`))
      return
    }
    task.total = Number(res.headers['content-length'] ?? 0)
    const out = fs.createWriteStream(file)
    res.on('data', chunk => {
      task.downloaded += chunk.length
      task.progress = task.total ? task.downloaded / task.total : 0
      emit()
    })
    res.pipe(out)
    out.on('finish', () => resolve())
    out.on('error', reject)
    res.on('error', reject)
  })
  req.on('timeout', () => req.destroy(new Error('下载超时')))
  req.on('error', reject)
  aborts.set(task.id, () => req.destroy(new Error('已取消')))
})

const runTask = async(task: DownloadTask) => {
  const settings = load<any>('settings', {})
  const dir = settings.downloadDir || defaultDir()
  let tmp = ''
  try {
    task.status = 'running'
    task.message = '获取链接…'
    emit(true)
    fs.mkdirSync(dir, { recursive: true })
    const info = await getMusicUrl(task.song, task.quality, { refresh: true })
    task.quality = info.quality
    const base = safeName(`${task.song.name} - ${task.song.singer}`)
    const file = path.join(dir, `${base}.${extOf(info.url, info.quality)}`)
    tmp = file + '.veyadl'
    task.filePath = file
    task.message = ''
    task.downloaded = 0
    await fetchToFile(info.url, tmp, task)
    if (task.status as string == 'canceled') throw new Error('已取消')
    if (task.downloaded < 20_000) throw new Error('下载到的文件无效')
    fs.renameSync(tmp, file)
    if (settings.downloadLyric !== false) {
      try {
        const ly = await getLyric(task.song)
        if (ly.lyric) fs.writeFileSync(path.join(dir, `${base}.lrc`), ly.lyric)
      } catch {}
    }
    task.status = 'done'
    task.progress = 1
  } catch (err: any) {
    if (tmp) fs.promises.unlink(tmp).catch(() => {})
    if (task.status != 'canceled') {
      task.status = 'error'
      task.message = String(err?.message ?? err)
    }
  } finally {
    aborts.delete(task.id)
    emit(true)
  }
}

const pump = () => {
  while (running < MAX_RUNNING) {
    const task = tasks.find(t => t.status == 'waiting')
    if (!task) return
    running++
    task.status = 'running'
    void runTask(task).finally(() => {
      running--
      pump()
    })
  }
}

export const addTasks = (songs: any[], quality: string) => {
  for (const song of songs) {
    if (tasks.some(t => t.song.id == song.id && (t.status == 'waiting' || t.status == 'running'))) continue
    tasks = tasks.filter(t => !(t.song.id == song.id && t.status != 'done'))
    tasks.unshift({ id: `${song.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, song, quality, status: 'waiting', progress: 0, total: 0, downloaded: 0, filePath: '', message: '', time: Date.now() })
  }
  emit(true)
  pump()
}

export const cancelTask = (id: string) => {
  const task = tasks.find(t => t.id == id)
  if (!task) return
  if (task.status == 'running' || task.status == 'waiting') {
    task.status = 'canceled'
    task.message = '已取消'
    aborts.get(id)?.()
  }
  emit(true)
}

export const removeTask = (id: string) => {
  cancelTask(id)
  tasks = tasks.filter(t => t.id != id)
  emit(true)
}

export const retryTask = (id: string) => {
  const task = tasks.find(t => t.id == id)
  if (!task || task.status == 'running' || task.status == 'waiting') return
  Object.assign(task, { status: 'waiting', progress: 0, downloaded: 0, total: 0, message: '' })
  emit(true)
  pump()
}

export const clearFinished = () => {
  tasks = tasks.filter(t => t.status == 'waiting' || t.status == 'running')
  emit(true)
}
