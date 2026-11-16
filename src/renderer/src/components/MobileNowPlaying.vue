<script setup lang="ts">
// 手机版播放页：整页玻璃（和电脑版一样的封面光 + 玻璃层），封面 ⇄ 歌词点一下切换，下滑收起
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { formatTime, qualityName, QUALITYS, sourceName, thumb } from '../api'
import { isLoved, toggleLove } from '../lists'
import { getTime, modeNames, next, player, playModes, prev, seek, setMode, setQuality, startRadio, toggle, toggleDesktopLyric } from '../player'
import { settings } from '../settings'
import { sleepLeft, sleepState } from '../sleep'
import { dislike, download } from '../songMenu'
import { sync } from '../sync'
import { go, openMenu, openSheet, pickListFor } from '../ui'
import Cover from './Cover.vue'
import Icon from './Icon.vue'
import KaraokeLine from './KaraokeLine.vue'
import Slider from './Slider.vue'

const WHITE = ['#ffffff', '#ffffff']
const view = ref<'cover' | 'lyric'>('cover')
const seeking = ref<number | null>(null)
const shownTime = computed(() => seeking.value ?? player.time)
const cur = computed(() => player.lyric[player.lyricIndex])
const nextLine = computed(() => player.lyric[player.lyricIndex + 1])

