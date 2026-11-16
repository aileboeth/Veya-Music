// 手机版 crypto / zlib 垫片和 Node 原生实现逐字节对比：node tools/test-android-shims.mjs
import assert from 'node:assert/strict'
import nodeCrypto from 'node:crypto'
import nodeZlib from 'node:zlib'
import * as shim from '../src/android/shims/crypto.ts'
import * as zshim from '../src/android/shims/zlib.ts'
import * as path from '../src/android/shims/path.ts'

const data = Buffer.from('Veya Music 同步测试 ' + 'x'.repeat(100))
for (const alg of ['md5', 'sha1', 'sha256']) {
  assert.equal(shim.createHash(alg).update('abc中文').digest('hex'), nodeCrypto.createHash(alg).update('abc中文').digest('hex'), alg)
  assert.deepEqual(shim.createHash(alg).update(data).digest(), nodeCrypto.createHash(alg).update(data).digest(), alg + ' buffer')
}
assert.equal(shim.createHmac('sha256', 'k').update('m').digest('hex'), nodeCrypto.createHmac('sha256', 'k').update('m').digest('hex'))

const key = Buffer.from('0CoJUm6Qyw8W8jud')
const iv = Buffer.from('0102030405060708')
for (const [alg, k, v] of [['aes-128-cbc', key, iv], ['aes-128-ecb', key, ''], ['aes-256-cbc', Buffer.alloc(32, 7), iv]]) {
  const a = Buffer.concat([shim.createCipheriv(alg, k, v).update(data), shim.createCipheriv(alg, k, v).final()])
  const s = shim.createCipheriv(alg, k, v)
  const enc = Buffer.concat([s.update(data), s.final()])
  const n = nodeCrypto.createCipheriv(alg, k, v || null)
  const nenc = Buffer.concat([n.update(data), n.final()])
  assert.deepEqual(enc, nenc, alg + ' encrypt')
  const d = shim.createDecipheriv(alg, k, v)
  assert.deepEqual(Buffer.concat([d.update(nenc), d.final()]), data, alg + ' decrypt')
  assert.ok(a.length >= 0)
}
// 输出编码写法：update(x,'utf8','base64') + final('base64')
const c1 = shim.createCipheriv('aes-128-ecb', key, '')
const c2 = nodeCrypto.createCipheriv('aes-128-ecb', key, null)
assert.equal(c1.update('hello', 'utf8', 'base64') + c1.final('base64'), c2.update('hello', 'utf8', 'base64') + c2.final('base64'))

// 网易云接口用的 RSA 公钥（无填充）
const pub = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB\n-----END PUBLIC KEY-----'
const secret = Buffer.concat([Buffer.alloc(112), Buffer.from('abcdefghijklmnop')])
assert.deepEqual(shim.publicEncrypt({ key: pub, padding: shim.constants.RSA_NO_PADDING }, secret), nodeCrypto.publicEncrypt({ key: pub, padding: nodeCrypto.constants.RSA_NO_PADDING }, secret), 'rsa no padding')
// PKCS1 填充：Node 能用私钥解开就说明格式对
const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 1024, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
const pk = shim.publicEncrypt({ key: publicKey, padding: shim.constants.RSA_PKCS1_PADDING }, Buffer.from('hi'))
assert.equal(nodeCrypto.privateDecrypt({ key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING }, pk).toString(), 'hi')
assert.equal(shim.randomBytes(16).length, 16)

// zlib
const text = Buffer.from('歌词 '.repeat(500))
const def = nodeZlib.deflateSync(text)
await new Promise((resolve, reject) => zshim.inflate(def, (err, out) => { try { assert.ifError(err); assert.deepEqual(out, text); resolve() } catch (e) { reject(e) } }))
assert.deepEqual(zshim.inflateSync(zshim.deflateSync(text)), text)
// 截断的数据 + Z_SYNC_FLUSH：能解多少返回多少（QQ 歌词解密用）
const truncated = def.subarray(0, def.length - 6)
const partial = zshim.inflateSync(truncated, { finishFlush: zshim.constants.Z_SYNC_FLUSH })
const nodePartial = nodeZlib.inflateSync(truncated, { finishFlush: nodeZlib.constants.Z_SYNC_FLUSH })
assert.deepEqual(partial, nodePartial, 'partial inflate')
assert.deepEqual(zshim.gunzipSync(nodeZlib.gzipSync(text)), text)

// path
assert.equal(path.join('/veya', 'VeyaData', '../x.json'), '/veya/x.json')
assert.equal(path.basename('/a/b/c.js', '.js'), 'c')
assert.equal(path.extname('a/b.lrc'), '.lrc')
assert.equal(path.dirname('/veya/VeyaData/sources/x.js'), '/veya/VeyaData/sources')
console.log('android shim tests: all passed')
