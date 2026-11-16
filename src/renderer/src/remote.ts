// 设备联动（通过自部署的同步服务器转发）：
// - 接力播放：从另一台设备接过它的播放队列和进度（对方暂停），或者把自己正在放的交给另一台
// - 推歌：把一首歌发到另一台设备上「立即播放」或「下一首播放」
// - 一起听：领头的设备广播「第 0 秒是在服务器时间 X 开始的」，其他设备按服务器时钟对齐进度
import { reactive, watch } from 'vue'
import { api, on, type Song } from './api'
import { addNext, pause, player, playList, playSong, resume, seek } from './player'
import { sync } from './sync'
import { confirmDialog, toast } from './ui'

export const remote = reactive({
  /** 正在跟着哪台设备一起听（设备 id） */
  following: '',
  /** 我在领头一起听：跟着我的设备 */
  followers: [] as string[],
  /** 等待对方把播放状态交过来 */
  pulling: '',
})

// ---------------- 服务器时钟 ----------------
let offset = 0
const refreshClock = async() => {
  try {
    const t0 = Date.now()
    const c = await api<{ now: number }>('sync.clock')
    offset = c.now - (t0 + Date.now()) / 2
  } catch {}
}
export const serverNow = () => Date.now() + offset

const nameOf = (id: string) => sync.devices.find(d => d.id == id)?.name || '另一台设备'
/** 发给对方的歌曲信息（去掉临时字段） */
const slim = (s: Song): Song => {
  const { _reason, _playedAt, ...rest } = s as any
  return rest
}
const send = (to: string, cmd: string, data: any) => api('sync.cmd', to, cmd, data)

// ---------------- 正在播放：上报给其他设备 ----------------
let npTimer: any = null
let lastNp = ''
const reportNow = () => {
  if (!sync.online) return
  const song = player.song
  const st = song ? {
    song: slim(song),
    playing: player.playing,
    time: player.time,
    at: serverNow(),
    duration: player.duration,
    source: player.source?.name ?? '',
    together: remote.followers.length > 0,
  } : null
  const key = JSON.stringify([st?.song.id, st?.playing, Math.round((st?.time ?? 0) / 5)])
  if (key == lastNp && st?.playing) return
  lastNp = key
  void api('sync.np', st).catch(() => {})
}
const scheduleNp = (ms = 400) => {
  clearTimeout(npTimer)
  npTimer = setTimeout(reportNow, ms)
}

// ---------------- 接力播放 ----------------
const myState = () => ({
  queue: player.queue.slice(Math.max(0, player.index - 200), player.index + 300).map(slim),
  index: Math.min(player.index, 200),
  time: player.time,
  at: serverNow(),
  playing: player.playing,
  source: player.source,
  radio: player.radio,
})

const applyState = (data: any, from: string) => {
  if (!data?.queue?.length) return toast(`${nameOf(from)} 没有在放歌`)
  const elapsed = data.playing ? Math.max(0, (serverNow() - (data.at ?? serverNow())) / 1000) : 0
  const start = Math.max(0, (data.time ?? 0) + elapsed)
  playList(data.queue, data.index ?? 0, data.source ?? { type: 'handoff', name: `来自${nameOf(from)}` }, start, data.playing !== false)
  toast(`已接过 ${nameOf(from)} 的播放`, 'success')
}

/** 从另一台设备接着放（对方会暂停） */
export const pullFrom = async(device: string) => {
  remote.pulling = device
  try {
    await send(device, 'handoff.request', {})
  } catch (err: any) {
    remote.pulling = ''
    return toast(`接力失败：${err.message}`, 'error')
  }
  // 对方 5 秒没回应：按它最后上报的「正在播放」接着放这一首
  setTimeout(() => {
    if (remote.pulling != device) return
    remote.pulling = ''
    const np = sync.devices.find(d => d.id == device)?.np
    if (np?.song) applyState({ queue: [np.song], index: 0, time: np.time, at: np.at, playing: true }, device)
    else toast(`${nameOf(device)} 没有回应`, 'error')
  }, 5000)
}

/** 把自己正在放的交给另一台设备，自己暂停 */
export const pushPlayback = async(device: string) => {
  if (!player.song) return toast('现在没有在放歌')
  try {
    await send(device, 'handoff.state', myState())
    if (player.playing) pause()
    toast(`已接力到 ${nameOf(device)}`, 'success')
  } catch (err: any) {
    toast(`接力失败：${err.message}`, 'error')
  }
}

/** 推歌：在另一台设备上立即播放 / 下一首播放 */
export const pushSong = async(device: string, song: Song, mode: 'now' | 'next' = 'now') => {
  try {
    await send(device, 'play.song', { song: slim(song), mode })
    toast(mode == 'now' ? `已在 ${nameOf(device)} 上播放《${song.name}》` : `已加到 ${nameOf(device)} 的下一首`, 'success')
  } catch (err: any) {
    toast(`推送失败：${err.message}`, 'error')
  }
}

// ---------------- 一起听 ----------------
const togetherState = () => ({
  song: player.song ? slim(player.song) : null,
  epoch: serverNow() - player.time * 1000,
  playing: player.playing,
})
const broadcastTogether = () => {
  if (!remote.followers.length) return
  const st = togetherState()
  for (const id of remote.followers) void send(id, 'together.sync', st).catch(() => {})
}

export const inviteTogether = async(device: string) => {
  if (!player.song) return toast('先放一首歌再邀请一起听')
  try {
    await send(device, 'together.invite', togetherState())
    toast(`已邀请 ${nameOf(device)} 一起听`)
  } catch (err: any) {
    toast(`邀请失败：${err.message}`, 'error')
  }
}

