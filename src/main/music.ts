// 在线音乐数据：搜索/歌单/榜单/歌词/封面（LX musicSdk）+ 播放链接（音源脚本）
import fs from 'fs'
import path from 'path'
// @ts-expect-error js module
import sdk from './lx/utils/musicSdk/index'
import * as userApi from './userApi'
import { session } from 'electron'
import { dataDir, load, save } from './store'

export const SOURCES = [
  { id: 'kw', name: '酷我' },
  { id: 'kg', name: '酷狗' },
  { id: 'tx', name: 'QQ' },
  { id: 'wy', name: '网易' },
  { id: 'mg', name: '咪咕' },
]
export const QUALITYS = ['128k', '320k', 'flac', 'flac24bit']

export const rawSdk = sdk

export const songId = (s: any) => s.source == 'kg' ? `${s.songmid}_${s.hash}` : `${s.source}_${s.songmid}`

export const normSong = (s: any) => {
  if (!s || !s.source || s.songmid == null) return null
  s.id = songId(s)
  s.name = String(s.name ?? '').trim()
  s.singer = String(s.singer ?? '').trim()
  s.albumName = String(s.albumName ?? '')
  s.types ??= []
  s._types ??= {}
  delete s.typeUrl
  delete s.otherSource
  delete s.lrc
  return s
}
export const normSongs = (list: any[]) => {
  const ids = new Set<string>()
  const out: any[] = []
  for (const raw of list ?? []) {
    const s = normSong(raw)
    if (!s || !s.name || ids.has(s.id)) continue
    ids.add(s.id)
    out.push(s)
  }
  return out
}

const unwrap = async(r: any) => (r && typeof r.then != 'function' && r.promise) ? r.promise : r
const withTimeout = <T>(p: Promise<T>, ms: number, msg = '请求超时') => new Promise<T>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(msg)), ms)
  p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
})
const retry = async<T>(fn: () => Promise<T>, times = 2): Promise<T> => {
  let lastErr: any
  for (let i = 0; i < times; i++) {
    try { return await fn() } catch (err) { lastErr = err }
  }
  throw lastErr
}

// ---------- 带过期时间的内存缓存 ----------
const memCache = new Map<string, { t: number, v: any }>()
const cached = async<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> => {
  const hit = memCache.get(key)
  if (hit && Date.now() - hit.t < ttl) return hit.v
  const v = await fn()
  memCache.set(key, { t: Date.now(), v })
  if (memCache.size > 400) {
    const now = Date.now()
    for (const [k, c] of memCache) if (now - c.t > 30 * 60_000) memCache.delete(k)
  }
  return v
}
const MIN = 60_000

// ---------- 搜索 ----------
export const searchMusic = (source: string, text: string, page = 1, limit = 30) =>
  cached(`search_${source}_${text}_${page}_${limit}`, 10 * MIN, () => retry(async() => {
    const r: any = await withTimeout(sdk[source].musicSearch.search(text, page, limit), 15_000)
    return { list: normSongs(r.list), total: r.total ?? 0, allPage: r.allPage ?? 1, limit: r.limit ?? limit, source }
  }))

export const tipSearch = async(text: string) => {
  for (const source of ['kw', 'wy', 'tx']) {
    try {
      const r = await withTimeout<any>(sdk[source].tipSearch.search(text), 4000)
      if (Array.isArray(r) && r.length) return r.slice(0, 10).map(String)
    } catch {}
  }
  return []
}

export const hotSearch = () => cached('hotSearch', 30 * MIN, async() => {
  const result = await Promise.all(['kw', 'wy', 'tx'].map(async source => {
    try {
      const r: any = await withTimeout(sdk[source].hotSearch.getList(), 6000)
      return r.list.slice(0, 20).map(String)
    } catch { return [] }
  }))
  const out: string[] = []
  for (let i = 0; i < 20 && out.length < 24; i++) {
    for (const l of result) if (l[i] && !out.includes(l[i])) out.push(l[i])
  }
  return out
})

// ---------- 歌单 ----------
export const songListMeta = (source: string) => cached(`sl_meta_${source}`, 60 * MIN, async() => {
  const tags: any = await withTimeout(sdk[source].songList.getTags(), 15_000).catch(() => ({ tags: [], hotTag: [] }))
  return { sortList: sdk[source].songList.sortList, tags: tags.tags ?? [], hotTag: tags.hotTag ?? [] }
})

