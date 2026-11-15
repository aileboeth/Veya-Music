// 从 LX Music 迁移「我的列表」：只读，先把数据库复制到临时目录再读取，不会改动 LX 的数据
import { app } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import { normSong } from './music'

const toVeyaSong = (m: any) => {
  if (!m || m.source == 'local') return null
  const meta = typeof m.meta == 'string' ? JSON.parse(m.meta) : (m.meta ?? {})
  const song: any = {
    name: m.name,
    singer: m.singer,
    source: m.source,
    songmid: meta.songId,
    interval: m.interval,
    albumName: meta.albumName,
    albumId: meta.albumId,
    img: meta.picUrl ?? '',
    types: meta.qualitys ?? [],
    _types: meta._qualitys ?? {},
  }
  switch (m.source) {
    case 'kg':
      song.hash = meta.hash
      song.albumAudioId = meta.albumAudioId
      break
    case 'tx':
      song.strMediaMid = meta.strMediaMid
      song.albumMid = meta.albumMid
      song.songId = meta.id
      break
    case 'mg':
      song.copyrightId = meta.copyrightId
      song.lrcUrl = meta.lrcUrl
      song.mrcUrl = meta.mrcUrl
      song.trcUrl = meta.trcUrl
      break
  }
  return normSong(song)
}

export const lxDbPath = () => path.join(app.getPath('appData'), 'lx-music-desktop', 'LxDatas', 'lx.data.db')

export interface ImportedList { id: string, name: string, source?: string, sourceListId?: string, songs: any[] }

export const readLxDatabase = (): ImportedList[] => {
  const dbPath = lxDbPath()
  if (!fs.existsSync(dbPath)) throw new Error('没有找到 LX Music 的数据（' + dbPath + '）')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'veya-lx-'))
  try {
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + ext)) fs.copyFileSync(dbPath + ext, path.join(tmp, 'lx.data.db' + ext))
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(path.join(tmp, 'lx.data.db'))
    try {
      const userLists: any[] = db.prepare('SELECT id, name, source, sourceListId FROM my_list ORDER BY position ASC').all()
      const lists = [
        { id: 'default', name: '试听列表' },
        { id: 'love', name: '我的收藏' },
        ...userLists,
      ]
      const stmt = db.prepare(`SELECT m.id, m.name, m.singer, m.source, m.interval, m.meta
        FROM my_list_music_info m
        LEFT JOIN my_list_music_info_order o ON m.id = o.musicInfoId AND o.listId = m.listId
        WHERE m.listId = ? ORDER BY o."order" ASC`)
      const out: ImportedList[] = []
      for (const l of lists) {
        const songs = stmt.all(l.id).map(toVeyaSong).filter(Boolean)
        if (!songs.length && (l.id == 'default' || l.id == 'love')) continue
        out.push({ id: l.id, name: l.name, source: l.source ?? undefined, sourceListId: l.sourceListId ?? undefined, songs })
      }
      return out
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** 读取 LX 导出的列表文件（.lxmc / .json） */
export const readLxFile = (filePath: string): ImportedList[] => {
  let buf = fs.readFileSync(filePath)
  if (buf[0] == 0x1f && buf[1] == 0x8b) buf = zlib.gunzipSync(buf)
  const json = JSON.parse(buf.toString('utf8'))
  let lists: any[] = []
  switch (json.type) {
    case 'playList_v2':
    case 'allData_v2':
      lists = json.type == 'allData_v2' ? (json.playList ?? json.data?.playList ?? []) : json.data
      break
    case 'playListPart_v2':
      lists = [json.data]
      break
    default:
      if (Array.isArray(json.data)) lists = json.data
      else if (json.data?.list) lists = [json.data]
      else throw new Error('不支持的列表文件格式')
  }
  return lists.filter(l => l && Array.isArray(l.list)).map(l => ({
    id: String(l.id ?? ''),
    name: l.id == 'default' ? '试听列表' : l.id == 'love' ? '我的收藏' : String(l.name ?? '导入的列表'),
    source: l.source,
    sourceListId: l.sourceListId,
    // 旧版文件里的歌曲没有 meta 字段，本身就是 Veya 使用的格式
    songs: l.list.map((m: any) => m?.meta ? toVeyaSong(m) : normSong(m)).filter(Boolean),
  }))
}