export const leaveTogether = () => {
  if (remote.following) void send(remote.following, 'together.leave', {}).catch(() => {})
  for (const id of remote.followers) void send(id, 'together.end', {}).catch(() => {})
  remote.following = ''
  remote.followers = []
  clearInterval(driftTimer)
  scheduleNp(0)
}

let target: { songId: string, epoch: number, playing: boolean } | null = null
let driftTimer: any = null
let syncing = false
const followState = (st: any) => {
  if (!st?.song) return
  target = { songId: st.song.id, epoch: st.epoch, playing: st.playing }
  const want = Math.max(0, (serverNow() - st.epoch) / 1000)
  if (player.song?.id != st.song.id) {
    syncing = true
    playList([st.song], 0, { type: 'together', name: `和${nameOf(remote.following)}一起听` }, want + 1.2, st.playing)
    setTimeout(() => { syncing = false }, 3000)
  } else if (!st.playing && player.playing) {
    syncing = true
    pause()
    setTimeout(() => { syncing = false }, 800)
  } else if (st.playing && !player.playing) {
    syncing = true
    seek(want)
    resume()
    setTimeout(() => { syncing = false }, 1500)
  }
  clearInterval(driftTimer)
  driftTimer = setInterval(checkDrift, 2000)
}
/** 进度差超过 0.2 秒就跳一下对齐（同一个房间里差太多会听出回声） */
const checkDrift = () => {
  if (!remote.following || !target || !player.playing || player.loading || player.song?.id != target.songId) return
  const want = (serverNow() - target.epoch) / 1000
  if (Math.abs(player.time - want) > 0.2 && want > 0 && want < player.duration - 2) {
    syncing = true
    seek(want)
    setTimeout(() => { syncing = false }, 1000)
  }
}

// ---------------- 收到别的设备的指令 ----------------
const onCmd = async(msg: any) => {
  if (msg.type == 'cmdError') {
    if (remote.pulling) remote.pulling = ''
    return toast(`对方设备不在线`, 'error')
  }
  const from = msg.from as string
  const data = msg.data ?? {}
  switch (msg.cmd) {
    case 'handoff.request':
      if (!player.song) return void send(from, 'handoff.state', { queue: [] })
      await send(from, 'handoff.state', myState())
      if (player.playing) pause()
      toast(`已把播放接力给 ${nameOf(from)}`)
      break
    case 'handoff.state':
      if (remote.pulling && remote.pulling != from) return
      remote.pulling = ''
      applyState(data, from)
      break
    case 'play.song':
      if (!data.song) return
      if (data.mode == 'next' && player.song) addNext([data.song])
      else playSong(data.song)
      toast(`${nameOf(from)} 推来了《${data.song.name}》`, 'success')
      break
    case 'together.invite':
      if (!await confirmDialog(`${nameOf(from)} 邀请你一起听`, data.song ? `正在放《${data.song.name}》- ${data.song.singer}\n两台设备会按同一个进度播放，自己切歌或暂停就会退出一起听。` : '', { okText: '一起听' })) return
      remote.following = from
      remote.followers = []
      await send(from, 'together.join', {})
      followState(data)
      break
    case 'together.join':
      if (!remote.followers.includes(from)) remote.followers.push(from)
      toast(`${nameOf(from)} 加入了一起听`, 'success')
      broadcastTogether()
      break
    case 'together.sync':
      if (remote.following == from) followState(data)
      break
    case 'together.leave':
      remote.followers = remote.followers.filter(id => id != from)
      if (!remote.followers.length) toast(`${nameOf(from)} 退出了一起听`)
      break
    case 'together.end':
      if (remote.following == from) {
        remote.following = ''
        clearInterval(driftTimer)
        toast(`${nameOf(from)} 结束了一起听`)
      }
      break
  }
}

let inited = false
export const initRemote = () => {
  if (inited) return
  inited = true
  on('sync:cmd', (msg: any) => void onCmd(msg))
  watch(() => sync.online, online => {
    if (online) {
      void refreshClock()
      scheduleNp(800)
    }
  })
  setInterval(() => { if (sync.online) void refreshClock() }, 5 * 60_000)
  // 正在播放的变化：上报给其他设备；一起听时同步给跟着的设备
  let lastSong = ''
  let lastPlaying = false
  watch(() => [player.song?.id, player.playing], () => {
    scheduleNp()
    const changed = player.song?.id != lastSong || player.playing != lastPlaying
    lastSong = player.song?.id ?? ''
    lastPlaying = player.playing
    if (!changed) return
    if (remote.followers.length) setTimeout(broadcastTogether, 600)
    // 跟着别人一起听时自己切了歌：退出一起听
    if (remote.following && !syncing && target && player.song && player.song.id != target.songId) {
      void send(remote.following, 'together.leave', {}).catch(() => {})
      remote.following = ''
      clearInterval(driftTimer)
      toast('已退出一起听')
    }
  })
  // 拖动进度：一起听的设备跟着跳
  let lastTime = 0
  watch(() => player.time, t => {
    if (Math.abs(t - lastTime) > 3 && remote.followers.length) broadcastTogether()
    if (Math.abs(t - lastTime) > 3) scheduleNp()
    lastTime = t
  })
  setInterval(() => {
    if (player.playing) reportNow()
    if (remote.followers.length && player.playing) broadcastTogether()
  }, 15_000)
}
