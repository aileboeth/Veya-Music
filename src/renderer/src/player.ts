// 播放器核心：播放队列、播放模式、歌词、听歌记录、相似歌曲续播
import { markRaw, reactive, watch } from 'vue'
import { api, formatTime, on, qualityName, type Song } from './api'
import { settings } from './settings'
import { toast } from './ui'
import { buildLyric, type LyricLine } from './lyricFx'

export interface QueueSource { type: string, name: string, route?: { name: string, params: Record<string, any> } }
export type { LyricLine }

export const player = reactive({
  queue: [] as Song[],
  index: -1,
  song: null as Song | null,
  cover: '',
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  source: null as QueueSource | null,
  radio: false,
  extending: false,
  lyric: [] as LyricLine[],
  lyricIndex: -1,
  lyricState: '' as '' | 'loading' | 'none',
  info: null as null | { quality: string, scriptName: string, scriptId: string, switched: boolean, unverified?: boolean, song: Song },
  showNowPlaying: false,
  showQueue: false,
  lyricWindow: false,
})

const audio = new Audio()
audio.preload = 'auto'
let token = 0
let failCount = 0
let errorRetries = 0
let started = false
let listened = 0
let lastTick = 0
// 时长校验：音源给的音频和歌曲信息的时长差太多（给错歌 / 只有试听片段）时，自动换下一个音源
let mismatchScripts: string[] = []
let mismatchFallback: any = null
let wantPlay = true
const shuffleHistory: number[] = []

const parseInterval = (interval: string | undefined) => {
  if (!interval) return 0
  return String(interval).split(':').reduce((n, p) => n * 60 + (parseInt(p) || 0), 0)
}

// ---------------- 歌词 ----------------
const loadLyric = async(song: Song, tk: number) => {
  player.lyric = []
  player.lyricIndex = -1
  player.lyricState = 'loading'
  try {
    const data = await api('music.lyric', song)
    if (tk != token) return
    player.lyric = markRaw(buildLyric(data))
    player.lyricState = player.lyric.length ? '' : 'none'
  } catch {
    if (tk == token) player.lyricState = 'none'
  }
  pushDesktopLyric()
}

const updateLyricIndex = () => {
  const lines = player.lyric
  if (!lines.length) return
  const t = player.time + 0.2
  let lo = 0
  let hi = lines.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) { idx = mid; lo = mid + 1 } else hi = mid - 1
  }
  if (idx != player.lyricIndex) {
    player.lyricIndex = idx
    pushDesktopLyric()
  }
}

/** 精确的当前播放时间（player.time 一秒只更新几次，做逐字动效不够用） */
export const getTime = () => audio.src && !audio.paused ? audio.currentTime : player.time

let lastLyricPush = 0
const pushDesktopLyric = () => {
  if (!player.lyricWindow) return
  const line = player.lyric[player.lyricIndex]
  const next = player.lyric[player.lyricIndex + 1]
  const title = player.song ? `${player.song.name} - ${player.song.singer}` : ''
  lastLyricPush = Date.now()
  void api('lyric.push', {
    title,
    playing: player.playing && !audio.paused,
    // 逐字动效用：桌面歌词窗口拿到当前播放位置后自己按时间往下走
    pos: audio.src ? audio.currentTime : player.time,
    index: player.lyricIndex,
    line: line ? { start: line.time, dur: line.dur, words: line.words ?? null, text: line.text } : null,
    nextLine: next ? { start: next.time, dur: next.dur, words: next.words ?? null, text: next.text } : null,
    text: line?.text ?? (player.song ? (player.lyricState == 'none' ? title : (player.lyric.length ? title : '')) : 'Veya Music'),
    trans: settings.showTranslation ? (line?.trans ?? '') : '',
    next: next?.text ?? '',
  }).catch(() => {})
}

// ---------------- 听歌记录 ----------------
const settleStats = (manualSkip: boolean, ended = false) => {
  const song = player.song
  if (!song || !started) return
  const dur = player.duration || parseInterval(song.interval) || 240
  if (ended || listened >= dur * 0.8) void api('stats.record', song, 'done')
  else if (manualSkip && listened < Math.min(30, dur * 0.3)) void api('stats.record', song, 'skip')
  started = false
}

