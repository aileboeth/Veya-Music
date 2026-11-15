<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatTime, QUALITYS, qualityName } from '../api'
import { isLoved, toggleLove } from '../lists'
import { cycleMode, modeNames, next, player, prev, seek, setQuality, toggle, toggleDesktopLyric } from '../player'
import { settings } from '../settings'
import { dislike } from '../songMenu'
import { go, openMenu } from '../ui'
import Cover from './Cover.vue'
import Icon from './Icon.vue'
import Slider from './Slider.vue'

const seeking = ref<number | null>(null)
const shownTime = computed(() => seeking.value ?? player.time)
const lastVolume = ref(0.8)

const toggleMute = () => {
  if (settings.volume > 0) {
    lastVolume.value = settings.volume
    settings.volume = 0
  } else settings.volume = lastVolume.value || 0.8
}
const onWheelVolume = (e: WheelEvent) => {
  settings.volume = Math.max(0, Math.min(1, Math.round((settings.volume + (e.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100))
}

const openQualityMenu = (e: MouseEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  openMenu({ x: rect.left - 40, y: rect.top - 8 - QUALITYS.length * 36 }, QUALITYS.slice().reverse().map(q => ({
    label: `${q.name}  ${q.desc}`,
    icon: settings.quality == q.id ? 'check' : undefined,
    action: () => setQuality(q.id),
  })))
}

/** 回到这首歌所在的列表并定位到它 */
const locate = () => {
  const route = player.source?.route
  player.showNowPlaying = false
  if (route) go(route.name, { ...route.params, _locate: Date.now() })
  else player.showQueue = true
}
</script>

<template>
  <div class="player-bar">
    <div class="left">
      <template v-if="player.song">
        <button class="cover-btn" title="打开播放页" @click="player.showNowPlaying = !player.showNowPlaying">
          <Cover :src="player.cover" :text="player.song.name" :size="52" :radius="10" :px="300" />
          <span class="expand"><Icon :name="player.showNowPlaying ? 'down' : 'up'" :size="20" /></span>
        </button>
        <div class="meta">
          <div class="name ellipsis" :title="player.song.name">{{ player.song.name }}</div>
          <div class="singer ellipsis">{{ player.song.singer }}</div>
          <button v-if="player.source" class="from ellipsis" :title="player.source.route ? '回到这个列表并定位到正在播放的歌曲' : '打开播放队列'" @click="locate">
            <Icon name="locate" :size="12" />
            <span class="ellipsis">{{ player.source.name }}</span>
          </button>
        </div>
        <button class="icon-btn love" :class="{ loved: isLoved(player.song) }" :title="isLoved(player.song) ? '取消喜欢' : '喜欢'" @click="toggleLove(player.song)">
          <Icon :name="isLoved(player.song) ? 'heart-fill' : 'heart'" :size="19" />
        </button>
        <button v-if="player.song._rec || player.song._reason || player.radio || player.source?.type == 'daily'" class="icon-btn" title="不喜欢这首推荐，以后不再推荐并切到下一首" @click="dislike(player.song)">
          <Icon name="ban" :size="17" />
        </button>
      </template>
      <div v-else class="idle dim">Veya Music · 听见你的喜欢</div>
    </div>

    <div class="center">
      <div class="controls">
        <button class="icon-btn" :title="modeNames[settings.playMode]" @click="cycleMode"><Icon :name="settings.playMode" :size="18" /></button>
        <button class="icon-btn big" title="上一首 (Ctrl+←)" @click="prev"><Icon name="prev" :size="22" /></button>
        <button class="play" :title="player.playing ? '暂停 (空格)' : '播放 (空格)'" @click="toggle">
          <span v-if="player.loading" class="spinner light" />
          <Icon v-else :name="player.playing ? 'pause' : 'play'" :size="22" />
        </button>
        <button class="icon-btn big" title="下一首 (Ctrl+→)" @click="next()"><Icon name="next" :size="22" /></button>
        <button class="icon-btn" :class="{ on: player.lyricWindow }" title="桌面歌词" @click="toggleDesktopLyric"><span class="ci">词</span></button>
      </div>
      <div class="progress">
        <span class="time">{{ formatTime(shownTime) }}</span>
        <Slider class="bar" :value="player.time" :max="player.duration" :disabled="!player.song" @input="seeking = $event" @change="seek($event); seeking = null" />
        <span class="time">{{ formatTime(player.duration) }}</span>
      </div>
    </div>

    <div class="right">
      <button class="quality" :title="player.info ? `当前音质：${qualityName(player.info.quality)} · 音源：${player.info.scriptName}` : '选择音质'" @click="openQualityMenu">
        {{ qualityName(player.info?.quality ?? settings.quality) }}
      </button>
      <div class="volume" @wheel.prevent="onWheelVolume">
        <button class="icon-btn" :title="`音量 ${Math.round(settings.volume * 100)}%`" @click="toggleMute"><Icon :name="settings.volume > 0 ? 'volume' : 'mute'" :size="18" /></button>
        <Slider class="vol-bar" :value="settings.volume" :max="1" @input="settings.volume = $event" @change="settings.volume = $event" />
      </div>
      <button class="icon-btn" :class="{ on: player.showQueue }" title="播放队列" @click="player.showQueue = !player.showQueue">
        <Icon name="queue" :size="19" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.player-bar {
  height: 78px; flex: none; display: grid; grid-template-columns: minmax(220px, 1fr) minmax(360px, 1.3fr) minmax(220px, 1fr); align-items: center; gap: 16px;
  padding: 0 20px; background: var(--panel-strong); border-top: 1px solid var(--border); backdrop-filter: blur(24px); position: relative; z-index: 30;
}
.left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cover-btn { position: relative; border-radius: 10px; overflow: hidden; flex: none; box-shadow: var(--shadow-sm); }
.cover-btn .expand { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.38); color: #fff; opacity: 0; transition: opacity .15s; }
.cover-btn:hover .expand { opacity: 1; }
.meta { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.name { font-weight: 600; font-size: 14px; }
.singer { font-size: 12px; color: var(--text2); }
.from { display: flex; align-items: center; gap: 3px; max-width: 100%; font-size: 11px; color: var(--text3); width: fit-content; transition: color .15s; }
.from:hover { color: var(--accent); }
.love.loved { color: #ff4d6d; }
.idle { font-size: 13px; padding-left: 4px; }

.center { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.controls { display: flex; align-items: center; justify-content: center; gap: 10px; }
.icon-btn.big { width: 36px; height: 36px; color: var(--text); }
.play {
  width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; background: var(--grad);
  box-shadow: 0 6px 18px rgba(42, 98, 255, 0.35); transition: transform .12s, filter .15s;
}
.play:hover { transform: scale(1.06); filter: brightness(1.08); }
.play:active { transform: scale(0.96); }
.spinner.light { border-color: rgba(255, 255, 255, 0.35); border-top-color: #fff; width: 18px; height: 18px; }
.ci { font-size: 14px; font-weight: 700; line-height: 1; }
.progress { display: flex; align-items: center; gap: 10px; }
.progress .bar { flex: 1; }
.time { font-size: 11px; color: var(--text3); width: 36px; text-align: center; font-variant-numeric: tabular-nums; }

.right { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.quality { height: 22px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--border); font-size: 11px; font-weight: 700; color: var(--text2); transition: all .15s; white-space: nowrap; }
.quality:hover { color: var(--accent); border-color: var(--accent); }
.volume { display: flex; align-items: center; gap: 2px; }
.vol-bar { width: 84px; }
</style>
