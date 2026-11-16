// 定时关闭：到时间暂停；可以选「把当前这首放完再停」
// 手机版交给原生播放器计时（页面在后台时定时器会被系统限速，不准）
import { reactive } from 'vue'
import { api, on } from './api'
import { isAndroid } from './platform'
import { player, setStopAfterCurrent, toggle } from './player'
import { toast } from './ui'

export const sleepState = reactive({ until: 0, afterSong: false, waitingSong: false })
let timer: any = null

const done = () => {
  sleepState.until = 0
  sleepState.waitingSong = false
  toast('定时关闭：已暂停播放')
}

export const setSleep = async(minutes: number, afterSong = sleepState.afterSong) => {
  sleepState.afterSong = afterSong
  sleepState.waitingSong = false
  clearTimeout(timer)
  setStopAfterCurrent(false)
  if (isAndroid) {
    const r = await api<{ until: number }>('player.sleep', { minutes, afterSong })
    sleepState.until = r.until
  } else {
    sleepState.until = minutes > 0 ? Date.now() + minutes * 60_000 : 0
    if (minutes > 0) {
      timer = setTimeout(() => {
        sleepState.until = 0
        if (!player.playing) return
        if (afterSong) {
          sleepState.waitingSong = true
          setStopAfterCurrent(true, done)
        } else {
          toggle()
          done()
        }
      }, minutes * 60_000)
    }
  }
  if (minutes > 0) toast(`${minutes} 分钟后${afterSong ? '放完当前这首' : ''}停止播放`, 'success')
  else toast('已关闭定时')
}

/** 还剩多少（mm:ss），没开启时返回空字符串 */
export const sleepLeft = (now = Date.now()) => {
  if (!sleepState.until) return sleepState.waitingSong ? '放完这首' : ''
  const s = Math.max(0, Math.round((sleepState.until - now) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

on('sleep:done', done)
