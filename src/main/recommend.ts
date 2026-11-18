// 推荐引擎：完全基于本机的听歌记录/收藏计算，不需要登录任何平台账号
//
// 1. 画像：每首听过的歌有一个喜好分 = (完整播放 ×1 + 播放 ×0.3 − 跳过 ×0.7) × 时间衰减 + 收藏加分
// 2. 召回：取喜好分最高的一批歌作「种子」，向 QQ 音乐的相似歌曲接口要相似歌（其他平台的歌先匹配到 QQ 曲库）
// 3. 排序：候选分 = Σ 种子权重 × 名次衰减 + 歌手偏好加分；过滤已听熟/已收藏/不喜欢的歌
// 4. 打散：同一歌手最多 2 首，保证多样性
import needle from 'needle'
import { load, save } from './store'
import { agentFor } from './net'
import { boardDetail, normSongs, rawSdk, searchMusic, searchSongLists, songLists } from './music'

const DAY = 86400_000

/** sp = 从搜索结果里点开播放的次数；days = 在多少个不同的日子里听过（day 是最近一次的日期） */
export interface SongStat { s: any, plays: number, done: number, skips: number, last: number, first: number, sp?: number, days?: number, day?: string }
interface Stats { songs: Record<string, SongStat>, recent: Array<{ id: string, t: number }> }

export const getStats = () => load<Stats>('stats', { songs: {}, recent: [] })

/**
 * 本机 + 同步来的其他设备的听歌记录合在一起（只读，用来算推荐和「最近播放」）。
 * 每台设备只写自己的那份，所以这里把次数相加、时间取最近的
 */
export const mergedStats = (): Stats => {
  const own = getStats()
  const remote = load<Record<string, Record<string, SongStat>>>('statsRemote', {}) ?? {}
  const devices = Object.values(remote).filter(d => d && Object.keys(d).length)
  if (!devices.length) return own
  const songs: Record<string, SongStat> = {}
  for (const [id, st] of Object.entries(own.songs)) songs[id] = { ...st }
  for (const dev of devices) {
    for (const [id, st] of Object.entries(dev)) {
      if (!st?.s) continue
      const cur = songs[id]
      if (!cur) {
        songs[id] = { ...st }
        continue
      }
      cur.plays += st.plays ?? 0
      cur.done += st.done ?? 0
      cur.skips += st.skips ?? 0
      cur.sp = (cur.sp ?? 0) + (st.sp ?? 0) || undefined
      cur.days = (cur.days ?? 0) + (st.days ?? 0) || undefined
      if ((st.last ?? 0) > cur.last) {
        cur.last = st.last
        cur.s = st.s
      }
      cur.first = Math.min(cur.first || Infinity, st.first || Infinity)
    }
  }
  const ownRecent = new Map(own.recent.map(r => [r.id, r.t]))
  const recent = Object.entries(songs)
    .map(([id, st]) => ({ id, t: Math.max(ownRecent.get(id) ?? 0, st.last ?? 0) }))
    .filter(r => r.t > 0 && (ownRecent.has(r.id) || songs[r.id].plays > 0))
    .sort((a, b) => b.t - a.t)
    .slice(0, 300)
  return { songs, recent }
}
// songs 的值：旧版本是 1；现在存歌曲的精简信息，用来按歌名匹配其他平台的同一首歌、以及找「相似的也少推」
const getDislikes = () => load<{ songs: Record<string, any>, singers: string[] }>('dislikes', { songs: {}, singers: [] })
const dislikedInfos = () => Object.values(getDislikes().songs).filter(v => v && typeof v == 'object' && v.name) as any[]

const singersOf = (singer: string) => String(singer ?? '').split(/、|&|;|；|\/|,|，|\|/).map(s => s.trim()).filter(Boolean)
const mainSinger = (song: any) => singersOf(song.singer)[0] ?? ''
const nameKey = (song: any) => `${String(song.name).replace(/[（(【\[].*?[）)】\]]/g, '').replace(/\s+/g, '').toLowerCase()}|${mainSinger(song).toLowerCase()}`

