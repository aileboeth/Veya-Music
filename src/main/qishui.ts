// 汽水音乐：没有公开的搜索接口，只能从分享页里读数据
// - 歌单分享页：歌曲列表（带汽水自己的歌曲 ID）
// - 单曲分享页：逐字歌词和封面
// 播放链接由支持汽水（平台代号 qs）的音源脚本提供
import { session } from 'electron'

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

/** 取出页面里 `_ROUTER_DATA = {...}` 的 JSON（按括号配对截取，后面可能还跟着别的脚本） */
const routerData = (html: string) => {
  const i = html.indexOf('_ROUTER_DATA')
  const start = i < 0 ? -1 : html.indexOf('{', i)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let p = start; p < html.length; p++) {
    const ch = html[p]
    if (inStr) {
      if (esc) esc = false
      else if (ch == '\\') esc = true
      else if (ch == '"') inStr = false
    } else if (ch == '"') inStr = true
    else if (ch == '{') depth++
    else if (ch == '}' && --depth == 0) {
      try { return JSON.parse(html.slice(start, p + 1)) } catch { return null }
    }
  }
  return null
}

const fmtTime = (sec: number) => {
  if (!sec || !Number.isFinite(sec)) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

/** 汽水的歌曲 ID 是一长串数字；其他形态的一律不认，避免拼出奇怪的请求 */
export const isTrackId = (id: any) => /^\d{6,24}$/.test(String(id ?? ''))

const coverUrl = (c: any) => {
  const base = c?.urls?.[0]
  const uri = c?.uri
  if (typeof base != 'string' || typeof uri != 'string' || !/^https:\/\//.test(base) || !uri) return ''
  return `${base}${uri}~c5_500x500.jpg`
}

export interface QishuiTrack { id: string, vid: string, name: string, singer: string, albumName: string, interval: string, img: string }

export const fetchPlaylist = async(url: string) => {
  const res = await session.defaultSession.fetch(url, { headers: { 'User-Agent': MOBILE_UA }, signal: AbortSignal.timeout(25_000) })
  if (!res.ok) throw new Error(`汽水音乐分享页打不开（HTTP ${res.status}）`)
  const page = routerData(await res.text())?.loaderData?.playlist_page
  const medias: any[] = page?.medias ?? []
  if (!medias.length) throw new Error('没有从这个汽水音乐链接里读到歌曲。请确认分享的是「歌单」，并且歌单是公开的')
  const songs: QishuiTrack[] = []
  for (const m of medias) {
    const t = m?.entity?.track
    if (!t?.name) continue
    songs.push({
      id: isTrackId(t.id) ? String(t.id) : '',
      vid: typeof t.vid == 'string' ? t.vid.slice(0, 80) : '',
      name: String(t.name),
      singer: (t.artists ?? []).map((a: any) => a?.name).filter(Boolean).join('、'),
      albumName: String(t.album?.name ?? ''),
      interval: fmtTime(Number(t.duration) / 1000),
      img: coverUrl(t.album?.url_cover),
    })
  }
  const info = page.playlistInfo ?? {}
  return { name: String(info.title || info.public_title || '汽水音乐歌单'), total: Number(info.count_tracks) || songs.length, songs }
}

const tag = (ms: number) => {
  const m = Math.floor(ms / 60000)
  const s = Math.floor(ms % 60000 / 1000)
  return `[${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}.${String(Math.floor(ms % 1000)).padStart(3, '0')}]`
}

/** 把分享页里的逐句 / 逐字歌词转成 LRC 和 LX 的逐字格式（<相对这一句开头的毫秒,持续毫秒>字） */
export const buildLyric = (sentences: any[]) => {
  const lrc: string[] = []
  const lx: string[] = []
  for (const s of Array.isArray(sentences) ? sentences : []) {
    const start = Number(s?.startMs)
    const text = String(s?.text ?? '').replace(/[\r\n]+/g, ' ').trim()
    if (!text || !Number.isFinite(start) || start < 0) continue
    lrc.push(tag(start) + text)
    const words: any[] = Array.isArray(s.words) ? s.words : []
    if (words.length < 2) continue
    let line = ''
    let ok = true
    for (const w of words) {
      const ws = Number(w?.startMs)
      const we = Number(w?.endMs)
      const wt = String(w?.text ?? '')
      if (!wt || /[<>\r\n]/.test(wt) || !Number.isFinite(ws) || ws < start) { ok = false; break }
      // 最后一个字的结束时间有时是个天文数字
      const dur = Number.isFinite(we) && we > ws ? Math.min(we - ws, 10_000) : 300
      line += `<${Math.round(ws - start)},${Math.round(dur)}>${wt}`
    }
    if (ok) lx.push(tag(start) + line)
  }
  return { lyric: lrc.join('\n'), lxlyric: lx.join('\n') }
}

interface TrackInfo { lyric: string, lxlyric: string, cover: string }
const infoCache = new Map<string, { t: number, v: Promise<TrackInfo> }>()

/** 单曲分享页里的歌词和封面（读不到就是空的，不抛错） */
export const trackInfo = (id: string): Promise<TrackInfo> => {
  const empty = { lyric: '', lxlyric: '', cover: '' }
  if (!isTrackId(id)) return Promise.resolve(empty)
  const hit = infoCache.get(id)
  if (hit && Date.now() - hit.t < 30 * 60_000) return hit.v
  const v = (async() => {
    const res = await session.defaultSession.fetch(`https://www.qishui.com/share/track?track_id=${id}`, { headers: { 'User-Agent': MOBILE_UA }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const o = routerData(await res.text())?.loaderData?.track_page?.audioWithLyricsOption
    if (!o) throw new Error('no data')
    const cover = typeof o.coverURL == 'string' && /^https:\/\//.test(o.coverURL) ? o.coverURL.replace(/~c5_\d+x\d+\./, '~c5_500x500.') : ''
    return { ...buildLyric(o.lyrics?.sentences), cover }
  })().catch(() => {
    // 失败的不缓存，下次再试
    infoCache.delete(id)
    return empty
  })
  infoCache.set(id, { t: Date.now(), v })
  if (infoCache.size > 200) infoCache.delete(infoCache.keys().next().value!)
  return v
}
