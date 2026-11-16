// zlib 模块（pako）：歌词解压（酷我 / 酷狗 / QQ）、音源脚本的 lx.utils.zlib
import pako from 'pako'

export const constants = { Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4 }

type Cb = (err: Error | null, result?: Buffer) => void

/** finishFlush = Z_SYNC_FLUSH 时容忍不完整的数据（和 Node 一样，能解多少返回多少） */
const run = (data: any, opts: any, raw: boolean, gzip = false): Buffer => {
  const input = data instanceof Uint8Array ? data : Buffer.from(data)
  const lenient = opts?.finishFlush == constants.Z_SYNC_FLUSH
  if (!lenient) return Buffer.from(gzip ? pako.ungzip(input) : raw ? pako.inflateRaw(input) : pako.inflate(input))
  const chunks: Uint8Array[] = []
  const inf = new pako.Inflate({ raw })
  inf.onData = (chunk: any) => { chunks.push(chunk) }
  inf.onEnd = () => {}
  inf.push(input, constants.Z_SYNC_FLUSH)
  // pako 只在输出缓冲区写满或者数据结束时才交出数据：剩下已经解出来的部分还在缓冲区里
  const strm = (inf as any).strm
  if (!(inf as any).ended && strm?.output && strm.next_out > 0) chunks.push(strm.output.subarray(0, strm.next_out))
  if (inf.err && !chunks.length) throw new Error(inf.msg || 'inflate failed')
  return Buffer.concat(chunks.map(c => Buffer.from(c)))
}

const async = (fn: () => Buffer, cb?: Cb) => {
  try { cb?.(null, fn()) } catch (err: any) { cb?.(err instanceof Error ? err : new Error(String(err))) }
}
const pick = (opts: any, cb?: any): [any, Cb | undefined] => typeof opts == 'function' ? [{}, opts] : [opts ?? {}, cb]

export const inflateSync = (data: any, opts?: any) => run(data, opts, false)
export const inflateRawSync = (data: any, opts?: any) => run(data, opts, true)
export const gunzipSync = (data: any) => run(data, null, false, true)
export const unzipSync = (data: any) => {
  const b = Buffer.from(data)
  return b[0] == 0x1f && b[1] == 0x8b ? gunzipSync(b) : inflateSync(b)
}
export const deflateSync = (data: any) => Buffer.from(pako.deflate(data instanceof Uint8Array ? data : Buffer.from(data)))
export const deflateRawSync = (data: any) => Buffer.from(pako.deflateRaw(data instanceof Uint8Array ? data : Buffer.from(data)))
export const gzipSync = (data: any) => Buffer.from(pako.gzip(data instanceof Uint8Array ? data : Buffer.from(data)))

export const inflate = (data: any, opts?: any, cb?: Cb) => { const [o, c] = pick(opts, cb); async(() => inflateSync(data, o), c) }
export const inflateRaw = (data: any, opts?: any, cb?: Cb) => { const [o, c] = pick(opts, cb); async(() => inflateRawSync(data, o), c) }
export const gunzip = (data: any, opts?: any, cb?: Cb) => { const [, c] = pick(opts, cb); async(() => gunzipSync(data), c) }
export const unzip = (data: any, opts?: any, cb?: Cb) => { const [, c] = pick(opts, cb); async(() => unzipSync(data), c) }
export const deflate = (data: any, opts?: any, cb?: Cb) => { const [, c] = pick(opts, cb); async(() => deflateSync(data), c) }
export const deflateRaw = (data: any, opts?: any, cb?: Cb) => { const [, c] = pick(opts, cb); async(() => deflateRawSync(data), c) }
export const gzip = (data: any, opts?: any, cb?: Cb) => { const [, c] = pick(opts, cb); async(() => gzipSync(data), c) }

export default { constants, inflate, inflateSync, inflateRaw, inflateRawSync, gunzip, gunzipSync, unzip, unzipSync, deflate, deflateSync, deflateRaw, deflateRawSync, gzip, gzipSync }
