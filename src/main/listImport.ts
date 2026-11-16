// 导入其他音乐 App 的歌单：
// - 网易云 / QQ 音乐 / 酷狗 / 酷我 / 咪咕：粘贴分享内容（链接或整段分享文字），自动识别平台后直接读取歌单
// - 汽水音乐：读取分享页里的歌曲列表，再到上面五个平台里逐首匹配
// - 其他 App：粘贴「歌名 - 歌手」的文本（每行一首），同样逐首匹配
import { session } from 'electron'
import { normSongs, rawSdk, songListDetail } from './music'
import { fetchPlaylist, isTrackId, type QishuiTrack } from './qishui'

export interface ImportProgress { stage: 'fetch' | 'match', done: number, total: number, name?: string }
export interface ImportedPlaylist {
  platform: string
  platformName: string
  name: string
  img?: string
  /** 来自五个内置平台时带上来源，之后可以在歌单里「同步更新」 */
  source?: string
  sourceListId?: string
  songs: any[]
  total: number
  /** 没有匹配到的歌（仅汽水音乐 / 文本导入） */
  missing: string[]
  /** 汽水歌单里其他平台都没有、保留为汽水音源的歌有几首 */
  qsOnly?: number
}

const PLATFORMS: Record<string, string> = { wy: '网易云音乐', tx: 'QQ 音乐', kg: '酷狗音乐', kw: '酷我音乐', mg: '咪咕音乐', qs: '汽水音乐', text: '文本歌单' }
const HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)(163\.com|163cn\.tv|126\.net)$/, 'wy'],
  [/(^|\.)qq\.com$/, 'tx'],
  [/(^|\.)kugou\.com$/, 'kg'],
  [/(^|\.)kuwo\.cn$/, 'kw'],
  [/(^|\.)migu\.cn$/, 'mg'],
  [/(^|\.)(douyin\.com|qishui\.com)$/, 'qs'],
]

/** 从分享文字里取出链接并判断是哪个平台 */
export const detect = (input: string, hint = '') => {
  const text = String(input ?? '').trim()
  const url = /https?:\/\/[^\s"'<>，。；！、（）【】《》]+/i.exec(text)?.[0].replace(/[)\]}.,;!]+$/, '') ?? ''
  if (url) {
    let host = ''
    try { host = new URL(url).hostname.toLowerCase() } catch {}
    const platform = HOSTS.find(([rxp]) => rxp.test(host))?.[1] ?? ''
    if (platform) return { platform, url, id: normalizeId(platform, url) }
    if (PLATFORMS[hint] && hint != 'text') return { platform: hint, url, id: url }
    throw new Error(`认不出这个链接是哪个音乐 App 的（${host || url.slice(0, 40)}）。目前支持：网易云、QQ 音乐、酷狗、酷我、咪咕、汽水音乐`)
  }
  // 没有链接：单独一串数字/字母当作歌单 ID（需要指定平台；酷狗的「酷狗码」也是纯数字）
  if (/^[\w-]{4,40}$/.test(text)) {
    if (PLATFORMS[hint] && hint != 'text' && hint != 'qs') return { platform: hint, url: '', id: text }
    throw new Error('只有歌单 ID 时认不出是哪个平台，请在上面选一下平台再试')
  }
  if (parseTextList(text).length) return { platform: 'text', url: '', id: '' }
  throw new Error('没有找到歌单链接。请粘贴音乐 App 里「分享 → 复制链接」得到的内容')
}

/** 能直接取出歌单 ID 的链接先取出来，其余（短链接等）交给 SDK 自己跳转解析 */
const normalizeId = (platform: string, url: string) => {
  const pick = (rxp: RegExp) => rxp.exec(url)?.[1]
  switch (platform) {
    case 'wy': return pick(/[?&]id=(\d+)/) ?? pick(/\/playlist\/(\d+)/) ?? url
    case 'tx': return pick(/\/playlist\/(\d+)/) ?? pick(/taoge[^?]*\?(?:.*&)?id=(\d+)/) ?? url
    case 'kw': return pick(/\/playlist(?:_detail)?\/(\d+)/) ?? pick(/[?&]pid=(\d+)/) ?? url
    case 'mg': return pick(/[?&](?:playlistId|id)=(\d+)/) ?? pick(/\/playlist\/(\d+)/) ?? url
    case 'kg': {
      const id = pick(/\/special\/single\/(\d+)/) ?? pick(/\/plist\/list\/(\d+)/)
      return id ? `id_${id}` : url
    }
  }
  return url
}

// ---------- 文本歌单 ----------
interface PlainSong { name: string, singer: string, albumName: string, interval: string }

/** 每行一首：「歌名 - 歌手」（也接受 歌名 – 歌手 / 歌名 — 歌手 / 歌名<Tab>歌手 / 只有歌名），行首的序号会去掉 */
export const parseTextList = (text: string): PlainSong[] => {
  const out: PlainSong[] = []
  const seen = new Set<string>()
  for (let line of String(text ?? '').split(/\r?\n/)) {
    line = line.trim().replace(/^\d{1,4}\s*[.、)）:：]\s*/, '').replace(/^[-*·•]\s+/, '').trim()
    if (!line || line.length > 150 || /^https?:\/\//i.test(line)) continue
    let name = line
    let singer = ''
    const m = /^(.+?)(?:\s+[-–—]+\s+|\t+|\s+[-–—]+|[-–—]+\s+)(.+)$/.exec(line)
    if (m) { name = m[1].trim(); singer = m[2].trim() }
    const key = `${name}|${singer}`.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    out.push({ name, singer, albumName: '', interval: '' })
  }
  return out
}

// ---------- 逐首匹配到内置平台 ----------
let jobId = 0
export const cancelImport = () => { jobId++ }

const cleanName = (name: string) => name.replace(/\s*[(（[【][^)）\]】]*[)）\]】]\s*$/, '').trim()

