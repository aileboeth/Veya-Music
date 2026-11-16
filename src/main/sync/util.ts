// 同步用的小工具：稳定序列化 + 哈希、记录键编码、稳定的排序位置

/** 键按字母排序、去掉 undefined 的 JSON（同样的内容永远得到同样的字符串） */
export const stable = (v: any): string => {
  if (v === null || v === undefined) return 'null'
  if (typeof v != 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : stable(x)).join(',') + ']'
  const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] != 'function').sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
}

/** 两个 32 位 FNV-1a 拼成 64 位的十六进制哈希（只用来判断内容变没变） */
export const hashStr = (s: string) => {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193 ^ s.length
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}
export const hashOf = (v: any) => v === null || v === undefined ? '' : hashStr(stable(v))

export const enc = (s: string | number) => encodeURIComponent(String(s))
export const dec = (s: string) => {
  try { return decodeURIComponent(s) } catch { return s }
}

/**
 * 给有序列表的每一项分配位置值：相对顺序没变的项保留原来的值（这样不会产生同步记录，
 * 别的设备同时删掉的歌也不会因为「位置变了」被重新写回来），只给新加的、被挪动的项算新值。
 * 做法：在有旧位置的项里找最长递增子序列保留，其余的插在前后两个保留项之间。
 */
export const assignPositions = (ids: string[], old: Map<string, number>): Map<string, number> => {
  const n = ids.length
  const has = (i: number) => old.has(ids[i]) && Number.isFinite(old.get(ids[i]))
  const idxs: number[] = []
  for (let i = 0; i < n; i++) if (has(i)) idxs.push(i)
  const val = (j: number) => old.get(ids[idxs[j]])!
  const tails: number[] = []
  const prev = new Array<number>(idxs.length).fill(-1)
  for (let j = 0; j < idxs.length; j++) {
    const v = val(j)
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (val(tails[m]) < v) lo = m + 1
      else hi = m
    }
    if (lo > 0) prev[j] = tails[lo - 1]
    tails[lo] = j
  }
  const keep = new Set<number>()
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) keep.add(idxs[k])

  const out = new Map<string, number>()
  let lastP: number | null = null
  let i = 0
  let ok = true
  while (i < n) {
    if (keep.has(i)) {
      lastP = old.get(ids[i])!
      out.set(ids[i], lastP)
      i++
      continue
    }
    let j = i
    while (j < n && !keep.has(j)) j++
    const nextP = j < n ? old.get(ids[j])! : null
    const count = j - i
    for (let t = 0; t < count; t++) {
      let p: number
      if (lastP == null && nextP == null) p = t + 1
      else if (lastP == null) p = nextP! - (count - t)
      else if (nextP == null) p = lastP + 1 + t
      else {
        const step = (nextP - lastP) / (count + 1)
        if (!(step > 1e-9)) ok = false
        p = lastP + step * (t + 1)
      }
      out.set(ids[i + t], p)
    }
    if (count) lastP = out.get(ids[j - 1])!
    i = j
  }
  // 极少数情况下小数精度不够了（同一个位置反复插入几十次）：全部重新编号
  if (!ok) {
    out.clear()
    ids.forEach((id, k) => out.set(id, k + 1))
  }
  return out
}

/**
 * 按位置值排序；没有位置值的项（本地新加、还没同步过的）跟在它原来前面那一项后面
 */
export const sortByPositions = <T>(items: T[], posOf: (item: T) => number | undefined): T[] => {
  const keyed: Array<{ item: T, p: number, sub: number }> = []
  let lastP = -Infinity
  let sub = 0
  for (const item of items) {
    const p = posOf(item)
    if (p !== undefined && Number.isFinite(p)) {
      lastP = p
      sub = 0
      keyed.push({ item, p, sub: 0 })
    } else {
      sub++
      keyed.push({ item, p: lastP, sub })
    }
  }
  return keyed.sort((a, b) => a.p - b.p || a.sub - b.sub).map(k => k.item)
}
