<script setup lang="ts">
// 全屏播放页：大封面 + 滚动歌词（逐字填色、远处的句子虚化、间奏圆点）
import { computed, nextTick, ref, watch } from 'vue'
import { qualityName, sourceName, thumb } from '../api'
import { isLoved, toggleLove } from '../lists'
import { getTime, player, seek, startRadio } from '../player'
import { settings } from '../settings'
import { download } from '../songMenu'
import { go, pickListFor } from '../ui'
import Cover from './Cover.vue'
import Icon from './Icon.vue'
import KaraokeLine from './KaraokeLine.vue'

const lyricEl = ref<HTMLElement | null>(null)
let userScrollAt = 0
/** 用户正在自己翻歌词：先别虚化，方便看 */
const browsing = ref(false)
let browseTimer: any = null
const onWheel = () => {
  userScrollAt = Date.now()
  browsing.value = true
  clearTimeout(browseTimer)
  browseTimer = setTimeout(() => { browsing.value = false }, 2600)
}

/** 间奏（前奏）超过 7 秒的地方插一行圆点：key = 它后面那一句的序号 */
const gaps = computed(() => {
  const map = new Map<number, { from: number, to: number }>()
  const lines = player.lyric
  lines.forEach((l, i) => {
    const from = i ? lines[i - 1].time + lines[i - 1].dur : 0
    if (l.time - from >= 7) map.set(i, { from, to: l.time })
  })
  return map
})
const gapOn = (i: number) => {
  const g = gaps.value.get(i)
  return !!g && player.time >= g.from + 0.3 && player.time < g.to - 0.2
}
const dot = (i: number, n: number) => {
  const g = gaps.value.get(i)!
  const v = Math.min(1, Math.max(0, (player.time - g.from) / (g.to - g.from) * 3 - n))
  return { opacity: 0.25 + 0.75 * v, transform: `scale(${0.8 + 0.3 * v})` }
}
/** 离正在唱的那一句越远越虚 */
const lineStyle = (i: number) => {
  const d = Math.abs(i - player.lyricIndex)
  if (!d || browsing.value || player.lyricIndex < 0) return {}
  return { filter: `blur(${Math.min(3.2, d * 0.7).toFixed(1)}px)`, opacity: String(Math.max(0.22, 0.62 - d * 0.1)) }
}