// ---------- 记录听歌行为 ----------
export const record = (song: any, type: 'play' | 'done' | 'skip', from?: string) => {
  if (!song?.id) return
  const stats = getStats()
  const now = Date.now()
  const st = stats.songs[song.id] ??= { s: song, plays: 0, done: 0, skips: 0, last: 0, first: now }
  st.s = song
  st.last = now
  if (type == 'play') {
    st.plays++
    if (from == 'search') st.sp = (st.sp ?? 0) + 1
    const day = new Date(now).toDateString()
    if (st.day != day) {
      st.day = day
      st.days = (st.days ?? 0) + 1
    }
    stats.recent = stats.recent.filter(r => r.id != song.id)
    stats.recent.unshift({ id: song.id, t: now })
    if (stats.recent.length > 300) stats.recent.length = 300
  } else if (type == 'done') st.done++
  else if (type == 'skip') st.skips++

  const ids = Object.keys(stats.songs)
  if (ids.length > 6000) {
    ids.sort((a, b) => stats.songs[a].last - stats.songs[b].last)
    const keep = new Set(stats.recent.map(r => r.id))
    for (const id of ids.slice(0, 1000)) if (!keep.has(id)) delete stats.songs[id]
  }
  save('stats', stats)
}

export const recentSongs = () => {
  const stats = mergedStats()
  return stats.recent.map(r => stats.songs[r.id] && { ...stats.songs[r.id].s, _playedAt: r.t }).filter(Boolean)
}

/** 每首歌听了几次、最近一次什么时候（所有设备合计）：我的歌单按「听得最多 / 最近听过」排序用 */
export const songCounts = () => {
  const out: Record<string, { p: number, l: number }> = {}
  for (const [id, s] of Object.entries(mergedStats().songs)) if (s?.plays || s?.last) out[id] = { p: s.plays ?? 0, l: s.last ?? 0 }
  return out
}

export const clearStats = () => {
  save('stats', { songs: {}, recent: [] }, true)
  save('statsRemote', {}, true)
  save('daily', null, true)
}

// ---------- 画像 ----------
const lovedSongs = (): any[] => {
  const lists = load<any[]>('lists', [])
  return lists.find(l => l.id == 'love')?.songs ?? []
}
const librarySongIds = () => {
  const ids = new Set<string>()
  for (const l of load<any[]>('lists', [])) for (const s of l.songs ?? []) ids.add(s.id)
  return ids
}

export const buildProfile = () => {
  const stats = mergedStats()
  const now = Date.now()
  const weights = new Map<string, { song: any, w: number, searched?: boolean }>()
  const library = librarySongIds()
  for (const [id, st] of Object.entries(stats.songs)) {
    let base = st.done * 1 + st.plays * 0.3 - st.skips * 0.7
    // 主动搜来听的歌比被动刷到的更能说明口味，但要先确认不是「只是好奇点开听听」：
    // - 搜了、没听完、也没收藏 → 当作好奇，不算进口味
    // - 搜了并完整听过一次 → 小幅加分
    // - 之后又回来听（听完两次以上 / 隔天还听）或者收藏了 → 明确喜欢，大幅加分
    let searched = false
    if (st.sp) {
      const kept = library.has(id)
      if (!st.done && !kept) continue
      if (kept || st.done > st.skips) {
        searched = kept || st.done >= 2 || (st.days ?? 1) >= 2
        base += searched ? 1.5 : 0.4
      }
    }
    if (base <= 0) continue
    const decay = Math.pow(0.5, (now - st.last) / (21 * DAY))
    weights.set(id, { song: st.s, w: base * (0.25 + 0.75 * decay), searched })
  }
  for (const song of lovedSongs()) {
    const cur = weights.get(song.id)
    if (cur) cur.w += 2
    else weights.set(song.id, { song, w: 2 })
  }
  // 自建/导入的歌单也代表口味，权重比「我喜欢」低一些
  for (const l of load<any[]>('lists', [])) {
    if (l.id == 'love') continue
    for (const song of l.songs ?? []) {
      const cur = weights.get(song.id)
      if (cur) cur.w += 0.8
      else weights.set(song.id, { song, w: 0.8 })
    }
  }
  const disliked = dislikedInfos()
  const dislikedIds = getDislikes().songs
  for (const id of Object.keys(dislikedIds)) weights.delete(id)
  const artists = new Map<string, number>()
  for (const { song, w } of weights.values()) {
    for (const name of singersOf(song.singer)) artists.set(name, (artists.get(name) ?? 0) + w)
  }
  // 点过「不喜欢」的歌：它的歌手整体扣分
  for (const s of disliked) {
    const name = mainSinger(s)
    if (name) artists.set(name, (artists.get(name) ?? 0) - 1.5)
  }
  const seeds = [...weights.values()].sort((a, b) => b.w - a.w)
  const topArtists = [...artists.entries()].sort((a, b) => b[1] - a[1])
  return { seeds, artists, topArtists }
}