// ---------------- 加载与播放 ----------------
const loadSong = async(song: Song, autoplay = true, startAt = 0, refresh = false, recheck = false) => {
  const tk = ++token
  wantPlay = autoplay
  if (!recheck) {
    mismatchScripts = []
    mismatchFallback = null
  }
  player.song = song
  player.loading = true
  player.info = null
  player.time = startAt
  player.duration = parseInterval(song.interval)
  player.cover = song.img ?? ''
  if (!refresh) {
    started = false
    listened = 0
    errorRetries = 0
  }
  audio.pause()
  audio.removeAttribute('src')
  if (!refresh) void loadLyric(song, tk)
  if (!song.img) {
    void api<string>('music.pic', song).then(url => {
      if (tk == token && url) {
        song.img = url
        player.cover = url
        updateMediaSession()
      }
    }).catch(() => {})
  }
  updateMediaSession()
  syncState()
  try {
    let info: any
    try {
      info = await api('music.url', song, settings.quality, { refresh, allowSwitch: settings.autoSwitchSource, exclude: mismatchScripts })
    } catch (err) {
      // 换遍了也没有时长吻合的：可能是歌曲信息本身不准，退回第一个结果并提醒
      if (tk != token || !mismatchFallback) throw err
      info = { ...mismatchFallback, unverified: true }
      toast(`没有找到与《${song.name}》时长吻合的音源，现在播放的内容可能不是这首歌`, 'error', 5000)
    }
    if (tk != token) return
    player.info = info
    audio.src = info.url
    if (startAt > 0) audio.currentTime = startAt
    if (autoplay) {
      await audio.play()
      if (info.switched) toast(`已自动换源：${info.song.name}（${info.scriptName}）`)
    } else player.loading = false
  } catch (err: any) {
    if (tk != token) return
    if (err?.name == 'AbortError') return
    onPlayFail(err?.message ?? String(err), autoplay)
  }
}

const onPlayFail = (message: string, autoNext = true) => {
  player.loading = false
  player.playing = false
  failCount++
  toast(`《${player.song?.name ?? ''}》播放失败：${message}`, 'error')
  syncState()
  if (!autoNext) return
  if (failCount >= 4 || player.queue.length < 2) {
    if (failCount >= 4) toast('连续多首歌曲播放失败，已停止。请检查网络或到设置里更换音源', 'error', 5000)
    failCount = 0
    return
  }
  const tk = token
  setTimeout(() => { if (tk == token) void next(true, true) }, 1200)
}

audio.addEventListener('playing', () => {
  player.playing = true
  player.loading = false
  failCount = 0
  lastTick = audio.currentTime
  if (!started && player.song) {
    started = true
    void api('stats.record', player.song, 'play')
  }
  syncState()
})
audio.addEventListener('pause', () => {
  player.playing = false
  syncState()
})
audio.addEventListener('waiting', () => { if (player.playing) player.loading = true })
audio.addEventListener('canplay', () => { player.loading = false })
audio.addEventListener('loadedmetadata', () => {
  const info: any = player.info
  const song = player.song
  if (!info || !song || info.unverified || !Number.isFinite(audio.duration)) return
  const expected = parseInterval(info.song?.interval ?? song.interval)
  if (expected < 30 || Math.abs(audio.duration - expected) <= Math.max(10, expected * 0.06)) return
  void api('music.mismatch', info.song ?? song, info.scriptId).catch(() => {})
  mismatchScripts.push(`${info.scriptId}|${(info.song ?? song).id}`)
  mismatchFallback ??= info
  toast(`「${info.scriptName}」给的音频时长对不上（${formatTime(audio.duration)} / 应为 ${formatTime(expected)}），正在换其他音源…`)
  void loadSong(song, wantPlay, 0, true, true)
})
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) player.duration = audio.duration
})
audio.addEventListener('timeupdate', () => {
  const t = audio.currentTime
  const delta = t - lastTick
  if (delta > 0 && delta < 1.5) listened += delta
  lastTick = t
  player.time = t
  updateLyricIndex()
  // 定时给桌面歌词对一下表（拖动进度、卡顿之后不会跑偏）
  if (player.lyricWindow && Date.now() - lastLyricPush > 1500) pushDesktopLyric()
})
audio.addEventListener('ended', () => {
  settleStats(false, true)
  void next(true)
})
audio.addEventListener('error', () => {
  if (!audio.src || !player.song) return
  // 链接过期或这个音源给的文件放不了：换别的音源重新取链接，最多换 3 次
  if (errorRetries < 3) {
    errorRetries++
    const info: any = player.info
    const song = player.song
    if (info?.scriptId) {
      void api('music.playFail', info.song ?? song, info.scriptId).catch(() => {})
      mismatchScripts.push(`${info.scriptId}|${(info.song ?? song).id}`)
    }
    void loadSong(song, true, player.time > 3 ? player.time : 0, true, true)
    return
  }
  onPlayFail('音频加载失败')
})

const playIndex = (index: number, autoplay = true) => {
  const song = player.queue[index]
  if (!song) return
  player.index = index
  void loadSong(song, autoplay)
}

/** 播放一个列表（替换当前队列） */
export const playList = (songs: Song[], index = 0, source: QueueSource | null = null) => {
  if (!songs.length) return
  settleStats(false)
  player.queue = songs.map(s => markRaw(s))
  player.source = source
  player.radio = source?.type == 'radio'
  shuffleHistory.length = 0
  failCount = 0
  playIndex(Math.max(0, Math.min(index, songs.length - 1)))
}

