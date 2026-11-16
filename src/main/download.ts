// 歌曲下载：按所选音质取链接 → 保存文件（读写见 downloadIO），可同时保存 .lrc 歌词
import { getLyric, getMusicUrl } from './music'
import { load, save } from './store'
import * as io from './downloadIO'

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
let notifyTimer: ReturnType<typeof setTimeout> | null = null

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
export const defaultDir = io.defaultDir

/** 已经下载好的这首歌（文件还在）：播放时优先用本地文件，没网也能听 */
export const localFileOf = (song: any) => {
  if (!song?.id) return null
  const t = tasks.find(t => t.status == 'done' && t.song?.id == song.id && t.filePath)
  if (!t || !io.fileExists(t.filePath)) return null
  return { url: io.playableUrl(t.filePath), quality: t.quality, filePath: t.filePath }
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
const extOf = (url: string, quality: string) => {
  const m = /\.(mp3|flac|m4a|ogg|wav|ape|aac)(?:\?|$)/i.exec(url)
  if (m) return m[1].toLowerCase()
  return quality.startsWith('flac') ? 'flac' : 'mp3'
}

const runTask = async(task: DownloadTask) => {
  const settings = load<any>('settings', {})
  const dir = settings.downloadDir || defaultDir()
  try {
    task.status = 'running'
    task.message = '获取链接…'
    emit(true)
    const info = await getMusicUrl(task.song, task.quality, { refresh: true, noLocal: true })
    task.quality = info.quality
    const base = safeName(`${task.song.name} - ${task.song.singer}`)
    task.message = ''
    task.downloaded = 0
    const progress: io.Progress = {
      total: 0,
      downloaded: 0,
      onProgress: () => {
        task.total = progress.total
        task.downloaded = progress.downloaded
        task.progress = task.total ? task.downloaded / task.total : 0
        emit()
      },
      onAbort: fn => { aborts.set(task.id, fn) },
    }
    const file = await io.saveAudio(info.url, dir, base, extOf(info.url, info.quality), progress)
    if (task.status as string == 'canceled') throw new Error('已取消')
    task.filePath = file
    if (settings.downloadLyric !== false) {
      try {
        const ly = await getLyric(task.song)
        if (ly.lyric) await io.saveLyric(dir, base, ly.lyric)
      } catch {}
    }
    task.status = 'done'
    task.progress = 1
  } catch (err: any) {
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