export const songLists = (source: string, sortId: any, tagId: any, page = 1) =>
  cached(`sl_list_${source}_${sortId}_${tagId}_${page}`, 20 * MIN, () => retry(async() => {
    const sort = sortId ?? sdk[source].songList.sortList[0].id
    const r: any = await withTimeout(sdk[source].songList.getList(sort, tagId ?? '', page), 15_000)
    return { list: r.list ?? [], total: r.total ?? 0, limit: r.limit ?? 30, page, source }
  }))

export const searchSongLists = (source: string, text: string, page = 1, limit = 20) =>
  cached(`sl_search_${source}_${text}_${page}_${limit}`, 20 * MIN, async() => {
    const r: any = await withTimeout(sdk[source].songList.search(text, page, limit), 15_000)
    return { list: (r.list ?? []).map((l: any) => ({ ...l, source })), total: r.total ?? 0, limit: r.limit ?? limit, page, source }
  })

/** 获取歌单全部歌曲（自动翻页）。id 也可以是歌单链接 */
export const songListDetail = (source: string, id: string, maxSongs = 3000) =>
  cached(`sl_detail_${source}_${id}`, 15 * MIN, async() => {
    const first: any = await retry(() => withTimeout(sdk[source].songList.getListDetail(id, 1), 25_000))
    let list = [...(first.list ?? [])]
    const total = Math.min(first.total ?? list.length, maxSongs)
    const limit = first.limit || list.length || 30
    for (let page = 2; list.length < total && page <= Math.ceil(total / limit) && page < 80; page++) {
      try {
        const r: any = await withTimeout(sdk[source].songList.getListDetail(id, page), 25_000)
        if (!r.list?.length) break
        list = list.concat(r.list)
      } catch { break }
    }
    return { list: normSongs(list), info: first.info ?? {}, total: first.total ?? list.length, source, id }
  })

// ---------- 排行榜 ----------
export const boards = (source: string) => cached(`boards_${source}`, 120 * MIN, async() => {
  const r: any = await withTimeout(Promise.resolve(sdk[source].leaderboard.getBoards()), 15_000)
  return (r.list ?? []).map((b: any) => ({ id: b.id, name: b.name, source }))
})

export const boardDetail = (boardId: string) => cached(`board_${boardId}`, 30 * MIN, () => retry(async() => {
  const [source, bangId] = boardId.split('__')
  const r: any = await withTimeout(sdk[source].leaderboard.getList(bangId, 1), 20_000)
  return { list: normSongs(r.list), total: r.total ?? 0, source, id: boardId }
}))

// ---------- 歌词 / 封面 ----------
const lyricDir = () => {
  const dir = path.join(dataDir(), 'lyrics')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}
const lyricFile = (id: string) => path.join(lyricDir(), id.replace(/[^\w.-]/g, '_') + '.json')

export const getLyric = async(song: any, refresh = false) => {
  const file = lyricFile(song.id)
  if (!refresh) {
    try {
      const data = JSON.parse(await fs.promises.readFile(file, 'utf8'))
      if (data?.lyric) return data
    } catch {}
  }
  const info: any = await retry(() => withTimeout(unwrap(sdk[song.source].getLyric({ ...song })), 15_000))
  const data = { lyric: info.lyric ?? '', tlyric: info.tlyric ?? '', rlyric: info.rlyric ?? '', lxlyric: info.lxlyric ?? '' }
  if (data.lyric) fs.promises.writeFile(file, JSON.stringify(data)).catch(() => {})
  return data
}

export const getPic = async(song: any) => {
  if (song.img) return song.img as string
  return cached(`pic_${song.id}`, 24 * 60 * MIN, async() => {
    const url = await withTimeout(unwrap(sdk[song.source].getPic({ ...song })), 10_000).catch(() => '')
    return typeof url == 'string' ? url : ''
  })
}

// ---------- 播放链接 ----------
const urlCache = new Map<string, { t: number, v: any }>()
const failStat = new Map<string, { n: number, t: number }>() // `${scriptId}_${source}` -> 连续失败次数