// ---------- 相似歌曲 ----------
const postJson = (url: string, body: any) => new Promise<any>((resolve, reject) => {
  needle.request('post', url, body, {
    json: true,
    response_timeout: 12_000,
    agent: agentFor(url),
    use_proxy_from_env_var: false,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', Referer: 'https://y.qq.com/' },
  }, (err, resp) => {
    if (err) return reject(err)
    try { resolve(JSON.parse(resp.raw.toString())) } catch (e) { reject(e) }
  })
})

const simCache = new Map<string, { t: number, v: any[] }>()
const txIdCache = new Map<string, number | null>()

const txSimilar = async(txSongId: number): Promise<any[]> => {
  const key = String(txSongId)
  const hit = simCache.get(key)
  if (hit && Date.now() - hit.t < 12 * 3600_000) return hit.v
  const body = await postJson('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    comm: { ct: 24, cv: 0, format: 'json' },
    req: { module: 'music.recommend.TrackRelationServer', method: 'GetSimilarSongs', param: { songid: txSongId } },
  })
  const tracks = (body?.req?.data?.vecSong ?? []).map((v: any) => v.track).filter((t: any) => t?.mid && t.file)
  const list = normSongs(rawSdk.tx.songList.filterListDetail(tracks))
  simCache.set(key, { t: Date.now(), v: list })
  if (simCache.size > 800) simCache.delete(simCache.keys().next().value!)
  return list
}

/** 把任意平台的歌匹配到 QQ 曲库，拿到数字 songId */
const toTxSongId = async(song: any): Promise<number | null> => {
  if (song.source == 'tx' && song.songId) return Number(song.songId)
  const key = nameKey(song)
  if (txIdCache.has(key)) return txIdCache.get(key)!
  let id: number | null = null
  try {
    const r = await searchMusic('tx', `${song.name} ${mainSinger(song)}`.trim(), 1, 10)
    const hit = r.list.find((s: any) => nameKey(s) == key) ?? r.list.find((s: any) => mainSinger(s) == mainSinger(song)) ?? null
    id = hit?.songId ? Number(hit.songId) : null
  } catch {}
  txIdCache.set(key, id)
  return id
}

/** 相似歌曲；拿不到时退化为同歌手的其他热门歌 */
export const similarSongs = async(song: any): Promise<any[]> => {
  try {
    const id = await toTxSongId(song)
    if (id) {
      const list = await txSimilar(id)
      if (list.length) return list
    }
  } catch {}
  try {
    const singer = mainSinger(song)
    if (!singer) return []
    // 汽水没有搜索接口，用酷我找同歌手的歌
    const r = await searchMusic(song.source == 'qs' ? 'kw' : song.source, singer, 1, 30)
    return r.list.filter((s: any) => s.id != song.id)
  } catch { return [] }
}

const mapLimit = async<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async() => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }))
  return out
}