const findOne = async(song: PlainSong): Promise<any | null> => {
  const tries: PlainSong[] = [song]
  const short = cleanName(song.name)
  if (short && short != song.name) tries.push({ ...song, name: short, albumName: '' })
  // 文本里可能写成「歌手 - 歌名」
  if (!song.interval && song.singer) tries.push({ ...song, name: song.singer, singer: song.name })
  for (const t of tries) {
    const list: any[] = await Promise.race([
      rawSdk.findMusic({ name: t.name, singer: t.singer, albumName: t.albumName, interval: t.interval || null, source: '' }),
      new Promise<any[]>(resolve => setTimeout(() => resolve([]), 25_000)),
    ]).catch(() => [])
    const hit = normSongs(list)[0]
    if (hit) return hit
  }
  return null
}

/** 其他平台都没有的汽水歌曲：保留汽水自己的 ID，播放时走支持汽水的音源 */
const qsSong = (t: QishuiTrack) => ({
  source: 'qs', songmid: t.id, vid: t.vid, name: t.name, singer: t.singer, albumName: t.albumName, interval: t.interval, img: t.img || null, types: [], _types: {},
})

const matchAll = async(songs: Array<PlainSong & Partial<QishuiTrack>>, onProgress: (p: ImportProgress) => void) => {
  const job = ++jobId
  const found: Array<any | null> = new Array(songs.length).fill(null)
  let next = 0
  let done = 0
  const worker = async() => {
    while (next < songs.length && job == jobId) {
      const i = next++
      found[i] = await findOne(songs[i]).catch(() => null)
      done++
      if (job == jobId) onProgress({ stage: 'match', done, total: songs.length, name: songs[i].name })
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  if (job != jobId) throw new Error('已取消导入')
  let qsOnly = 0
  songs.forEach((s, i) => {
    if (found[i] || !s.id || !isTrackId(s.id)) return
    found[i] = qsSong(s as QishuiTrack)
    qsOnly++
  })
  const missing = songs.filter((_, i) => !found[i]).map(s => s.singer ? `${s.name} - ${s.singer}` : s.name)
  return { songs: normSongs(found.filter(Boolean)), missing, qsOnly }
}

export const importPlaylist = async(input: string, hint = '', onProgress: (p: ImportProgress) => void = () => {}): Promise<ImportedPlaylist> => {
  const d = detect(input, hint)
  const base = { platform: d.platform, platformName: PLATFORMS[d.platform] }
  onProgress({ stage: 'fetch', done: 0, total: 0 })

  if (d.platform == 'text') {
    const plain = parseTextList(input)
    if (plain.length > 2000) throw new Error('一次最多导入 2000 首，请分几次粘贴')
    const r = await matchAll(plain, onProgress)
    return { ...base, name: '导入的歌单', songs: r.songs, total: plain.length, missing: r.missing }
  }
  if (d.platform == 'qs') {
    const list = await fetchPlaylist(d.url)
    const r = await matchAll(list.songs, onProgress)
    return { ...base, name: list.name, songs: r.songs, total: list.songs.length, missing: r.missing, qsOnly: r.qsOnly }
  }

  const job = ++jobId
  const r = await songListDetail(d.platform, d.id).catch(err => {
    const msg = String(err?.message ?? err)
    throw new Error(`读取${base.platformName}歌单失败：${/timeout|超时/i.test(msg) ? '请求超时' : msg}。请确认歌单是公开的，链接是从 App 的「分享 → 复制链接」得到的`)
  })
  if (job != jobId) throw new Error('已取消导入')
  if (!r.list.length) throw new Error(`这个${base.platformName}歌单里没有读到歌曲（歌单可能是私密的或已被删除）`)
  return { ...base, name: String(r.info?.name || `${base.platformName}歌单`), img: r.info?.img, source: d.platform, sourceListId: d.id, songs: r.list, total: r.total || r.list.length, missing: [] }
}
