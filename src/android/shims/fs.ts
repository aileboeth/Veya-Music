// fs 模块：读写应用私有目录里的文本文件（原生层把路径限制在 filesDir 之内）
// 只支持文本（歌单、设置、音源脚本、歌词缓存都是文本）
import { N } from '../native'
import { normalize } from './path'

const rel = (p: string) => normalize(String(p)).replace(/^\/+/, '')
const enoent = (p: string, op: string) => {
  const err: any = new Error(`ENOENT: no such file or directory, ${op} '${p}'`)
  err.code = 'ENOENT'
  return err
}
const toText = (data: any) => typeof data == 'string' ? data : Buffer.isBuffer(data) || data instanceof Uint8Array ? Buffer.from(data).toString('utf8') : String(data)
const encOf = (o: any) => typeof o == 'string' ? o : o?.encoding

export const existsSync = (p: string) => N.fsExists(rel(p))

export const readFileSync = (p: string, opts?: any): any => {
  const s = N.fsRead(rel(p))
  if (s == null) throw enoent(p, 'open')
  return encOf(opts) ? s : Buffer.from(s, 'utf8')
}

export const writeFileSync = (p: string, data: any) => {
  if (!N.fsWrite(rel(p), toText(data))) throw new Error(`写入失败: ${p}`)
}

export const appendFileSync = (p: string, data: any) => {
  const old = N.fsRead(rel(p)) ?? ''
  writeFileSync(p, old + toText(data))
}

export const copyFileSync = (from: string, to: string) => {
  if (!N.fsCopy(rel(from), rel(to))) throw enoent(from, 'copyfile')
}

export const renameSync = (from: string, to: string) => {
  if (!N.fsRename(rel(from), rel(to))) throw enoent(from, 'rename')
}

export const unlinkSync = (p: string) => {
  if (!N.fsDelete(rel(p))) throw enoent(p, 'unlink')
}
export const rmSync = (p: string) => { N.fsDelete(rel(p)) }

export const mkdirSync = (p: string, _opts?: any) => { N.fsMkdir(rel(p)) }

export const readdirSync = (p: string): string[] => {
  try { return JSON.parse(N.fsList(rel(p))) } catch { return [] }
}

export const statSync = (p: string) => {
  const s = N.fsStat(rel(p))
  if (s == null) throw enoent(p, 'stat')
  const st = JSON.parse(s)
  return { size: st.size, mtimeMs: st.mtime, isFile: () => !st.dir, isDirectory: () => !!st.dir }
}

export const promises = {
  readFile: async(p: string, opts?: any) => readFileSync(p, opts),
  writeFile: async(p: string, data: any) => writeFileSync(p, data),
  unlink: async(p: string) => unlinkSync(p),
  mkdir: async(p: string) => mkdirSync(p),
}

const unsupported = (name: string) => () => { throw new Error(`fs.${name} 在手机版不可用`) }
export const createWriteStream = unsupported('createWriteStream')
export const openSync = unsupported('openSync')
export const readSync = unsupported('readSync')
export const closeSync = unsupported('closeSync')

export default { existsSync, readFileSync, writeFileSync, appendFileSync, copyFileSync, renameSync, unlinkSync, rmSync, mkdirSync, readdirSync, statSync, promises, createWriteStream, openSync, readSync, closeSync }
