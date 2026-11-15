// 歌词动效的公共部分：逐字时间、颜色插值（主窗口的播放页和桌面歌词窗口共用）

/** 一个「字」：t = 相对这一句开头的秒数，d = 唱多久，s = 文字 */
export interface LyricWord { t: number, d: number, s: string }
export interface LyricLine { time: number, text: string, trans?: string, words?: LyricWord[], dur: number }

const timeRxp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const parseLrc = (text: string) => {
  const out: Array<{ time: number, text: string, raw: string }> = []
  for (const line of String(text ?? '').split(/\r?\n/)) {
    timeRxp.lastIndex = 0
    const times: number[] = []
    let m: RegExpExecArray | null
    let last = 0
    while ((m = timeRxp.exec(line))) {
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0')) / 1000 : 0
      times.push(parseInt(m[1]) * 60 + parseInt(m[2]) + ms)
      last = timeRxp.lastIndex
    }
    if (!times.length) continue
    const raw = line.slice(last)
    const content = raw.replace(/<-?\d+,-?\d+(?:,-?\d+)?>/g, '').trim()
    for (const t of times) out.push({ time: Math.max(0, t), text: content, raw })
  }
  return out.sort((a, b) => a.time - b.time)
}

/** 逐字歌词的一行：<开始毫秒,持续毫秒>字<…>字 */
const parseWords = (raw: string) => {
  const words: LyricWord[] = []
  const rxp = /<(\d+),(\d+)(?:,-?\d+)?>([^<]*)/g
  let m: RegExpExecArray | null
  while ((m = rxp.exec(raw))) if (m[3]) words.push({ t: parseInt(m[1]) / 1000, d: Math.max(0.05, parseInt(m[2]) / 1000), s: m[3] })
  return words
}

const norm = (s: string) => s.replace(/\s+/g, '')

export const buildLyric = (data: { lyric: string, tlyric?: string, lxlyric?: string }): LyricLine[] => {
  const lines = parseLrc(data.lyric).filter(l => l.text)
  const trans = new Map<string, string>()
  for (const l of parseLrc(data.tlyric ?? '')) if (l.text) trans.set(l.time.toFixed(1), l.text)
  const words = new Map<string, LyricWord[]>()
  for (const l of parseLrc(data.lxlyric ?? '')) {
    const w = parseWords(l.raw)
    if (w.length) words.set(l.time.toFixed(1), w)
  }
  return lines.map((l, i) => {
    const gap = (lines[i + 1]?.time ?? l.time + 10) - l.time
    const t = trans.get(l.time.toFixed(1))
    let w = words.get(l.time.toFixed(1))
    // 逐字内容和这一句对不上（不同版本的歌词）就不用
    if (w && norm(w.map(x => x.s).join('')) != norm(l.text)) w = undefined
    const sung = w ? w[w.length - 1].t + w[w.length - 1].d : Math.min(Math.max(2.5, Array.from(l.text).length * 0.4), 10)
    const line: LyricLine = { time: l.time, text: l.text, dur: Math.max(0.3, Math.min(sung, gap)) }
    if (t && t != l.text) line.trans = t
    if (w) line.words = w
    return line
  })
}

/** 把一句歌词拆成动效用的小段：有逐字时间就直接用，没有就按字数把时间均匀分下去 */
export const makeUnits = (text: string, words: LyricWord[] | undefined, dur: number): LyricWord[] => {
  if (words?.length) return words
  // 英文按单词、中日韩按字；空格跟在前一段后面
  const parts = text.match(/[A-Za-z0-9À-ɏЀ-ӿ'’\-]+\s*|[^\s]\s*|\s+/gu) ?? [text]
  const weight = (s: string) => {
    const core = s.trim()
    if (!core) return 0.2
    return /^[\x20-\x7e]+$/.test(core) ? Math.max(1, core.length * 0.45) : 1
  }
  const total = parts.reduce((n, p) => n + weight(p), 0) || 1
  const span = dur * 0.94
  let t = 0
  return parts.map(s => {
    const d = span * weight(s) / total
    const u = { t, d, s }
    t += d
    return u
  })
}

const hex = (c: string) => {
  const s = c.replace('#', '')
  const full = s.length == 3 ? s.replace(/./g, x => x + x) : s
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}
/** 在一组颜色之间取 0~1 位置上的颜色 */
export const mixStops = (stops: string[], x: number) => {
  if (stops.length == 1) return stops[0]
  const pos = Math.min(0.9999, Math.max(0, x)) * (stops.length - 1)
  const i = Math.floor(pos)
  const a = hex(stops[i])
  const b = hex(stops[i + 1])
  const f = pos - i
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`
}
