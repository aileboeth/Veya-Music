// 在线音乐数据：搜索/歌单/榜单/歌词/封面（LX musicSdk）+ 播放链接（音源脚本）
import fs from 'fs'
import path from 'path'
// @ts-expect-error js module
import sdk from './lx/utils/musicSdk/index'
import * as userApi from './userApi'
import { dataDir } from './store'

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

const requestUrlBySong = async(song: any, preferred: string, errors: string[]) => {
  const scripts = userApi.getList().filter(m => m.enabled && (!m.sources || m.sources[song.source]?.actions.includes('musicUrl')))
  // 最近连续失败的脚本排到后面
  const penalty = (id: string) => {
    const f = failStat.get(`${id}_${song.source}`)
    return f && f.n >= 2 && Date.now() - f.t < 10 * MIN ? 1 : 0
  }
  scripts.sort((a, b) => penalty(a.id) - penalty(b.id))
  const info = { ...song, typeUrl: {} }
  for (const meta of scripts) {
    const key = `${meta.id}_${song.source}`
    for (const quality of pickQualitys(song, preferred, meta.sources?.[song.source]?.qualitys)) {
      try {
        const r = await userApi.request(meta.id, { source: song.source, action: 'musicUrl', info: { type: quality, musicInfo: info } }, 15_000)
        const url = r?.data?.url
        if (!url) throw new Error('未返回链接')
        failStat.delete(key)
        return { url: url as string, quality, scriptId: meta.id, scriptName: meta.name }
      } catch (err: any) {
        errors.push(`${meta.name}[${song.source} ${quality}]: ${err?.message ?? err}`)
        const f = failStat.get(key) ?? { n: 0, t: 0 }
        failStat.set(key, { n: f.n + 1, t: Date.now() })
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
export const getMusicUrl = async(song: any, preferred = '320k', opts: { refresh?: boolean, allowSwitch?: boolean } = {}) => {
  const cacheKey = `${song.id}_${preferred}`
  const hit = urlCache.get(cacheKey)
  if (!opts.refresh && hit && Date.now() - hit.t < 20 * MIN) return hit.v
  if (!userApi.getList().some(m => m.enabled)) throw new Error('还没有可用的音源，请先到「设置 → 音源管理」导入音源脚本')

  const errors: string[] = []
  let result: any = await requestUrlBySong(song, preferred, errors)
  let playSong = song
  if (!result && opts.allowSwitch !== false) {
    const others = await findOtherSources(song)
    for (const other of others.slice(0, 4)) {
      result = await requestUrlBySong(other, preferred, errors)
      if (result) { playSong = other; break }
    }
  }
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