// 每个「音源脚本 × 平台」的长期表现：成功/失败次数、取链接耗时（滑动平均）、返回错歌的次数
interface PairStat { ok: number, fail: number, bad: number, ms: number, t: number }
const pairStats = () => load<Record<string, PairStat>>('sourceStats', {})
const notePair = (key: string, patch: { ok?: boolean, ms?: number, bad?: boolean }) => {
  const all = pairStats()
  const st = all[key] ??= { ok: 0, fail: 0, bad: 0, ms: 0, t: 0 }
  if (patch.bad) st.bad++
  else if (patch.ok) {
    st.ok++
    if (patch.ms) st.ms = st.ms ? Math.round(st.ms * 0.7 + patch.ms * 0.3) : patch.ms
  } else st.fail++
  // 让旧数据逐渐淡出，音源恢复/变差后排序能跟着变
  if (st.ok + st.fail > 40) {
    st.ok = Math.round(st.ok / 2)
    st.fail = Math.round(st.fail / 2)
    st.bad = Math.round(st.bad / 2)
  }
  st.t = Date.now()
  save('sourceStats', all)
}
/** 分数越小越优先：耗时 ÷ 成功率，返回过错歌的再加罚 */
const pairScore = (key: string) => {
  const st = pairStats()[key]
  if (!st || !(st.ok + st.fail)) return 4000
  const rate = (st.ok + 1) / (st.ok + st.fail + 2)
  const badRate = st.bad / Math.max(1, st.ok)
  // 测速时下载很慢的（<150 KB/s，无损会卡）再往后排
  const [scriptId, source] = key.split('_')
  const cell = load<any>('sourceSpeed', { results: {} }).results?.[scriptId]?.[source]
  const slow = cell?.ok && cell.kbps < 150 ? 3000 : 0
  return (st.ms || 4000) / rate * (1 + 4 * Math.min(1, badRate)) + slow
}
const autoOrder = () => load<any>('settings', {}).sourceOrder != 'manual'

// 音源返回的音频与歌曲信息对不上（时长差很多）的记录：`${scriptId}|${songId}` -> 时间
const badUrls = () => load<Record<string, number>>('badUrls', {})
const isBadUrl = (scriptId: string, songId: string) => !!badUrls()[`${scriptId}|${songId}`]

/** 播放器发现音频时长与歌曲信息不符时上报：这个脚本以后不再用于这首歌，并降低它在该平台的优先级 */
export const reportMismatch = (song: any, scriptId: string) => {
  if (!song?.id || !scriptId) return
  const all = badUrls()
  all[`${scriptId}|${song.id}`] = Date.now()
  const keys = Object.keys(all)
  if (keys.length > 1000) for (const k of keys.sort((a, b) => all[a] - all[b]).slice(0, 200)) delete all[k]
  save('badUrls', all)
  notePair(`${scriptId}_${song.source}`, { bad: true })
  for (const k of [...urlCache.keys()]) if (urlCache.get(k)?.v?.song?.id == song.id || k.startsWith(song.id + '_')) urlCache.delete(k)
}

const pickQualitys = (song: any, preferred: string, supported: string[] | undefined) => {
  const maxIdx = Math.max(0, QUALITYS.indexOf(preferred))
  const has = (q: string) => !Object.keys(song._types ?? {}).length || song._types[q]
  const ok = (q: string) => !supported || supported.includes(q)
  const list: string[] = []
  for (let i = maxIdx; i >= 0; i--) {
    const q = QUALITYS[i]
    if (has(q) && ok(q)) { list.push(q); break }
  }
  if (!list.includes('128k') && ok('128k')) list.push('128k')
  return list
}