/** 播放队列里的某一首 */
export const playQueueIndex = (index: number) => {
  if (index == player.index && player.song) return void toggle()
  settleStats(false)
  if (settings.playMode == 'shuffle' && player.index > -1) shuffleHistory.push(player.index)
  playIndex(index)
}

/** 立即播放单曲：插到当前歌曲后面并切过去 */
export const playSong = (song: Song) => {
  const exist = player.queue.findIndex(s => s.id == song.id)
  if (exist > -1) return playQueueIndex(exist)
  settleStats(false)
  player.queue.splice(player.index + 1, 0, markRaw(song))
  playIndex(player.index + 1)
}

export const addNext = (songs: Song[]) => {
  const ids = new Set(songs.map(s => s.id))
  const cur = player.song
  const rest = player.queue.filter(s => !ids.has(s.id) || s.id == cur?.id)
  const curIdx = cur ? rest.findIndex(s => s.id == cur.id) : -1
  rest.splice(curIdx + 1, 0, ...songs.filter(s => s.id != cur?.id).map(s => markRaw(s)))
  player.queue = rest
  player.index = curIdx
  if (!cur) playIndex(0)
  toast(`已添加 ${songs.length} 首到下一首播放`)
}

export const enqueue = (songs: Song[]) => {
  const ids = new Set(player.queue.map(s => s.id))
  const fresh = songs.filter(s => !ids.has(s.id)).map(s => markRaw(s))
  player.queue.push(...fresh)
  if (!player.song && player.queue.length) playIndex(0)
  toast(fresh.length ? `已添加 ${fresh.length} 首到播放队列` : '歌曲已在播放队列中')
}

export const removeFromQueue = (index: number) => {
  if (index < 0 || index >= player.queue.length) return
  const isCurrent = index == player.index
  player.queue.splice(index, 1)
  shuffleHistory.length = 0
  if (index < player.index) player.index--
  if (isCurrent) {
    if (!player.queue.length) return stop()
    player.index = Math.min(player.index, player.queue.length - 1)
    playIndex(player.index, player.playing)
  }
}

export const clearQueue = () => {
  player.queue = []
  stop()
}

const stop = () => {
  token++
  audio.pause()
  audio.removeAttribute('src')
  Object.assign(player, { index: -1, song: null, cover: '', playing: false, loading: false, time: 0, duration: 0, lyric: [], lyricIndex: -1, info: null, radio: false, source: null })
  syncState()
  pushDesktopLyric()
}

export const toggle = () => {
  if (!player.song) {
    if (player.queue.length) playIndex(Math.max(0, player.index))
    return
  }
  if (audio.src && !audio.error) {
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  } else void loadSong(player.song, true, player.time)
}

export const seek = (time: number) => {
  if (!player.song) return
  player.time = time
  if (audio.src) {
    audio.currentTime = time
    lastTick = time
  }
  updateLyricIndex()
  pushDesktopLyric()
}

/** 用最近的几首歌作种子，追加相似歌曲 */
const extendQueue = async() => {
  if (player.extending) return false
  player.extending = true
  try {
    const seeds = player.queue.slice(Math.max(0, player.index - 2), player.index + 1)
    const songs = await api<Song[]>('rec.radio', seeds.length ? seeds : player.queue.slice(-3), player.queue.map(s => s.id), 15)
    if (!songs.length) return false
    const ids = new Set(player.queue.map(s => s.id))
    player.queue.push(...songs.filter(s => !ids.has(s.id)).map(s => markRaw(s)))
    return true
  } catch {
    return false
  } finally {
    player.extending = false
  }
}

export const next = async(auto = false, afterFail = false) => {
  const len = player.queue.length
  if (!len) return
  if (!auto) settleStats(true)
  if (auto && !afterFail && settings.playMode == 'single') return playIndex(player.index)

  if (settings.playMode == 'shuffle' && len > 1) {
    let idx = player.index
    while (idx == player.index) idx = Math.floor(Math.random() * len)
    shuffleHistory.push(player.index)
    if (shuffleHistory.length > 200) shuffleHistory.shift()
    return playIndex(idx)
  }

  let idx = player.index + 1
  if (idx >= len) {
    const canExtend = player.radio || (settings.autoContinue && settings.playMode == 'order')
    if (canExtend) {
      const tk = token
      player.loading = true
      const ok = await extendQueue()
      if (tk != token) return
      player.loading = false
      if (ok) {
        if (!player.radio) toast('列表播放完了，已为你续播相似歌曲', 'success')
        return playIndex(idx)
      }
    }
    if (settings.playMode == 'order' && auto && !player.radio) {
      // 顺序播放到头：停在最后一首
      audio.pause()
      player.playing = false
      syncState()
      return
    }
    idx = 0
  }
  playIndex(idx)
  if (player.radio && len - idx <= 3) void extendQueue()
}

