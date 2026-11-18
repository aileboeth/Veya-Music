// 歌单筛选 / 排序（歌单广场、搜索歌单共用）：按播放量、收藏量排序，只看播放量够多的
// 收藏量只有部分平台给（网易云、酷狗、酷我广场、咪咕搜索）；没有的按播放量排在有收藏量的后面
import { reactive } from 'vue'

export type ListSort = 'default' | 'play' | 'collect'
export interface ListFilter { sort: ListSort, minPlay: number }

export const PLAY_STEPS = [
  { v: 0, name: '不限' },
  { v: 1e4, name: '1万+' },
  { v: 1e5, name: '10万+' },
  { v: 1e6, name: '100万+' },
  { v: 1e7, name: '1000万+' },
]

export const newListFilter = () => reactive<ListFilter>({ sort: 'default', minPlay: 0 })

/** 「1.2万」「3.5亿」「12345」→ 数字 */
export const parseCount = (v: any): number => {
  if (typeof v == 'number') return v
  const m = /([\d.]+)\s*(万|亿|w|W|k|K)?/.exec(String(v ?? ''))
  if (!m) return 0
  const n = parseFloat(m[1])
  if (!isFinite(n)) return 0
  const unit = m[2]
  return Math.round(n * (unit == '亿' ? 1e8 : unit == '万' || unit == 'w' || unit == 'W' ? 1e4 : unit == 'k' || unit == 'K' ? 1e3 : 1))
}
export const playNum = (l: any) => (l.play_num > 0 ? l.play_num : parseCount(l.play_count))
export const collectNum = (l: any) => (l.collect_num > 0 ? l.collect_num : 0)

export const formatCount = (n: number) => n >= 1e8 ? `${+(n / 1e8).toFixed(1)}亿` : n >= 1e4 ? `${+(n / 1e4).toFixed(1)}万` : String(n)

export const isFiltering = (f: ListFilter) => f.sort != 'default' || f.minPlay > 0

/** 筛选 + 排序（不改原数组） */
export const applyListFilter = <T>(list: T[], f: ListFilter): T[] => {
  let out = f.minPlay > 0 ? list.filter(l => playNum(l) >= f.minPlay) : list.slice()
  if (f.sort == 'play') out.sort((a, b) => playNum(b) - playNum(a))
  else if (f.sort == 'collect') {
    out.sort((a, b) => {
      const ca = collectNum(a)
      const cb = collectNum(b)
      if (ca || cb) return cb - ca || playNum(b) - playNum(a)
      return playNum(b) - playNum(a)
    })
  }
  return out
}
