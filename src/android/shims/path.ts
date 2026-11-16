// path 模块（只实现用到的 posix 部分）
export const sep = '/'
export const delimiter = ':'

export const normalize = (p: string) => {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of p.replace(/\\/g, '/').split('/')) {
    if (!part || part == '.') continue
    if (part == '..') {
      if (out.length && out[out.length - 1] != '..') out.pop()
      else if (!abs) out.push('..')
    } else out.push(part)
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.')
}
export const join = (...parts: string[]) => normalize(parts.filter(Boolean).join('/'))
export const resolve = (...parts: string[]) => {
  let p = ''
  for (const part of parts) p = part.startsWith('/') ? part : `${p}/${part}`
  return normalize(p.startsWith('/') ? p : '/' + p)
}
export const dirname = (p: string) => {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i <= 0 ? (n.startsWith('/') ? '/' : '.') : n.slice(0, i)
}
export const basename = (p: string, ext?: string) => {
  const b = normalize(p).split('/').pop() ?? ''
  return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b
}
export const extname = (p: string) => {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i) : ''
}
export const isAbsolute = (p: string) => p.startsWith('/')
export const relative = (from: string, to: string) => {
  const a = normalize(from).split('/').filter(Boolean)
  const b = normalize(to).split('/').filter(Boolean)
  let i = 0
  while (i < a.length && a[i] == b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}
export const posix = { sep, delimiter, normalize, join, resolve, dirname, basename, extname, isAbsolute, relative }
export default posix
