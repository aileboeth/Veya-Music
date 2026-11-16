// 歌曲右键菜单 + 通用歌曲操作
import { ref } from 'vue'
import { api, on, type Song } from './api'
import { isLoved, removeSongs, toggleLove } from './lists'
import { addNext, enqueue, player, playSong, removeFromQueue, startRadio } from './player'
import { settings } from './settings'
import { go, openMenu, pickListFor, toast, type MenuItem } from './ui'

export const download = async(songs: Song[]) => {
  if (!songs.length) return
  await api('dl.add', songs, settings.downloadQuality)
  toast(`已加入下载：${songs.length} 首`, 'success')
}

/** 每次标记「不喜欢」后加一，推荐类页面据此刷新列表 */
export const dislikeVersion = ref(0)
// 从别的设备同步来了新的每日推荐 / 不喜欢：推荐页重新读取
on('data:changed', (key: string) => { if (key == 'daily' || key == 'dislikes') dislikeVersion.value++ })

export const dislike = async(song: Song, singer = false) => {
  await api('rec.dislike', song, singer)
  dislikeVersion.value++
  toast(singer ? `以后不再推荐 ${song.singer.split(/、|&/)[0]} 的歌` : `以后不再推荐《${song.name}》，相似的歌也会少推`)
  // 正在放的就是这首：从队列里拿掉并切到下一首
  if (!singer && player.song?.id == song.id) removeFromQueue(player.index)
}

export interface SongMenuOptions {
  /** 所在的「我的歌单」id，传入后出现「从歌单删除」 */
  listId?: string
  /** 自定义播放动作（在列表里双击播放整个列表） */
  play?: () => void
  /** 推荐类列表：显示「不喜欢」 */
  recommend?: boolean
  onRemoved?: () => void
}

export const openSongMenu = (e: MouseEvent, song: Song, opts: SongMenuOptions = {}) => {
  const mainSinger = song.singer.split(/、|&|\/|,/)[0]?.trim()
  const items: MenuItem[] = [
    { label: '播放', icon: 'play', action: opts.play ?? (() => playSong(song)) },
    { label: '下一首播放', icon: 'playnext', action: () => addNext([song]) },
    { label: '添加到播放队列', icon: 'queue', action: () => enqueue([song]) },
    { divider: true },
    { label: isLoved(song) ? '取消喜欢' : '喜欢', icon: isLoved(song) ? 'heart-fill' : 'heart', action: () => toggleLove(song) },
    { label: '添加到歌单…', icon: 'plus', action: () => pickListFor([song]) },
    { label: '下载', icon: 'download', action: () => void download([song]) },
    { divider: true },
    { label: '相似歌曲电台', icon: 'radio', action: () => void startRadio(song) },
    ...(mainSinger ? [{ label: `搜索「${mainSinger}」`, icon: 'search', action: () => go('search', { text: mainSinger }) }] : []),
    { label: '复制歌名', icon: 'copy', action: () => { void navigator.clipboard.writeText(`${song.name} - ${song.singer}`); toast('已复制') } },
  ]
  if (opts.recommend) {
    items.push({ divider: true })
    items.push({ label: '不喜欢这首歌', icon: 'ban', action: () => { void dislike(song).then(opts.onRemoved) } })
    if (mainSinger) items.push({ label: `不喜欢「${mainSinger}」`, icon: 'ban', action: () => { void dislike(song, true).then(opts.onRemoved) } })
  }
  if (opts.listId) {
    items.push({ divider: true })
    items.push({ label: '从歌单删除', icon: 'trash', danger: true, action: () => { removeSongs(opts.listId!, [song.id]); opts.onRemoved?.() } })
  }
  openMenu(e, items)
}