const weightedSample = <T extends { w: number }>(items: T[], count: number) => {
  const pool = [...items]
  const out: T[] = []
  while (pool.length && out.length < count) {
    const total = pool.reduce((n, p) => n + p.w, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w
      if (r <= 0) break
    }
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

const hotFallback = async(count: number, exclude: Set<string>, excludeNames: Set<string>) => {
  const boards = ['tx__26', 'wy__3778678', 'kw__16', 'kg__8888']
  const lists = await Promise.all(boards.map(id => boardDetail(id).then(r => r.list).catch(() => [])))
  const out: any[] = []
  const dislikes = getDislikes()
  for (const s of dislikedInfos()) excludeNames.add(nameKey(s))
  for (let i = 0; i < 100 && out.length < count; i++) {
    for (const list of lists) {
      const s = list[i + Math.floor(Math.random() * 3)]
      if (!s || exclude.has(s.id) || excludeNames.has(nameKey(s)) || dislikes.songs[s.id] || dislikes.singers.includes(mainSinger(s))) continue
      exclude.add(s.id)
      excludeNames.add(nameKey(s))
      out.push(s)
      if (out.length >= count) break
    }
  }
  return out
}

interface RankOptions { count: number, perArtist: number, excludeIds?: Set<string>, allowKnown?: boolean, negative?: Map<string, number> }

/** 和「不喜欢」的歌相似的歌：歌名键 -> 扣分。只看最近点的几首，结果有缓存 */
const negativeScores = async() => {
  const recent = dislikedInfos().sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, 6)
  const out = new Map<string, number>()
  const lists = await mapLimit(recent, 3, s => similarSongs(s).catch(() => []))
  for (const list of lists) {
    list.forEach((song, rank) => {
      const key = nameKey(song)
      out.set(key, (out.get(key) ?? 0) + 0.6 / (1 + rank / 8))
    })
  }
  return out
}
const rankCandidates = (groups: Array<{ seed: any, w: number, list: any[] }>, opts: RankOptions) => {
  const stats = mergedStats()
  const dislikes = getDislikes()
  const { artists } = buildProfile()
  const maxArtist = Math.max(1, ...artists.values())
  const library = opts.allowKnown ? new Set<string>() : librarySongIds()
  const knownNames = new Set<string>()
  if (!opts.allowKnown) {
    for (const st of Object.values(stats.songs)) if (st.plays >= 3 || st.skips >= 2) knownNames.add(nameKey(st.s))
    for (const l of load<any[]>('lists', [])) for (const s of l.songs ?? []) knownNames.add(nameKey(s))
  }
  const dislikedNames = new Set(dislikedInfos().map(nameKey))
  const seedNames = new Set(groups.map(g => nameKey(g.seed)))
  const maxW = Math.max(1e-6, ...groups.map(g => g.w))

  const cands = new Map<string, { song: any, score: number, reason: any, best: number }>()
  for (const g of groups) {
    g.list.forEach((song, rank) => {
      const key = nameKey(song)
      if (seedNames.has(key) || knownNames.has(key) || library.has(song.id) || opts.excludeIds?.has(song.id)) return
      if (dislikes.songs[song.id] || dislikedNames.has(key) || singersOf(song.singer).some(n => dislikes.singers.includes(n))) return
      const part = (g.w / maxW) / (1 + rank / 8)
      const cur = cands.get(key)
      if (cur) {
        cur.score += part
        if (part > cur.best) { cur.best = part; cur.reason = g.seed }
      } else cands.set(key, { song, score: part, reason: g.seed, best: part })
    })
  }
  for (const c of cands.values()) {
    const affs = singersOf(c.song.singer).map(n => artists.get(n) ?? 0)
    const aff = Math.max(0, ...affs) / maxArtist
    c.score += 0.2 * aff + Math.random() * 0.08
    c.score -= opts.negative?.get(nameKey(c.song)) ?? 0
    // 这个歌手被点过不喜欢、又没有别的正面记录：明显降权
    if (affs.length && Math.max(...affs) < 0) c.score *= 0.4
  }
  const sorted = [...cands.values()].sort((a, b) => b.score - a.score)
  const perArtist = new Map<string, number>()
  const out: Array<{ song: any, reason: any }> = []
  for (const c of sorted) {
    const a = mainSinger(c.song)
    const n = perArtist.get(a) ?? 0
    if (n >= opts.perArtist) continue
    perArtist.set(a, n + 1)
    out.push({ song: c.song, reason: c.reason })
    if (out.length >= opts.count) break
  }
  return out
}

// ---------- 每日推荐 ----------
const todayKey = () => {
  const d = new Date(Date.now() - 4 * 3600_000) // 凌晨 4 点换新
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

let dailyPending: Promise<any> | null = null
export const daily = async(force = false) => {
  const cache = load<any>('daily', null)
  if (!force && cache?.date == todayKey() && cache.songs?.length) return cache
  dailyPending ??= (async() => {
    const { seeds } = buildProfile()
    const picked = weightedSample(seeds.slice(0, 50), 12)
    const [groups, negative] = await Promise.all([
      mapLimit(picked, 4, async p => ({ seed: p.searched ? { ...p.song, _searched: 1 } : p.song, w: p.w, list: await similarSongs(p.song) })),
      negativeScores(),
    ])
    const ranked = rankCandidates(groups, { count: 30, perArtist: 2, negative })
    const songs = ranked.map(r => ({ ...r.song, _rec: 1, _reason: r.reason._searched ? `因为你搜过并常听《${r.reason.name}》` : `因为你听过《${r.reason.name}》` }))
    const cold = songs.length < 12
    if (songs.length < 30) {
      const fill = await hotFallback(30 - songs.length, new Set(songs.map(s => s.id)), new Set(songs.map(nameKey)))
      songs.push(...fill.map(s => ({ ...s, _rec: 1, _reason: '近期热门' })))
    }
    const result = { date: todayKey(), songs, cold, seedCount: picked.length }
    if (songs.length) save('daily', result)
    return result
  })().finally(() => { dailyPending = null })
  return dailyPending
}

// ---------- 相似电台 / 自动续播 ----------
export const radio = async(seedSongs: any[], excludeIds: string[], count = 15) => {
  const seeds = seedSongs.filter(Boolean).slice(-3)
  if (!seeds.length) return []
  const groups = await mapLimit(seeds, 3, async(seed, ) => ({ seed, w: 1, list: await similarSongs(seed) }))
  groups.forEach((g, i) => { g.w = 0.6 + 0.2 * i }) // 越新的种子权重越高
  const exclude = new Set(excludeIds)
  const negative = await negativeScores()
  let ranked = rankCandidates(groups, { count, perArtist: 2, excludeIds: exclude, allowKnown: true, negative })
  if (ranked.length < Math.min(5, count)) ranked = rankCandidates(groups, { count, perArtist: 5, excludeIds: exclude, allowKnown: true, negative })
  let songs = ranked.map(r => r.song)
  if (songs.length < 5) {
    const names = new Set(seeds.map(nameKey))
    songs = songs.concat(await hotFallback(count - songs.length, new Set([...exclude, ...songs.map(s => s.id)]), names))
  }
  // 轻度打乱，避免每次顺序完全一样
  for (let i = songs.length - 1; i > 0; i--) {
    const j = Math.max(0, i - Math.floor(Math.random() * 3))
    ;[songs[i], songs[j]] = [songs[j], songs[i]]
  }
  return songs.map(s => ({ ...s, _rec: 1 }))
}

// ---------- 发现页 ----------
export const discover = async() => {
  const { topArtists, seeds } = buildProfile()
  const artistNames = topArtists.slice(0, 6).map(a => a[0])
  const picks = artistNames.sort(() => Math.random() - 0.5).slice(0, 3)
  const forYouLists = (await mapLimit(picks, 3, async name => {
    const src = Math.random() < 0.5 ? 'wy' : 'tx'
    try {
      const r = await searchSongLists(src, name, 1, 6)
      return r.list.slice(0, 4).map((l: any) => ({ ...l, _reason: `因为你常听 ${name}` }))
    } catch { return [] }
  })).flat()
  const hotLists = await Promise.all([
    songLists('wy', null, null, 1).then(r => r.list.slice(0, 6)).catch(() => []),
    songLists('tx', null, null, 1).then(r => r.list.slice(0, 6)).catch(() => []),
    songLists('kg', null, null, 1).then(r => r.list.slice(0, 6)).catch(() => []),
  ])
  const hot: any[] = []
  for (let i = 0; i < 6; i++) for (const l of hotLists) if (l[i]) hot.push(l[i])
  return {
    hasProfile: seeds.length >= 3,
    topArtists: topArtists.slice(0, 8).map(a => a[0]),
    forYouLists,
    hotLists: hot.slice(0, 12),
  }
}

// ---------- 不喜欢 ----------
export const dislike = (song: any, singer = false) => {
  const d = getDislikes()
  if (singer) {
    const name = mainSinger(song)
    if (name && !d.singers.includes(name)) d.singers.push(name)
  } else {
    d.songs[song.id] = { id: song.id, name: song.name, singer: song.singer, source: song.source, songmid: song.songmid, songId: song.songId, t: Date.now() }
    // 同时记一次「跳过」，它不会再被当作口味种子
    const stats = getStats()
    if (stats.songs[song.id]) {
      stats.songs[song.id].skips += 2
      save('stats', stats)
    }
  }
  save('dislikes', d)
  const cache = load<any>('daily', null)
  if (cache?.songs) {
    cache.songs = cache.songs.filter((s: any) => singer ? mainSinger(s) != mainSinger(song) : (s.id != song.id && nameKey(s) != nameKey(song)))
    save('daily', cache)
  }
}