interface UrlOptions { exclude?: Set<string>, onlyBad?: boolean }
const requestUrlBySong = async(song: any, preferred: string, errors: string[], opts: UrlOptions = {}) => {
  // onlyBad：最后的兜底，只试之前被标记为「时长不符」的脚本（可能其实是歌曲信息本身不准）
  const scripts = userApi.getList().filter(m => m.enabled && !opts.exclude?.has(`${m.id}|${song.id}`) &&
    (!m.sources || m.sources[song.source]?.actions.includes('musicUrl')) && isBadUrl(m.id, song.id) == !!opts.onlyBad)
  // 最近连续失败的脚本排到后面；其余按测速/历史表现从快到慢（设置为「按列表顺序」时保持手动顺序）
  const penalty = (id: string) => {
    const f = failStat.get(`${id}_${song.source}`)
    return f && f.n >= 2 && Date.now() - f.t < 10 * MIN ? 1 : 0
  }
  const auto = autoOrder()
  const rank = new Map(scripts.map(m => [m.id, [penalty(m.id), auto ? pairScore(`${m.id}_${song.source}`) : 0]]))
  scripts.sort((a, b) => rank.get(a.id)![0] - rank.get(b.id)![0] || rank.get(a.id)![1] - rank.get(b.id)![1])
  const info = { ...song, typeUrl: {} }
  for (const meta of scripts) {
    const key = `${meta.id}_${song.source}`
    for (const quality of pickQualitys(song, preferred, meta.sources?.[song.source]?.qualitys)) {
      const t0 = Date.now()
      try {
        const r = await userApi.request(meta.id, { source: song.source, action: 'musicUrl', info: { type: quality, musicInfo: info } }, 15_000)
        const url = r?.data?.url
        if (!url) throw new Error('未返回链接')
        failStat.delete(key)
        notePair(key, { ok: true, ms: Date.now() - t0 })
        return { url: url as string, quality, scriptId: meta.id, scriptName: meta.name, unverified: !!opts.onlyBad }
      } catch (err: any) {
        errors.push(`${meta.name}[${song.source} ${quality}]: ${err?.message ?? err}`)
        const f = failStat.get(key) ?? { n: 0, t: 0 }
        failStat.set(key, { n: f.n + 1, t: Date.now() })
        notePair(key, { ok: false })
      }
    }
  }
  return null
}

export const findOtherSources = (song: any) => cached(`other_${song.id}`, 6 * 60 * MIN, async() => {
  const list: any[] = await withTimeout(sdk.findMusic({ name: song.name, singer: song.singer, albumName: song.albumName, interval: song.interval, source: song.source }), 20_000).catch(() => [])
  return normSongs(list)
})

/**
 * 获取播放链接：依次尝试各音源脚本 → 都失败则自动换到其他平台的同一首歌
 */
export const getMusicUrl = async(song: any, preferred = '320k', opts: { refresh?: boolean, allowSwitch?: boolean, exclude?: string[] } = {}) => {
  const cacheKey = `${song.id}_${preferred}`
  const hit = urlCache.get(cacheKey)
  if (!opts.refresh && hit && Date.now() - hit.t < 20 * MIN) return hit.v
  if (!userApi.getList().some(m => m.enabled)) throw new Error('还没有可用的音源，请先到「设置 → 音源管理」导入音源脚本')

  const errors: string[] = []
  // exclude：播放器在本次播放里已经确认「给的不是这首歌」的组合，格式 `脚本id|歌曲id`
  const exclude = new Set(opts.exclude ?? [])
  let result: any = await requestUrlBySong(song, preferred, errors, { exclude })
  let playSong = song
  if (!result && opts.allowSwitch !== false) {
    const others = await findOtherSources(song)
    for (const other of others.slice(0, 4)) {
      result = await requestUrlBySong(other, preferred, errors, { exclude })
      if (result) { playSong = other; break }
    }
  }
  if (!result) result = await requestUrlBySong(song, preferred, errors, { exclude, onlyBad: true })
  if (!result) {
    const err: any = new Error('所有音源都无法获取这首歌的播放链接')
    err.details = errors.slice(0, 12)
    throw err
  }
  const value = { ...result, switched: playSong !== song, song: playSong }
  urlCache.set(cacheKey, { t: Date.now(), v: value })
  if (urlCache.size > 500) urlCache.delete(urlCache.keys().next().value!)
  return value
}

// ---------- 音源测速 ----------
// 对每个启用的音源脚本、每个平台：取一首榜单歌曲的播放链接（记录耗时），再试着下载开头一小段（记录下载速度）
export interface SpeedCell { ok: boolean, ms: number, kbps: number, err: string }
type SpeedResults = Record<string, Record<string, SpeedCell>>
const PROBE_BOARDS: Record<string, string> = { kw: 'kw__16', kg: 'kg__8888', tx: 'tx__26', wy: 'wy__3778678', mg: 'mg__27186466' }
const PROBE_BYTES = 384 * 1024

const speedState = { running: false, done: 0, total: 0 }
let liveResults: SpeedResults | null = null
let onSpeedChange: () => void = () => {}
export const setOnSpeedChange = (fn: () => void) => { onSpeedChange = fn }
const speedData = () => load<{ t: number, results: SpeedResults }>('sourceSpeed', { t: 0, results: {} })
export const getSpeedState = () => ({ ...speedState, t: speedData().t })

