// crypto 模块（纯 JS）：LX musicSdk 和音源脚本用到的 md5/sha1/sha256、AES-ECB/CBC、无填充 RSA、随机数
// 音源脚本的 Worker 里也用这一份（lx.utils.crypto）
import CryptoJS from 'crypto-js'

type Data = string | Uint8Array
const toBuf = (d: Data, enc?: string): Buffer => typeof d == 'string' ? Buffer.from(d, (enc as BufferEncoding) || 'utf8') : Buffer.from(d)
const toWA = (b: Buffer) => CryptoJS.lib.WordArray.create(b as any)
const fromWA = (wa: CryptoJS.lib.WordArray) => {
  const n = Math.max(0, wa.sigBytes)
  const out = Buffer.alloc(n)
  for (let i = 0; i < n; i++) out[i] = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  return out
}
const encode = (b: Buffer, enc?: string) => enc ? b.toString(enc as BufferEncoding) : b

const HASHES: Record<string, (wa: any) => CryptoJS.lib.WordArray> = {
  md5: wa => CryptoJS.MD5(wa),
  sha1: wa => CryptoJS.SHA1(wa),
  sha256: wa => CryptoJS.SHA256(wa),
  sha512: wa => CryptoJS.SHA512(wa),
}
const HMACS: Record<string, (wa: any, key: any) => CryptoJS.lib.WordArray> = {
  md5: (wa, k) => CryptoJS.HmacMD5(wa, k),
  sha1: (wa, k) => CryptoJS.HmacSHA1(wa, k),
  sha256: (wa, k) => CryptoJS.HmacSHA256(wa, k),
  sha512: (wa, k) => CryptoJS.HmacSHA512(wa, k),
}

class Hash {
  private parts: Buffer[] = []
  private fn: (wa: any) => CryptoJS.lib.WordArray
  constructor(fn: (wa: any) => CryptoJS.lib.WordArray) { this.fn = fn }
  update(d: Data, enc?: string) {
    this.parts.push(toBuf(d, enc))
    return this
  }
  digest(enc?: string): any {
    return encode(fromWA(this.fn(toWA(Buffer.concat(this.parts)))), enc)
  }
}

export const createHash = (alg: string) => {
  const fn = HASHES[String(alg).toLowerCase()]
  if (!fn) throw new Error('不支持的哈希算法: ' + alg)
  return new Hash(fn)
}
export const createHmac = (alg: string, key: Data) => {
  const fn = HMACS[String(alg).toLowerCase()]
  if (!fn) throw new Error('不支持的 HMAC 算法: ' + alg)
  const k = toWA(toBuf(key))
  return new Hash(wa => fn(wa, k))
}

class Cipher {
  private parts: Buffer[] = []
  private padding = true
  private mode: any
  private key: Buffer
  private iv: Buffer | null
  private decrypt: boolean
  constructor(alg: string, key: Buffer, iv: Buffer | null, decrypt: boolean) {
    this.key = key
    this.iv = iv
    this.decrypt = decrypt
    const m = /^aes-(128|192|256)-(cbc|ecb)$/i.exec(alg)
    if (!m) throw new Error('不支持的加密算法: ' + alg)
    this.mode = m[2].toLowerCase() == 'cbc' ? CryptoJS.mode.CBC : CryptoJS.mode.ECB
  }
  update(d: Data, inEnc?: string, outEnc?: string): any {
    this.parts.push(toBuf(d, inEnc))
    return outEnc ? '' : Buffer.alloc(0)
  }
  setAutoPadding(v = true) {
    this.padding = v
    return this
  }
  final(outEnc?: string): any {
    const data = Buffer.concat(this.parts)
    this.parts = []
    const cfg: any = { mode: this.mode, padding: this.padding ? CryptoJS.pad.Pkcs7 : CryptoJS.pad.NoPadding }
    if (this.mode === CryptoJS.mode.CBC) cfg.iv = toWA(this.iv ?? Buffer.alloc(16))
    const key = toWA(this.key)
    const out = this.decrypt
      ? fromWA(CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: toWA(data) }), key, cfg))
      : fromWA(CryptoJS.AES.encrypt(toWA(data), key, cfg).ciphertext)
    return encode(out, outEnc)
  }
}
const ivBuf = (iv: any) => iv == null || iv === '' ? null : toBuf(iv)
export const createCipheriv = (alg: string, key: Data, iv: any) => new Cipher(alg, toBuf(key), ivBuf(iv), false)
export const createDecipheriv = (alg: string, key: Data, iv: any) => new Cipher(alg, toBuf(key), ivBuf(iv), true)

// ---------------- RSA（只需要公钥加密） ----------------
const readTLV = (b: Buffer, pos: number) => {
  const tag = b[pos]
  let len = b[pos + 1]
  let off = pos + 2
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = len * 256 + b[off++]
  }
  return { tag, start: off, end: off + len }
}
const bigOf = (b: Buffer) => BigInt('0x' + (b.toString('hex') || '0'))
const parsePublicKey = (key: any) => {
  const pem = typeof key == 'string' ? key : key?.key ?? String(key)
  const der = Buffer.from(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
  const outer = readTLV(der, 0)
  let first = readTLV(der, outer.start)
  if (first.tag == 0x30) {
    // SubjectPublicKeyInfo：算法标识 + BIT STRING(RSAPublicKey)
    const bits = readTLV(der, first.end)
    const seq = readTLV(der, bits.start + 1)
    first = readTLV(der, seq.start)
  }
  const n = first
  const e = readTLV(der, n.end)
  return { n: bigOf(der.subarray(n.start, n.end)), e: bigOf(der.subarray(e.start, e.end)), k: (der.subarray(n.start, n.end).toString('hex').replace(/^(00)+/, '').length + 1) >> 1 }
}
const modPow = (base: bigint, exp: bigint, mod: bigint) => {
  let r = 1n
  base %= mod
  while (exp > 0n) {
    if (exp & 1n) r = r * base % mod
    base = base * base % mod
    exp >>= 1n
  }
  return r
}

export const constants = { RSA_NO_PADDING: 3, RSA_PKCS1_PADDING: 1, RSA_PKCS1_OAEP_PADDING: 4 }

export const publicEncrypt = (key: any, data: Data) => {
  const { n, e, k } = parsePublicKey(key)
  const padding = typeof key == 'object' && key?.padding != null ? key.padding : constants.RSA_PKCS1_OAEP_PADDING
  let msg = toBuf(data)
  if (padding == constants.RSA_PKCS1_PADDING) {
    const ps = Buffer.alloc(k - msg.length - 3)
    for (let i = 0; i < ps.length; i++) {
      let r = 0
      while (!r) r = randomBytes(1)[0]
      ps[i] = r
    }
    msg = Buffer.concat([Buffer.from([0, 2]), ps, Buffer.from([0]), msg])
  } else if (padding != constants.RSA_NO_PADDING) throw new Error('不支持的 RSA 填充方式')
  const c = modPow(bigOf(msg), e, n)
  return Buffer.from(c.toString(16).padStart(k * 2, '0'), 'hex')
}

export const randomBytes = (size: number) => {
  const a = new Uint8Array(size)
  globalThis.crypto.getRandomValues(a)
  return Buffer.from(a)
}
export const randomUUID = () => globalThis.crypto.randomUUID()

export default { createHash, createHmac, createCipheriv, createDecipheriv, publicEncrypt, randomBytes, randomUUID, constants }
