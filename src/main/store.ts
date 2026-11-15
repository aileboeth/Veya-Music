// 简单的 JSON 文件存储：主进程是数据的唯一持有者，渲染进程通过 IPC 读写
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

let dir = ''
const cache = new Map<string, any>()
const timers = new Map<string, NodeJS.Timeout>()

export const dataDir = () => {
  if (!dir) {
    dir = path.join(app.getPath('userData'), 'VeyaData')
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

const fileOf = (key: string) => path.join(dataDir(), `${key.replace(/[^\w.-]/g, '_')}.json`)

export const load = <T = any>(key: string, def: T): T => {
  if (cache.has(key)) return cache.get(key)
  let value = def
  const file = fileOf(key)
  for (const f of [file, file + '.bak']) {
    try {
      if (!fs.existsSync(f)) continue
      value = JSON.parse(fs.readFileSync(f, 'utf8'))
      break
    } catch (err) {
      console.error('[store] 读取失败', f, err)
    }
  }
  cache.set(key, value)
  return value
}

const flush = (key: string) => {
  timers.delete(key)
  const file = fileOf(key)
  const tmp = file + '.tmp'
  try {
    fs.writeFileSync(tmp, JSON.stringify(cache.get(key)))
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak')
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error('[store] 写入失败', file, err)
  }
}

export const save = (key: string, value: any, immediate = false) => {
  cache.set(key, value)
  const t = timers.get(key)
  if (t) clearTimeout(t)
  if (immediate) flush(key)
  else timers.set(key, setTimeout(() => flush(key), 800))
}

export const flushAll = () => {
  for (const [key, t] of timers) {
    clearTimeout(t)
    flush(key)
  }
}
