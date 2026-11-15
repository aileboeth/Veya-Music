// Veya Music 对 LX musicSdk 的工具函数垫片（musicSdk 目录来自 lx-music-desktop，Apache-2.0）
import crypto from 'crypto'

const numFix = n => n < 10 ? `0${n}` : String(n)

export const sizeFormate = size => {
  if (!size) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

export const toDateObj = date => {
  if (!date) return ''
  switch (typeof date) {
    case 'string':
      if (!date.includes('T')) date = date.split('.')[0].replace(/-/g, '/')
    // eslint-disable-next-line no-fallthrough
    case 'number':
      date = new Date(date)
    // eslint-disable-next-line no-fallthrough
    case 'object':
      break
    default: return ''
  }
  return date
}

export const dateFormat = (_date, format = 'Y-M-D h:m:s') => {
  const date = toDateObj(_date)
  if (!date) return ''
  return format
    .replace('Y', date.getFullYear().toString())
    .replace('M', numFix(date.getMonth() + 1))
    .replace('D', numFix(date.getDate()))
    .replace('h', numFix(date.getHours()))
    .replace('m', numFix(date.getMinutes()))
    .replace('s', numFix(date.getSeconds()))
}

export const dateFormat2 = time => {
  const differ = Math.trunc((Date.now() - time) / 1000)
  if (differ < 60) return `${differ}秒前`
  if (differ < 3600) return `${Math.trunc(differ / 60)}分钟前`
  if (differ < 86400) return `${Math.trunc(differ / 3600)}小时前`
  return dateFormat(time)
}

export const formatPlayTime = time => {
  const m = Math.trunc(time / 60)
  const s = Math.trunc(time % 60)
  return m == 0 && s == 0 ? '--/--' : numFix(m) + ':' + numFix(s)
}

export const formatPlayCount = num => {
  if (num > 100000000) return `${Math.trunc(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.trunc(num / 1000) / 10}万`
  return String(num)
}

export const toMD5 = str => crypto.createHash('md5').update(str).digest('hex')

const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export const decodeName = (str = '') => {
  if (!str) return ''
  return String(str).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (s, code) => {
    if (code[0] == '#') {
      const n = code[1].toLowerCase() == 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : s
    }
    return entities[code.toLowerCase()] ?? s
  })
}
