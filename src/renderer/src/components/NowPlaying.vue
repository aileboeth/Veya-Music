<script setup lang="ts">
// 全屏播放页：大封面 + 滚动歌词
import { nextTick, ref, watch } from 'vue'
import { qualityName, sourceName, thumb } from '../api'
import { isLoved, toggleLove } from '../lists'
import { player, seek, startRadio } from '../player'
import { settings } from '../settings'
import { download } from '../songMenu'
import { go, pickListFor } from '../ui'
import Cover from './Cover.vue'
import Icon from './Icon.vue'

const lyricEl = ref<HTMLElement | null>(null)
let userScrollAt = 0

const scrollToCurrent = (smooth = true) => {
  const box = lyricEl.value
  if (!box || Date.now() - userScrollAt < 2500) return
  const line = box.querySelector<HTMLElement>('.line.on') ?? box.querySelector<HTMLElement>('.line')
  if (!line) return
  box.scrollTo({ top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' })
}
watch(() => player.lyricIndex, () => void nextTick(() => scrollToCurrent()))
watch(() => [player.showNowPlaying, player.lyric], () => {
  userScrollAt = 0
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
          <div ref="lyricEl" class="lyric" @wheel.passive="userScrollAt = Date.now()">
            <template v-if="player.lyric.length">
              <div class="pad" />
              <div
                v-for="(line, i) in player.lyric" :key="i" class="line" :class="{ on: i == player.lyricIndex, near: Math.abs(i - player.lyricIndex) == 1 }"
                title="点击跳转到这一句" @click="userScrollAt = 0; seek(line.time)"
              >
                <div class="txt">{{ line.text }}</div>
                <div v-if="line.trans && settings.showTranslation" class="trans">{{ line.trans }}</div>
              </div>
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
.lyric { flex: 1; overflow-y: auto; text-align: center; mask-image: linear-gradient(180deg, transparent 0, #000 16%, #000 84%, transparent 100%); scrollbar-width: none; }
.lyric::-webkit-scrollbar { display: none; }
.pad { height: 45%; }
.line { padding: 9px 20px; border-radius: 12px; color: var(--text2); opacity: .5; font-size: 17px; line-height: 1.5; transition: all .35s ease; cursor: pointer; }
.line:hover { background: var(--hover); opacity: .85; }
.line.near { opacity: .72; }
.line.on { opacity: 1; font-size: 24px; font-weight: 700; color: var(--text); }
.line.on .txt { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; display: inline-block; }
.trans { font-size: 0.72em; margin-top: 3px; font-weight: 400; color: var(--text2); }
.no-lyric { height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text3); font-size: 16px; }
.rise-enter-active, .rise-leave-active { transition: transform .32s cubic-bezier(.2, .8, .2, 1), opacity .25s; }
.rise-enter-from, .rise-leave-to { transform: translateY(40px); opacity: 0; }
</style>
