// 我的歌单
import { computed, markRaw, reactive, watch } from 'vue'
import { api, type Song } from './api'
import { toast } from './ui'

export interface MyList {
  id: string
  name: string
  songs: Song[]
  /** 从在线歌单收藏而来时记录来源，用于「同步更新」 */
  source?: string
  sourceListId?: string
  /** 用户从这个（收藏/导入来的）歌单里删掉的歌曲 id：「同步更新」时不再加回来 */
  removed?: string[]
  createdAt?: number
}

export const lists = reactive<MyList[]>([])
let loaded = false

export const loveList = computed(() => lists.find(l => l.id == 'love')!)
const loveIds = computed(() => new Set(loveList.value?.songs.map(s => s.id)))
export const isLoved = (song: Song | null | undefined) => !!song && loveIds.value.has(song.id)

const raw = (songs: Song[]) => songs.map(s => markRaw({ ...s, _reason: undefined, _playedAt: undefined }))

export const initLists = async() => {
  const saved = await api<MyList[]>('data.load', 'lists', [])
  lists.splice(0, lists.length, ...(saved ?? []).map(l => ({ ...l, songs: raw(l.songs ?? []) })))
  if (!lists.some(l => l.id == 'love')) lists.unshift({ id: 'love', name: '我喜欢', songs: [], createdAt: Date.now() })
  loaded = true
  watch(lists, () => { if (loaded) void api('data.save', 'lists', lists) }, { deep: true })
}

export const getList = (id: string) => lists.find(l => l.id == id)

export const createList = (name: string, songs: Song[] = [], extra: Partial<MyList> = {}) => {
  const list: MyList = { id: `list_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: name.trim().slice(0, 60) || '新建歌单', songs: raw(songs), createdAt: Date.now(), ...extra }
  lists.push(list)
  return lists[lists.length - 1]
}

export const removeList = (id: string) => {
  if (id == 'love') return
  const i = lists.findIndex(l => l.id == id)
  if (i > -1) lists.splice(i, 1)
}

/**
 * 添加歌曲（自动去重），返回实际新增的数量
 * skipRemoved：同步原歌单时用，跳过用户以前从这个歌单里删掉的歌；手动添加则相反，会把它从「已删除」里拿掉
 */
export const addSongs = (listId: string, songs: Song[], toTop = false, skipRemoved = false) => {
  const list = getList(listId)
  if (!list) return 0
  const ids = new Set(list.songs.map(s => s.id))
  const removed = new Set(list.removed ?? [])
  const fresh = raw(songs.filter(s => {
    if (ids.has(s.id) || (skipRemoved && removed.has(s.id))) return false
    ids.add(s.id)
    return true
  }))
  if (!fresh.length) return 0
  if (!skipRemoved && removed.size) {
    for (const s of fresh) removed.delete(s.id)
    list.removed = [...removed]
  }
  if (toTop) list.songs.unshift(...fresh)
  else list.songs.push(...fresh)
  return fresh.length
}

export const removeSongs = (listId: string, ids: string[]) => {
  const list = getList(listId)
  if (!list) return
  const set = new Set(ids)
  list.songs = list.songs.filter(s => !set.has(s.id))
  // 收藏/导入来的歌单：记住删掉了哪些，之后「同步更新」不会又加回来
  if (list.sourceListId) list.removed = [...new Set([...(list.removed ?? []), ...ids])].slice(-5000)
}

/** 同步原歌单时会被跳过的歌曲数量（用户删掉的） */
export const countRemoved = (listId: string, songs: Song[]) => {
  const removed = new Set(getList(listId)?.removed ?? [])
  return removed.size ? songs.filter(s => removed.has(s.id)).length : 0
}

export const toggleLove = (song: Song) => {
  if (isLoved(song)) {
    removeSongs('love', [song.id])
    toast('已取消喜欢')
  } else {
    addSongs('love', [song], true)
    toast('已添加到「我喜欢」', 'success')
  }
}

/** 导入一批列表（LX 迁移 / 文件导入），同名列表合并 */
export const importLists = (imported: Array<{ id: string, name: string, source?: string, sourceListId?: string, songs: Song[] }>) => {
  let listCount = 0
  let songCount = 0
  for (const item of imported) {
    if (!item.songs?.length) continue
    let target: MyList | undefined
    if (item.id == 'love') target = loveList.value
    else target = lists.find(l => l.id != 'love' && ((item.sourceListId && l.sourceListId == item.sourceListId && l.source == item.source) || l.name == item.name))
    if (target) songCount += addSongs(target.id, item.songs)
    else {
      createList(item.name, item.songs, { source: item.source, sourceListId: item.sourceListId })
      songCount += item.songs.length
    }
    listCount++
  }
  return { listCount, songCount }
}