const scrollToCurrent = (smooth = true) => {
  const box = lyricEl.value
  if (!box || Date.now() - userScrollAt < 2500) return
  const line = box.querySelector<HTMLElement>('.gap.on') ?? box.querySelector<HTMLElement>('.line.on') ?? box.querySelector<HTMLElement>('.line')
  if (!line) return
  box.scrollTo({ top: line.offsetTop - box.clientHeight * 0.42 + line.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' })
}
watch(() => player.lyricIndex, () => void nextTick(() => scrollToCurrent()))
watch(() => [player.showNowPlaying, player.lyric], () => {
  userScrollAt = 0
  browsing.value = false
  void nextTick(() => scrollToCurrent(false))
})

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
</script>

<template>
  <Transition name="rise">
    <div v-if="player.showNowPlaying && player.song" class="now">
      <div class="bg" :style="player.cover ? { backgroundImage: `url(${thumb(player.cover, 300)})` } : {}" />
      <div class="scrim" />
      <header>
        <button class="icon-btn" title="收起" @click="player.showNowPlaying = false"><Icon name="down" :size="22" /></button>
      </header>
      <div class="content">
        <div class="left">
          <Cover class="big-cover" :class="{ playing: player.playing }" :src="player.cover" :text="player.song.name" :size="300" :radius="22" :px="500" />
          <div class="name">{{ player.song.name }}</div>
          <button class="singer" title="搜索这位歌手" @click="searchSinger">{{ player.song.singer }}</button>
          <div class="album dim ellipsis">
            <span v-if="player.song.albumName">{{ player.song.albumName }} · </span>{{ sourceName((player.info?.song ?? player.song).source) }}
            <span v-if="player.info"> · {{ qualityName(player.info.quality) }}</span>
          </div>
          <div class="acts">
            <button class="icon-btn" :class="{ loved: isLoved(player.song) }" title="喜欢" @click="toggleLove(player.song)"><Icon :name="isLoved(player.song) ? 'heart-fill' : 'heart'" :size="21" /></button>
            <button class="icon-btn" title="添加到歌单" @click="pickListFor([player.song])"><Icon name="plus" :size="21" /></button>
            <button class="icon-btn" title="下载" @click="download([player.song])"><Icon name="download" :size="21" /></button>
            <button class="icon-btn" title="相似歌曲电台" @click="startRadio(player.song)"><Icon name="radio" :size="21" /></button>
            <button class="icon-btn" title="定位：回到这首歌所在的列表" @click="locate"><Icon name="locate" :size="21" /></button>
          </div>
        </div>
        <div class="right">
          <div ref="lyricEl" class="lyric" :class="{ browsing }" @wheel.passive="onWheel">
            <template v-if="player.lyric.length">
              <div class="pad" />
              <template v-for="(line, i) in player.lyric" :key="i">
                <div v-if="gaps.has(i)" class="gap" :class="{ on: gapOn(i) }">
                  <div class="dots"><i v-for="n in 3" :key="n" :style="gapOn(i) ? dot(i, n - 1) : {}" /></div>
                </div>
                <div
                  class="line" :class="{ on: i == player.lyricIndex, past: i < player.lyricIndex }" :style="lineStyle(i)"
                  title="点击跳转到这一句" @click="userScrollAt = 0; browsing = false; seek(line.time)"
                >
                  <div class="txt">
                    <KaraokeLine :text="line.text" :words="line.words" :start="line.time" :dur="line.dur" :active="i == player.lyricIndex" :get-time="getTime" />
                  </div>
                  <div v-if="line.trans && settings.showTranslation" class="trans">{{ line.trans }}</div>
                </div>
              </template>
              <div class="pad" />
            </template>
            <div v-else class="no-lyric">{{ player.lyricState == 'loading' ? '歌词加载中…' : '暂无歌词，请欣赏' }}</div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.now { position: absolute; inset: 0 0 78px 0; z-index: 20; overflow: hidden; background: var(--bg); display: flex; flex-direction: column; }
.bg { position: absolute; inset: -80px; background-size: cover; background-position: center; filter: blur(70px) saturate(1.5); opacity: .55; transform: scale(1.2); transition: background-image .6s; }
.scrim { position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 50%, transparent), color-mix(in srgb, var(--bg) 78%, transparent)); }
header { position: relative; height: 44px; display: flex; align-items: center; padding: 0 14px; -webkit-app-region: drag; flex: none; }
header .icon-btn { -webkit-app-region: no-drag; }
.content { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(340px, 0.9fr) minmax(0, 1.1fr); gap: 20px; padding: 0 48px 24px; }
.left { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-width: 0; text-align: center; }
.big-cover { box-shadow: 0 24px 60px rgba(20, 30, 70, 0.35); margin-bottom: 22px; transition: transform .5s ease; transform: scale(0.94); }
.big-cover.playing { transform: scale(1); }
.name { font-size: 22px; font-weight: 700; max-width: 100%; user-select: text; }
.singer { font-size: 15px; color: var(--text2); }
.singer:hover { color: var(--accent); }
.album { font-size: 12px; max-width: 90%; }
.acts { display: flex; gap: 10px; margin-top: 16px; }
.acts .icon-btn { width: 40px; height: 40px; border-radius: 50%; background: var(--card); color: var(--text); }
.acts .icon-btn:hover { background: var(--panel-strong); color: var(--accent); }
.acts .loved { color: #ff4d6d; }
.right { min-width: 0; min-height: 0; display: flex; }
.lyric { flex: 1; overflow-y: auto; text-align: left; padding: 0 12px 0 8px; mask-image: linear-gradient(180deg, transparent 0, #000 14%, #000 82%, transparent 100%); scrollbar-width: none; }
.lyric::-webkit-scrollbar { display: none; }
.pad { height: 42%; }
.line {
  --dim: var(--text); padding: 11px 18px; border-radius: 14px; font-size: 25px; font-weight: 700; line-height: 1.45; cursor: pointer;
  opacity: .5; transform: scale(0.9); transform-origin: left center;
  transition: transform .55s cubic-bezier(.2, .9, .25, 1.1), opacity .45s, filter .45s, background .2s;
}
.line:hover { background: var(--hover); }
.lyric.browsing .line:not(.on) { opacity: .7; }
.line.on { --dim: color-mix(in srgb, var(--text) 38%, transparent); opacity: 1; transform: scale(1); }
.trans { font-size: 0.6em; margin-top: 4px; font-weight: 500; color: var(--text2); line-height: 1.5; }
.line.on .trans { color: var(--text); opacity: .8; }
/* 间奏圆点：轮到的时候展开，过了就收起来 */
.gap { height: 0; opacity: 0; overflow: hidden; padding: 0 18px; transition: height .5s cubic-bezier(.2, .9, .25, 1), opacity .4s; }
.gap.on { height: 56px; opacity: 1; }
.dots { display: flex; align-items: center; gap: 9px; height: 56px; animation: breathe 2.4s ease-in-out infinite; transform-origin: 30px center; }
.dots i { width: 11px; height: 11px; border-radius: 50%; background: var(--text); opacity: .25; transition: opacity .3s, transform .3s; }
@keyframes breathe { 0%, 100% { transform: scale(0.94); } 50% { transform: scale(1.08); } }
.no-lyric { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text3); font-size: 16px; }
.rise-enter-active, .rise-leave-active { transition: transform .32s cubic-bezier(.2, .8, .2, 1), opacity .25s; }
.rise-enter-from, .rise-leave-to { transform: translateY(40px); opacity: 0; }
</style>