// 每秒刷新一次「定时关闭」剩余时间
const now = ref(Date.now())
const clock = setInterval(() => { if (sleepState.until && player.showNowPlaying) now.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(clock))

// ---- 歌词滚动 ----
const lyricEl = ref<HTMLElement | null>(null)
let userScrollAt = 0
const scrollToCurrent = (smooth = true) => {
  const box = lyricEl.value
  if (!box || Date.now() - userScrollAt < 3000) return
  const line = box.querySelector<HTMLElement>('.line.on') ?? box.querySelector<HTMLElement>('.line')
  if (!line) return
  box.scrollTo({ top: line.offsetTop - box.clientHeight * 0.4 + line.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' })
}
watch(() => player.lyricIndex, () => void nextTick(() => scrollToCurrent()))
watch(() => [view.value, player.showNowPlaying, player.lyric], () => {
  userScrollAt = 0
  void nextTick(() => scrollToCurrent(false))
})
const lineStyle = (i: number) => {
  const d = Math.abs(i - player.lyricIndex)
  if (!d || player.lyricIndex < 0 || Date.now() - userScrollAt < 3000) return {}
  return { opacity: String(Math.max(0.3, 0.7 - d * 0.1)) }
}

// ---- 下滑收起 ----
const dragY = ref(0)
let y0 = 0
let x0 = 0
let dragging = false
const onTouchStart = (e: TouchEvent) => {
  y0 = e.touches[0].clientY
  x0 = e.touches[0].clientX
  dragging = true
}
const onTouchMove = (e: TouchEvent) => {
  if (!dragging) return
  const dy = e.touches[0].clientY - y0
  if (dy > 0 && dy > Math.abs(e.touches[0].clientX - x0)) dragY.value = dy
}
const onTouchEnd = () => {
  dragging = false
  if (dragY.value > 120) player.showNowPlaying = false
  dragY.value = 0
}

const MODE_SHORT: Record<string, string> = { order: '顺序', loop: '循环', shuffle: '随机', single: '单曲' }
const openMode = (e: MouseEvent) => openMenu(e, playModes.map(m => ({
  label: modeNames[m] + (m == 'order' && settings.autoContinue ? '（播完续播相似歌曲）' : ''),
  icon: settings.playMode == m ? 'check' : m,
  action: () => setMode(m),
})))

const locate = () => {
  const route = player.source?.route
  player.showNowPlaying = false
  if (route) go(route.name, { ...route.params, _locate: Date.now() })
  else player.showQueue = true
}
const searchSinger = () => {
  if (!player.song) return
  player.showNowPlaying = false
  go('search', { text: player.song.singer.split(/、|&/)[0] })
}
const more = (e: MouseEvent) => {
  const song = player.song
  if (!song) return
  openMenu(e, [
    { label: '添加到歌单', icon: 'plus', action: () => pickListFor([song]) },
    { label: '下载', icon: 'download', action: () => void download([song]) },
    { label: '相似歌曲电台', icon: 'radio', action: () => void startRadio(song) },
    { label: '回到所在列表', icon: 'locate', action: locate },
    { label: `搜索歌手：${song.singer}`, icon: 'search', action: searchSinger },
    ...(song._rec || song._reason || player.radio || player.source?.type == 'daily' ? [{ label: '不喜欢这首推荐', icon: 'ban', action: () => void dislike(song) }] : []),
    { divider: true },
    ...QUALITYS.slice().reverse().map(q => ({ label: `音质：${q.name}  ${q.desc}`, icon: settings.quality == q.id ? 'check' : undefined, action: () => setQuality(q.id) })),
  ])
}
const onlineOthers = computed(() => sync.devices.filter(d => d.online && d.id != sync.deviceId).length)
</script>

<template>
  <Transition name="up">
    <div v-if="player.showNowPlaying && player.song" class="mnp" :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : {}">
      <div class="bg" :style="player.cover ? { backgroundImage: `url(${thumb(player.cover, 300)})` } : {}" />
      <div class="scrim" />
      <div class="orb a" /><div class="orb b" />
      <div class="sheet" />

      <header @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend="onTouchEnd">
        <button class="icon-btn" @click="player.showNowPlaying = false"><Icon name="down" :size="26" /></button>
        <button class="from ellipsis" @click="locate">{{ player.source ? (player.radio ? '电台 · ' : '来自 · ') + player.source.name : '正在播放' }}</button>
        <button class="icon-btn" @click="more"><Icon name="more" :size="22" /></button>
      </header>

      <div class="stage" @touchstart.passive="onTouchStart" @touchmove.passive="onTouchMove" @touchend="onTouchEnd">
        <div v-if="view == 'cover'" class="cover-view" @click="view = 'lyric'">
          <Cover class="big" :class="{ playing: player.playing }" :src="player.cover" :text="player.song.name" :size="320" :radius="26" :px="500" />
          <div class="mini-lyric">
            <div class="l1"><KaraokeLine v-if="cur" :text="cur.text" :words="cur.words" :start="cur.time" :dur="cur.dur" :active="player.showNowPlaying" :get-time="getTime" :stops="WHITE" /><span v-else class="dim">{{ player.lyricState == 'loading' ? '歌词加载中…' : player.lyric.length ? '' : '暂无歌词' }}</span></div>
            <div class="l2 ellipsis">{{ settings.showTranslation && cur?.trans ? cur.trans : nextLine?.text ?? '' }}</div>
          </div>
        </div>
        <div v-else ref="lyricEl" class="lyric" @click.self="view = 'cover'" @scroll.passive="userScrollAt = Date.now()">
          <template v-if="player.lyric.length">
            <div class="pad" @click="view = 'cover'" />
            <div v-for="(line, i) in player.lyric" :key="i" class="line" :class="{ on: i == player.lyricIndex }" :style="lineStyle(i)" @click="userScrollAt = 0; seek(line.time)">
              <KaraokeLine :text="line.text" :words="line.words" :start="line.time" :dur="line.dur" :active="i == player.lyricIndex" :get-time="getTime" :stops="WHITE" />
              <div v-if="line.trans && settings.showTranslation" class="trans">{{ line.trans }}</div>
            </div>
            <div class="pad" @click="view = 'cover'" />
          </template>
          <div v-else class="no-lyric" @click="view = 'cover'">{{ player.lyricState == 'loading' ? '歌词加载中…' : '暂无歌词，请欣赏' }}</div>
        </div>
      </div>

      <div class="info">
        <div class="t">
          <div class="name ellipsis">{{ player.song.name }}</div>
          <button class="singer ellipsis" @click="searchSinger">{{ player.song.singer }}</button>
        </div>
        <button class="icon-btn love" :class="{ on: isLoved(player.song) }" @click="toggleLove(player.song)"><Icon :name="isLoved(player.song) ? 'heart-fill' : 'heart'" :size="26" /></button>
      </div>

      <div class="progress">
        <Slider class="bar" :value="player.time" :max="player.duration" @input="seeking = $event" @change="seek($event); seeking = null" />
        <div class="times">
          <span>{{ formatTime(shownTime) }}</span>
          <span class="q">{{ player.info ? `${qualityName(player.info.quality)} · ${sourceName((player.info.song ?? player.song).source)}` : '' }}</span>
          <span>{{ formatTime(player.duration) }}</span>
        </div>
      </div>

      <div class="controls">
        <button class="icon-btn side" @click="openMode"><Icon :name="settings.playMode" :size="22" /><small>{{ MODE_SHORT[settings.playMode] }}</small></button>
        <button class="icon-btn" @click="prev"><Icon name="prev" :size="32" /></button>
        <button class="play" @click="toggle">
          <span v-if="player.loading" class="spinner light" />
          <Icon v-else :name="player.playing ? 'pause' : 'play'" :size="32" />
        </button>
        <button class="icon-btn" @click="next()"><Icon name="next" :size="32" /></button>
        <button class="icon-btn side" @click="player.showQueue = true"><Icon name="queue" :size="22" /><small>队列</small></button>
      </div>

      <div class="tools">
        <button :class="{ on: player.lyricWindow }" @click="toggleDesktopLyric"><span class="ci">词</span><small>悬浮歌词</small></button>
        <button :class="{ on: !!sleepState.until || sleepState.waitingSong }" @click="openSheet('sleep')"><Icon name="timer" :size="21" /><small>{{ sleepLeft(now) || '定时关闭' }}</small></button>
        <button :class="{ on: onlineOthers > 0 }" @click="openSheet('devices')"><Icon name="cast" :size="21" /><small>{{ onlineOthers ? `${onlineOthers} 台设备` : '设备' }}</small></button>
        <button @click="download([player.song!])"><Icon name="download" :size="21" /><small>下载</small></button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mnp {
  position: fixed; inset: 0; z-index: 60; overflow: hidden; display: flex; flex-direction: column;
  padding: var(--safe-top, 0px) 0 calc(var(--safe-bottom, 0px) + 10px);
  --text: #fff; --text2: rgba(255, 255, 255, 0.76); --text3: rgba(255, 255, 255, 0.52);
  --hover: rgba(255, 255, 255, 0.1); --card: rgba(255, 255, 255, 0.13); --border: rgba(255, 255, 255, 0.22);
  color: var(--text); background: linear-gradient(160deg, #1b2b4d, #3b2558);
  transition: transform .3s cubic-bezier(.2, .8, .2, 1);
}
.bg { position: absolute; inset: -80px; background-size: cover; background-position: center; filter: blur(58px) saturate(1.9) brightness(0.88); transform: scale(1.25); transition: background-image .6s; }
.scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8, 10, 24, 0.12), rgba(8, 10, 24, 0.38)); }
.orb { position: absolute; width: 90vw; height: 90vw; border-radius: 50%; opacity: .3; mix-blend-mode: screen; pointer-events: none; }
.orb.a { left: -30vw; top: -20vw; background: radial-gradient(circle, #46d6f0 0%, rgba(70, 214, 240, 0.45) 30%, transparent 68%); animation: drift-a 26s ease-in-out infinite alternate; }
.orb.b { right: -30vw; bottom: 10vh; background: radial-gradient(circle, #9a5cff 0%, rgba(154, 92, 255, 0.45) 30%, transparent 68%); animation: drift-b 32s ease-in-out infinite alternate; }
@keyframes drift-a { to { transform: translate(20vw, 16vw) scale(1.15); } }
@keyframes drift-b { to { transform: translate(-16vw, -12vw) scale(0.9); } }
.sheet {
  position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.16) 0, rgba(255, 255, 255, 0.04) 22%, transparent 45%),
    linear-gradient(118deg, transparent 30%, rgba(255, 255, 255, 0.09) 42%, rgba(255, 255, 255, 0.02) 52%, transparent 62%);
}
header, .stage, .info, .progress, .controls, .tools { position: relative; }
header { height: 52px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px; }
header .icon-btn { width: 44px; height: 44px; color: var(--text); }
.from { flex: 1; min-width: 0; text-align: center; font-size: 13px; color: var(--text2); }
.stage { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cover-view { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 0 28px; }
.big { width: min(78vw, 46vh) !important; height: min(78vw, 46vh) !important; box-shadow: 0 26px 70px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.14); transform: scale(0.94); transition: transform .5s ease; }
.big.playing { transform: scale(1); }
.mini-lyric { width: 100%; text-align: center; min-height: 58px; }
.l1 { font-size: 19px; font-weight: 700; line-height: 1.5; --dim: rgba(255, 255, 255, 0.42); }
.l2 { font-size: 14px; color: var(--text2); margin-top: 4px; }
.lyric { flex: 1; min-height: 0; overflow-y: auto; padding: 0 24px; mask-image: linear-gradient(180deg, transparent 0, #000 12%, #000 84%, transparent 100%); scrollbar-width: none; }
.lyric::-webkit-scrollbar { display: none; }
.pad { height: 40%; }
.line { --dim: var(--text); padding: 10px 6px; font-size: 21px; font-weight: 700; line-height: 1.5; opacity: .5; transform: scale(0.94); transform-origin: left center; transition: transform .45s cubic-bezier(.2, .9, .25, 1.1), opacity .4s; }
.line.on { --dim: rgba(255, 255, 255, 0.4); opacity: 1; transform: scale(1); }
.trans { font-size: 0.65em; font-weight: 500; color: var(--text2); margin-top: 3px; }
.no-lyric { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text3); font-size: 16px; }
.info { display: flex; align-items: center; gap: 12px; padding: 4px 26px 0; flex: none; }
.info .t { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
.name { font-size: 22px; font-weight: 700; max-width: 100%; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.25); }
.singer { font-size: 15px; color: var(--text2); max-width: 100%; margin-top: 2px; text-align: left; }
.love { width: 46px; height: 46px; color: var(--text); }
.love.on { color: #ff5d7a; }
.progress { padding: 14px 26px 0; flex: none; }
.bar :deep(.track) { background: rgba(255, 255, 255, 0.24); }
.times { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11.5px; color: var(--text3); font-variant-numeric: tabular-nums; }
.times .q { color: var(--text2); }
.controls { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px 4px; flex: none; }
.controls .icon-btn { width: 54px; height: 54px; color: var(--text); border-radius: 50%; }
.controls .side { flex-direction: column; gap: 1px; color: var(--text2); }
.controls .side small { font-size: 10px; }
.play { width: 74px; height: 74px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #1b2340; background: #fff; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); transition: transform .12s; }
.play:active { transform: scale(0.94); }
.spinner.light { width: 26px; height: 26px; border-color: rgba(30, 40, 80, 0.25); border-top-color: #1b2340; }
.tools { display: flex; justify-content: space-around; padding: 14px 18px 0; flex: none; }
.tools button { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 64px; color: var(--text2); }
.tools button.on { color: #fff; }
.tools button.on .ci, .tools button.on :deep(svg) { filter: drop-shadow(0 0 6px rgba(120, 200, 255, 0.9)); }
.tools small { font-size: 11px; }
.ci { font-size: 19px; font-weight: 800; line-height: 21px; }
.up-enter-active, .up-leave-active { transition: transform .32s cubic-bezier(.2, .8, .2, 1); }
.up-enter-from, .up-leave-to { transform: translateY(100%); }
html.win-hidden .orb, html.win-hidden .big { animation-play-state: paused !important; }
</style>
