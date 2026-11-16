// 下载的文件读写（电脑版）：流式写入临时文件 → 按文件头修正扩展名 → 改成正式文件名
// 手机版保存到系统「音乐/Veya Music」（MediaStore），见 src/android/main/downloadIO.ts
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { agentFor } from './net'

export interface Progress { total: number, downloaded: number, onProgress(): void, onAbort(fn: () => void): void }

export const defaultDir = () => path.join(app.getPath('music'), 'Veya Music')

const sniffExt = (file: string) => {
  try {
    const fd = fs.openSync(file, 'r')
    const b = Buffer.alloc(12)
    fs.readSync(fd, b, 0, 12, 0)
    fs.closeSync(fd)
    const tag = b.toString('latin1', 0, 4)
    if (b.toString('latin1', 4, 8) == 'ftyp') return 'm4a'
    if (tag == 'fLaC') return 'flac'
    if (tag == 'OggS') return 'ogg'
    if (tag == 'RIFF') return 'wav'
    if (tag.startsWith('ID3') || (b[0] == 0xff && (b[1] & 0xe0) == 0xe0)) return 'mp3'
  } catch {}
  return ''
}

const fetchToFile = (url: string, file: string, p: Progress, redirects = 0): Promise<void> => new Promise((resolve, reject) => {
  const req = (url.startsWith('https') ? https : http).get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
    timeout: 30_000,
    agent: agentFor(url),
  }, res => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
      res.resume()
      fetchToFile(new URL(res.headers.location, url).href, file, p, redirects + 1).then(resolve, reject)
      return
    }
    if (res.statusCode != 200) {
      res.resume()
      reject(new Error(`服务器返回 ${res.statusCode}`))
      return
    }
    p.total = Number(res.headers['content-length'] ?? 0)
    const out = fs.createWriteStream(file)
    res.on('data', chunk => {
      p.downloaded += chunk.length
      p.onProgress()
    })
    res.pipe(out)
    out.on('finish', () => resolve())
    out.on('error', reject)
    res.on('error', reject)
  })
  req.on('timeout', () => req.destroy(new Error('下载超时')))
  req.on('error', reject)
  p.onAbort(() => req.destroy(new Error('已取消')))
})

/** 下载到 dir/base.ext，返回最终的文件路径 */
export const saveAudio = async(url: string, dir: string, base: string, ext: string, p: Progress) => {
  fs.mkdirSync(dir, { recursive: true })
  let file = path.join(dir, `${base}.${ext}`)
  const tmp = file + '.veyadl'
  try {
    await fetchToFile(url, tmp, p)
    if (p.downloaded < 20_000) throw new Error('下载到的文件无效')
    // 链接里看不出格式的（比如汽水的是 m4a）：按文件开头的标记改成正确的扩展名
    const real = /\.(mp3|flac|m4a|ogg|wav|ape|aac)(?:\?|$)/i.test(url) ? '' : sniffExt(tmp)
    if (real && real != ext) file = path.join(dir, `${base}.${real}`)
    fs.renameSync(tmp, file)
    return file
  } catch (err) {
    fs.promises.unlink(tmp).catch(() => {})
    throw err
  }
}

export const saveLyric = async(dir: string, base: string, text: string) => {
  fs.writeFileSync(path.join(dir, `${base}.lrc`), text)
}

export const fileExists = (file: string) => !!file && fs.existsSync(file)
/** 播放器能直接打开的地址 */
export const playableUrl = (file: string) => 'file:///' + file.replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')