/** 音源列表 + 每个音源最近一次的测速结果 */
export const sourceList = () => {
  const results = liveResults ?? speedData().results
  return userApi.getStatusList().map(m => ({ ...m, speed: results[m.id] ?? null }))
}

/** 试下载链接开头的一小段：确认是能播放的音频，并估算下载速度（走和播放器相同的网络通道） */
const probeUrl = async(url: string) => {
  const t0 = Date.now()
  const res = await session.defaultSession.fetch(url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`链接返回 ${res.status}`)
  if (/text\/|json|xml/i.test(res.headers.get('content-type') ?? '')) throw new Error('链接不是音频文件')
  let bytes = 0
  const reader = res.body!.getReader()
  while (bytes < PROBE_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.length
  }
  void reader.cancel().catch(() => {})
  if (bytes < 30_000) throw new Error('链接内容无效')
  return Math.round(bytes / 1024 / Math.max(0.05, (Date.now() - t0) / 1000))
}

export const speedTest = async() => {
  if (speedState.running) return sourceList()
  const scripts = userApi.getList().filter(m => m.enabled)
  if (!scripts.length) throw new Error('没有启用的音源')
  const preferred = load<any>('settings', {}).quality ?? '320k'
  Object.assign(speedState, { running: true, done: 0, total: scripts.length * SOURCES.length })
  const results: SpeedResults = liveResults = {}
  onSpeedChange()
  try {
    const probes: Record<string, any[]> = {}
    await Promise.all(SOURCES.map(async({ id }) => {
      probes[id] = await boardDetail(PROBE_BOARDS[id]).then(r => r.list.slice(0, 2)).catch(() => [])
    }))
    await Promise.all(scripts.map(async meta => {
      const row: Record<string, SpeedCell> = results[meta.id] = {}
      // 先完成初始化，避免把脚本启动的时间算进第一个平台的耗时里
      const initError = await userApi.ensure(meta.id)
      for (const { id: source } of SOURCES) {
        const supported = userApi.getList().find(m => m.id == meta.id)?.sources
        if (!initError && supported && !supported[source]?.actions.includes('musicUrl')) {
          speedState.done++
          continue
        }
        const cell: SpeedCell = { ok: false, ms: 0, kbps: 0, err: initError || (probes[source].length ? '' : '没拿到测试歌曲') }
        if (!initError) {
          for (const song of probes[source]) {
            const quality = pickQualitys(song, preferred, supported?.[source]?.qualitys)[0] ?? '128k'
            const t0 = Date.now()
            try {
              const r = await userApi.request(meta.id, { source, action: 'musicUrl', info: { type: quality, musicInfo: { ...song, typeUrl: {} } } }, 12_000)
              if (!r?.data?.url) throw new Error('未返回链接')
              const ms = Date.now() - t0
              const kbps = await probeUrl(r.data.url)
              Object.assign(cell, { ok: true, ms, kbps, err: '' })
              break
            } catch (err: any) {
              cell.err = String(err?.message ?? err).slice(0, 120)
            }
          }
        }
        row[source] = cell
        // 测速结果直接作为排序依据（相当于 3 次观测），之后的实际播放会继续修正
        const key = `${meta.id}_${source}`
        const all = pairStats()
        all[key] = { ok: cell.ok ? 3 : 0, fail: cell.ok ? 0 : 3, bad: Math.floor((all[key]?.bad ?? 0) / 2), ms: cell.ms, t: Date.now() }
        save('sourceStats', all)
        failStat.delete(key)
        speedState.done++
        onSpeedChange()
      }
    }))
    save('sourceSpeed', { t: Date.now(), results })
  } finally {
    speedState.running = false
    liveResults = null
    onSpeedChange()
  }
  return sourceList()
}

/** 停用上次测速里所有平台都失败的音源，返回被停用的名字 */
export const disableDeadSources = async() => {
  const results = speedData().results
  const names: string[] = []
  for (const m of userApi.getList()) {
    const cells = Object.values(results[m.id] ?? {})
    if (!m.enabled || !cells.length || cells.some(c => c.ok)) continue
    await userApi.setEnabled(m.id, false)
    names.push(m.name)
  }
  return names
}