export const prev = () => {
  const len = player.queue.length
  if (!len) return
  if (player.time > 6) return seek(0)
  settleStats(false)
  if (settings.playMode == 'shuffle' && shuffleHistory.length) return playIndex(shuffleHistory.pop()!)
  playIndex((player.index - 1 + len) % len)
}

/** 相似歌曲电台：从一首歌出发无限播放 */
export const startRadio = async(seed: Song) => {
  playList([seed], 0, { type: 'radio', name: `《${seed.name}》的相似电台` })
  toast('正在生成相似歌曲电台…')
  await extendQueue()
}

/** 私人电台：从听歌记录里挑种子 */
export const startPersonalRadio = async() => {
  const recent = await api<Song[]>('stats.recent')
  if (!recent.length) return toast('多听几首歌之后，私人电台才能了解你的口味')
  const pool = recent.slice(0, 30).sort(() => Math.random() - 0.5).slice(0, 3)
  toast('正在生成私人电台…')
  const songs = await api<Song[]>('rec.radio', pool, [], 20)
  if (!songs.length) return toast('暂时没有拿到推荐，稍后再试', 'error')
  playList(songs, 0, { type: 'radio', name: '私人电台' })
}

const modes = ['order', 'loop', 'shuffle', 'single'] as const
export const modeNames: Record<string, string> = { order: '顺序播放', loop: '列表循环', shuffle: '随机播放', single: '单曲循环' }
export const cycleMode = () => {
  settings.playMode = modes[(modes.indexOf(settings.playMode) + 1) % modes.length]
  toast(modeNames[settings.playMode] + (settings.playMode == 'order' && settings.autoContinue ? '（播完自动续播相似歌曲）' : ''))
}

export const setQuality = (quality: string) => {
  if (settings.quality == quality) return
  settings.quality = quality
  toast(`音质已切换为 ${qualityName(quality)}`)
  if (player.song) void loadSong(player.song, player.playing, player.time, true)
}

export const toggleDesktopLyric = () => void api('lyric.toggle')

// ---------------- 系统集成 ----------------
const updateMediaSession = () => {
  if (!('mediaSession' in navigator)) return
  const song = player.song
  navigator.mediaSession.metadata = song
    ? new MediaMetadata({ title: song.name, artist: song.singer, album: song.albumName, artwork: player.cover ? [{ src: player.cover }] : [] })
    : null
}
const syncState = () => {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = player.playing ? 'playing' : 'paused'
  void api('player.state', { playing: player.playing, title: player.song ? `${player.song.name} - ${player.song.singer}` : '' }).catch(() => {})
  pushDesktopLyric()
}

let saveTimer: any = null
const saveQueue = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void api('data.save', 'queue', {
      songs: player.queue.slice(0, 2000),
      index: player.index,
      time: Math.floor(player.time),
      source: player.source,
      radio: player.radio,
    }).catch(() => {})
  }, 1200)
}

export const initPlayer = async() => {
  audio.volume = settings.volume
  watch(() => settings.volume, v => { audio.volume = Math.max(0, Math.min(1, v)) })

  const saved = await api<any>('data.load', 'queue', null)
  if (saved?.songs?.length) {
    player.queue = saved.songs.map((s: Song) => markRaw(s))
    player.source = saved.source ?? null
    player.radio = !!saved.radio
    const idx = Math.max(0, Math.min(saved.index ?? 0, player.queue.length - 1))
    player.index = idx
    const song = player.queue[idx]
    // 恢复上次的歌曲但不自动播放，也不提前请求链接
    player.song = song
    player.cover = song.img ?? ''
    player.time = saved.time ?? 0
    player.duration = parseInterval(song.interval)
    token++
    void loadLyric(song, token)
  }
  watch(() => [player.queue.length, player.index, player.song?.id], saveQueue)
  setInterval(() => { if (player.playing) saveQueue() }, 15_000)

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', toggle)
    navigator.mediaSession.setActionHandler('pause', toggle)
    navigator.mediaSession.setActionHandler('nexttrack', () => void next())
    navigator.mediaSession.setActionHandler('previoustrack', prev)
  }
  on('player:command', (cmd: string) => {
    if (cmd == 'toggle') toggle()
    else if (cmd == 'next') void next()
    else if (cmd == 'prev') prev()
  })
  player.lyricWindow = await api<boolean>('lyric.visible')
  on('lyric:visible', (v: boolean) => {
    player.lyricWindow = v
    if (v) pushDesktopLyric()
  })
  on('lyric:request', pushDesktopLyric)
  watch(() => settings.showTranslation, pushDesktopLyric)
  updateMediaSession()
  syncState()
}
