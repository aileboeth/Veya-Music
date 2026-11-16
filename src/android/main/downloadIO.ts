// 下载的文件读写（手机版）：原生层下载到系统的「音乐/Veya Music」文件夹（MediaStore），
// 其他音乐 App 和文件管理器也能看到；返回 content:// 地址，播放器直接打开
import { N, call, newId, onNative } from '../native'
import type { Progress } from '../../main/downloadIO'

export type { Progress }

export const defaultDir = () => '音乐/Veya Music'

const progressHandlers = new Map<string, (p: { total: number, downloaded: number }) => void>()
onNative('dl', (e: any) => progressHandlers.get(e?.id)?.(e))

export const saveAudio = async(url: string, _dir: string, base: string, ext: string, p: Progress) => {
  const id = newId('d')
  progressHandlers.set(id, e => {
    p.total = e.total
    p.downloaded = e.downloaded
    p.onProgress()
  })
  p.onAbort(() => void call('dl.cancel', { id }).catch(() => {}))
  try {
    const r = await call<{ uri: string, bytes: number }>('dl.save', { id, url, base, ext })
    p.downloaded = r.bytes
    return r.uri
  } finally {
    progressHandlers.delete(id)
  }
}

export const saveLyric = async(_dir: string, base: string, text: string) => {
  await call('dl.saveText', { base, ext: 'lrc', text })
}

export const fileExists = (uri: string) => !!uri && N.fileExists(uri)
export const playableUrl = (uri: string) => uri
