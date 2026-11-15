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
import Visualizer from './Visualizer.vue'

// ---- 布局和律动效果 ----
const np = computed(() => settings.nowPlaying)
const LAYOUT_NAME: Record<string, string> = { side: '封面在左', center: '封面居中' }
const VISUAL_NAME: Record<string, string> = { ring: '环形律动', wave: '波浪音符', bars: '频谱跳动', off: '关闭律动' }
const cycle = <K extends 'layout' | 'visual'>(key: K, values: string[]) => {
  (settings.nowPlaying as any)[key] = values[(values.indexOf(settings.nowPlaying[key]) + 1) % values.length]
}
const coverSize = computed(() => np.value.layout == 'center' ? 176 : np.value.visual == 'ring' ? 270 : 300)
const ring = computed(() => np.value.visual == 'ring')

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
      <!-- 两团慢慢漂的彩色光：给玻璃面板后面一点可以「透」出来的东西 -->
      <div class="orb a" /><div class="orb b" />
      <header>
        <button class="icon-btn" title="收起" @click="player.showNowPlaying = false"><Icon name="down" :size="22" /></button>
        <button class="pill" title="切换布局：封面在左侧 / 封面居中在上" @click="cycle('layout', ['side', 'center'])">{{ LAYOUT_NAME[np.layout] }}</button>
        <button class="pill" title="切换律动效果：环形 / 波浪音符 / 频谱 / 关闭" @click="cycle('visual', ['ring', 'wave', 'bars', 'off'])">{{ VISUAL_NAME[np.visual] }}</button>
      </header>
      <!-- 波浪 / 频谱铺在页面底部 -->
      <div v-if="np.visual == 'wave' || np.visual == 'bars'" class="viz-bottom" :class="np.visual"><Visualizer :type="np.visual" :playing="player.playing" /></div>
      <div class="content" :class="['l-' + np.layout, { ring }]">
        <div class="left glass">
          <div class="cover-wrap" :style="{ width: coverSize + 'px', height: coverSize + 'px' }">
            <!-- 环形律动围着封面转 -->
            <div v-if="ring" class="viz-ring"><Visualizer type="ring" :playing="player.playing" :radius="coverSize / 2" /></div>
            <Cover class="big-cover" :class="{ playing: player.playing, round: ring }" :src="player.cover" :text="player.song.name" :size="coverSize" :radius="ring ? coverSize / 2 : 22" :px="500" />
          </div>
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
        <div class="right glass">
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
header .pill { -webkit-app-region: no-drag; height: 26px; padding: 0 12px; margin-left: 8px; border-radius: 13px; font-size: 12px; font-weight: 600; color: var(--text2); background: var(--card); border: 1px solid var(--border); transition: all .15s; }
header .pill:hover { color: var(--accent); background: var(--panel-strong); }
.viz-bottom { position: absolute; left: 0; right: 0; bottom: 0; height: 40%; pointer-events: none; mask-image: linear-gradient(180deg, transparent 0, #000 45%); }
.viz-bottom.bars { height: 26%; left: 6%; right: 6%; mask-image: none; opacity: .75; }
.cover-wrap { position: relative; margin-bottom: 22px; flex: none; }
.viz-ring { position: absolute; inset: -84px; pointer-events: none; }
.ring .cover-wrap { margin: 70px 0 84px; }
.big-cover { position: relative; box-shadow: 0 24px 60px rgba(20, 30, 70, 0.35); transition: transform .5s ease, border-radius .4s; transform: scale(0.94); }
/* 环形律动时封面变成一张慢慢转的唱片 */
.big-cover.round { animation: spin 26s linear infinite; animation-play-state: paused; transform: none; }
.big-cover.round.playing { animation-play-state: running; }
@keyframes spin { to { transform: rotate(360deg); } }
/* 封面居中：封面和歌名在上，歌词在下面居中 */
.content.l-center { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 4px; justify-items: center; padding-bottom: 12px; }
.l-center .left { justify-content: flex-start; gap: 3px; }
.l-center .cover-wrap { margin: 6px 0 12px; }
.l-center.ring .cover-wrap { margin: 62px 0 70px; }
.l-center .name { font-size: 19px; }
.l-center .album, .l-center .acts { display: none; }
.l-center .right { width: min(760px, 100%); }
.l-center .lyric { text-align: center; }
.l-center .line { transform-origin: center; font-size: 22px; padding: 8px 18px; }
.l-center .dots { justify-content: center; transform-origin: center; }
.l-center .pad { height: 34%; }
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
/* ---------- 玻璃材质 ---------- */
.bg { opacity: .82; filter: blur(60px) saturate(1.9); }
.scrim { background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 26%, transparent), color-mix(in srgb, var(--bg) 52%, transparent)); }
.orb { position: absolute; width: 46vw; height: 46vw; border-radius: 50%; filter: blur(70px); opacity: .5; pointer-events: none; }
.orb.a { left: -10vw; top: -14vw; background: radial-gradient(circle, #46d6f0 0%, transparent 68%); animation: drift-a 26s ease-in-out infinite alternate; }
.orb.b { right: -12vw; bottom: -16vw; background: radial-gradient(circle, #9a5cff 0%, transparent 68%); animation: drift-b 32s ease-in-out infinite alternate; }
@keyframes drift-a { to { transform: translate(16vw, 12vw) scale(1.15); } }
@keyframes drift-b { to { transform: translate(-18vw, -10vw) scale(0.9); } }
.glass {
  border-radius: 30px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--panel-strong) 46%, transparent), color-mix(in srgb, var(--panel-strong) 16%, transparent));
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 24px 70px rgba(20, 30, 70, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(30px) saturate(1.7);
}
:global(html[data-theme='dark'] .now .glass) { border-color: rgba(255, 255, 255, 0.12); box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.14); }
.content { gap: 22px; padding: 4px 36px 26px; }
.left.glass { padding: 26px 22px; }
.right.glass { padding: 6px 14px; overflow: hidden; }
header .pill { background: color-mix(in srgb, var(--panel-strong) 40%, transparent); border-color: rgba(255, 255, 255, 0.3); backdrop-filter: blur(20px); }
.acts .icon-btn { background: color-mix(in srgb, var(--panel-strong) 55%, transparent); border: 1px solid rgba(255, 255, 255, 0.28); }
/* 封面居中：上面的封面不要面板，只有歌词是一块玻璃 */
.l-center .left.glass { background: none; border: 0; box-shadow: none; backdrop-filter: none; padding: 0; }
.l-center .right.glass { margin-bottom: 4px; }
</style>
