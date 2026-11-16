<script setup lang="ts">
// 手机版底部的迷你播放条：点一下打开播放页，左右滑切歌
import { computed, ref } from 'vue'
import { next, player, prev, toggle } from '../player'
import Cover from './Cover.vue'
import Icon from './Icon.vue'

const progress = computed(() => player.duration > 0 ? Math.min(1, player.time / player.duration) : 0)
const C = 2 * Math.PI * 17
const line = computed(() => player.lyric[player.lyricIndex]?.text ?? '')

let x0 = 0
let y0 = 0
const dx = ref(0)
const onStart = (e: TouchEvent) => {
  x0 = e.touches[0].clientX
  y0 = e.touches[0].clientY
  dx.value = 0
}
const onMove = (e: TouchEvent) => {
  const d = e.touches[0].clientX - x0
  if (Math.abs(d) > Math.abs(e.touches[0].clientY - y0)) dx.value = d
}
const onEnd = () => {
  if (dx.value < -70) void next()
  else if (dx.value > 70) prev()
  dx.value = 0
}
</script>

<template>
  <div v-if="player.song" class="mini" @touchstart.passive="onStart" @touchmove.passive="onMove" @touchend="onEnd" @click="player.showNowPlaying = true">
    <div class="inner" :style="{ transform: dx ? `translateX(${dx * 0.5}px)` : '', opacity: dx ? Math.max(0.4, 1 - Math.abs(dx) / 220) : 1 }">
      <Cover class="cv" :class="{ spin: player.playing }" :src="player.cover" :text="player.song.name" :size="42" :radius="21" />
      <div class="meta">
        <div class="name ellipsis">{{ player.song.name }} <span class="singer">- {{ player.song.singer }}</span></div>
        <div class="sub ellipsis">{{ line || (player.loading ? '加载中…' : player.source?.name ?? '') }}</div>
      </div>
    </div>
    <button class="play" @click.stop="toggle">
      <svg viewBox="0 0 40 40" class="ring"><circle cx="20" cy="20" r="17" class="track" /><circle cx="20" cy="20" r="17" class="bar" :style="{ strokeDasharray: C, strokeDashoffset: C * (1 - progress) }" /></svg>
      <span v-if="player.loading" class="spinner" />
      <Icon v-else :name="player.playing ? 'pause' : 'play'" :size="18" />
    </button>
    <button class="icon-btn q" @click.stop="player.showQueue = true"><Icon name="queue" :size="22" /></button>
  </div>
</template>

<style scoped>
.mini { position: relative; height: 60px; flex: none; display: flex; align-items: center; gap: 8px; margin: 0 10px 6px; padding: 0 6px 0 9px; border-radius: 20px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: 0 8px 26px rgba(30, 50, 110, 0.16); backdrop-filter: blur(24px); }
.inner { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; transition: transform .15s, opacity .15s; }
.cv { box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18); }
.cv.spin { animation: spin 18s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.meta { min-width: 0; flex: 1; }
.name { font-size: 14.5px; font-weight: 600; }
.singer { font-weight: 400; font-size: 12.5px; color: var(--text2); }
.sub { font-size: 12px; color: var(--text3); margin-top: 2px; }
.play { position: relative; width: 40px; height: 40px; flex: none; display: flex; align-items: center; justify-content: center; color: var(--accent); }
.ring { position: absolute; inset: 0; transform: rotate(-90deg); }
.ring circle { fill: none; stroke-width: 2.6; }
.ring .track { stroke: var(--border); }
.ring .bar { stroke: var(--accent); stroke-linecap: round; transition: stroke-dashoffset .3s linear; }
.spinner { width: 16px; height: 16px; border-width: 2px; }
.q { width: 40px; height: 40px; color: var(--text); }
</style>
