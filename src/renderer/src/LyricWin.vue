<script setup lang="ts">
// 桌面歌词窗口：逐字填色 / 跳动、换句动画、间奏圆点、单行或双行交错
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { api, on } from './api'
import Icon from './components/Icon.vue'
import KaraokeLine from './components/KaraokeLine.vue'
import type { LyricWord } from './lyricFx'

interface Line { start: number, dur: number, words: LyricWord[] | null, text: string }
const data = reactive({
  title: '', playing: false, text: 'Veya Music', trans: '', next: '',
  pos: 0, index: -1, line: null as Line | null, nextLine: null as Line | null,
})
const conf = reactive<Record<string, any>>({ fontSize: 30, locked: false, color: 'aurora', mode: 'single', align: 'center', effect: 'fill' })
const hover = ref(false)
let hideTimer: any = null

const STOPS: Record<string, string[]> = {
  aurora: ['#45f7ea', '#4db2ff', '#7d86ff', '#c986ff'],
  white: ['#ffffff', '#ffffff'],
  gold: ['#fff0b8', '#ffc24d', '#ff9a3d'],
  pink: ['#ffb3d6', '#ff6fa8', '#c98bff'],
}
const stops = computed(() => STOPS[conf.color] ?? STOPS.aurora)

// 主窗口每隔一会儿告诉这边「现在播到第几秒」，中间自己按时钟往下走
let base = { pos: 0, at: performance.now() }
const getTime = () => data.playing ? base.pos + (performance.now() - base.at) / 1000 : base.pos
const now = ref(0)
let clock: any = null

const setConf = (patch: Record<string, any>) => {
  Object.assign(conf, patch)
  void api('lyric.setConf', patch)
}
const cycle = (key: string, values: string[]) => setConf({ [key]: values[(values.indexOf(conf[key]) + 1) % values.length] })
const MODE_NAME: Record<string, string> = { single: '单行', double: '双行' }
const ALIGN_NAME: Record<string, string> = { left: '居左', center: '居中', right: '居右' }
const EFFECT_NAME: Record<string, string> = { fill: '填色', bounce: '跳动', none: '静态' }

onMounted(async() => {
  Object.assign(conf, await api('lyric.conf'))
  on('lyric:data', (d: any) => {
    Object.assign(data, d)
    base = { pos: d.pos ?? 0, at: performance.now() }
    now.value = getTime()
  })
  on('lyric:conf', (c: any) => Object.assign(conf, c))
  clock = setInterval(() => { now.value = getTime() }, 120)
  void api('lyric.ready')
})
onBeforeUnmount(() => clearInterval(clock))

/** 间奏：这一句唱完了、离下一句还有好一会儿 → 显示三个会「充气」的圆点 */
const gap = computed(() => {
  const l = data.line
  const n = data.nextLine
  if (!l || !n) return null
  const from = l.start + l.dur + 0.4
  if (n.start - from < 6 || now.value < from || now.value >= n.start - 0.25) return null
  return { p: (now.value - from) / (n.start - 0.25 - from) }
})
const dot = (i: number) => {
  const v = Math.min(1, Math.max(0, (gap.value?.p ?? 0) * 3 - i))
  return { opacity: 0.45 + 0.55 * v, transform: `scale(${0.75 + 0.35 * v})` }
}

const hasLine = computed(() => !!data.line && data.index >= 0)
const subText = computed(() => data.trans || (gap.value ? '' : data.next))
/** 双行交错：第 n 句在上面靠左、第 n+1 句在下面靠右，轮流唱 */
const rows = computed(() => {
  const cur = { key: data.index, line: data.line, active: true }
  const nxt = { key: data.index + 1, line: data.nextLine, active: false }
  return data.index % 2 == 0 ? [cur, nxt] : [nxt, cur]
})

// 鼠标移入显示控制条（锁定时窗口鼠标穿透，但仍能收到移动事件）
const onMove = () => {
  hover.value = true
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { hover.value = false }, 1800)
}
const onLeave = () => {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => { hover.value = false }, 300)
}

// 自己实现拖动：系统拖动区域收不到鼠标事件，会导致控制条无法显示
let drag: { x: number, y: number } | null = null
let raf = 0
const onDown = (e: PointerEvent) => {
  if (conf.locked || e.button != 0 || (e.target as HTMLElement).closest('button')) return
  drag = { x: e.screenX, y: e.screenY }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  void api('lyric.dragStart')
}
const onDrag = (e: PointerEvent) => {
  if (!drag) return
  const dx = e.screenX - drag.x
  const dy = e.screenY - drag.y
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => void api('lyric.dragMove', dx, dy))
}
const onUp = () => {
  if (!drag) return
  drag = null
  void api('lyric.dragEnd')
}
</script>

<template>
  <div
    class="lyric-win" :class="[{ hover: hover && !conf.locked, locked: conf.locked, paused: !data.playing }, 'a-' + (conf.align || 'center')]"
    @mousemove="onMove" @mouseleave="onLeave" @pointerdown="onDown" @pointermove="onDrag" @pointerup="onUp" @pointercancel="onUp"
  >
    <div v-show="hover && !conf.locked" class="bar">
      <button title="上一首" @click="api('lyric.command', 'prev')"><Icon name="prev" :size="17" /></button>
      <button :title="data.playing ? '暂停' : '播放'" @click="api('lyric.command', 'toggle')"><Icon :name="data.playing ? 'pause' : 'play'" :size="17" /></button>
      <button title="下一首" @click="api('lyric.command', 'next')"><Icon name="next" :size="17" /></button>
      <i />
      <button title="缩小字号" @click="setConf({ fontSize: Math.max(18, conf.fontSize - 2) })">A-</button>
      <button title="放大字号" @click="setConf({ fontSize: Math.min(64, conf.fontSize + 2) })">A+</button>
      <i />
      <button class="txt" title="单行 / 双行交错" @click="cycle('mode', ['single', 'double'])">{{ MODE_NAME[conf.mode] ?? '单行' }}</button>
      <button class="txt" title="对齐方式" @click="cycle('align', ['center', 'left', 'right'])">{{ ALIGN_NAME[conf.align] ?? '居中' }}</button>
      <button class="txt" title="动效：逐字填色 / 逐字跳动 / 静态" @click="cycle('effect', ['fill', 'bounce', 'none'])">{{ EFFECT_NAME[conf.effect] ?? '填色' }}</button>
      <i />
      <button title="锁定（鼠标穿透）" @click="setConf({ locked: true })"><Icon name="lock" :size="16" /></button>
      <button title="关闭桌面歌词" @click="api('lyric.close')"><Icon name="close" :size="16" /></button>
    </div>
    <button
      v-show="hover && conf.locked" class="unlock" title="解锁桌面歌词"
      @mouseenter="api('lyric.hover', true)" @mouseleave="api('lyric.hover', false)" @click="setConf({ locked: false }); api('lyric.hover', false)"
    >
      <Icon name="lock" :size="15" /> 解锁
    </button>

    <div class="lines" :style="{ fontSize: conf.fontSize + 'px' }">
      <!-- 还没有歌词（或没开始唱）：显示歌名 -->
      <template v-if="!hasLine">
        <div class="row main">
          <Transition name="swap">
            <div :key="data.text || data.title" class="cell plain">{{ data.text || data.title || 'Veya Music' }}</div>
          </Transition>
        </div>
      </template>

      <!-- 间奏 -->
      <template v-else-if="gap">
        <div class="row main">
          <div class="cell dots"><i v-for="n in 3" :key="n" :style="dot(n - 1)" /></div>
        </div>
        <div v-if="data.next" class="row sub"><div class="cell plain">{{ data.next }}</div></div>
      </template>

      <!-- 双行交错 -->
      <template v-else-if="conf.mode == 'double'">
        <div v-for="(r, ri) in rows" :key="ri" class="row main" :class="[ri ? 'r-right' : 'r-left', { wait: !r.active }]">
          <Transition name="swap">
            <div v-if="r.line" :key="r.key" class="cell">
              <KaraokeLine :text="r.line.text" :words="r.line.words ?? undefined" :start="r.line.start" :dur="r.line.dur" :active="r.active" :get-time="getTime" :effect="conf.effect" :stops="stops" scroll />
            </div>
          </Transition>
        </div>
      </template>

      <!-- 单行 + 翻译 / 下一句 -->
      <template v-else>
        <div class="row main">
          <Transition name="swap">
            <div :key="data.index" class="cell">
              <KaraokeLine :text="data.line!.text" :words="data.line!.words ?? undefined" :start="data.line!.start" :dur="data.line!.dur" active :get-time="getTime" :effect="conf.effect" :stops="stops" scroll />
            </div>
          </Transition>
        </div>
        <div v-if="subText" class="row sub">
          <Transition name="fade">
            <div :key="subText" class="cell plain">{{ subText }}</div>
          </Transition>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
html, body, #app { height: 100%; margin: 0; background: transparent; overflow: hidden; }
body { font-family: 'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', sans-serif; user-select: none; }
button { font: inherit; border: 0; background: none; color: inherit; cursor: pointer; padding: 0; }
</style>

<style scoped>
.lyric-win { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 16px; transition: background .2s; cursor: move; padding: 0 20px; }
.lyric-win.hover { background: rgba(18, 20, 32, 0.5); }
.lyric-win.locked { cursor: default; }
.lines { width: 100%; text-align: center; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.5)); transition: opacity .3s; }
.paused .lines { opacity: .82; }
.a-left .lines { text-align: left; }
.a-right .lines { text-align: right; }

.row { position: relative; white-space: nowrap; }
.row.main { height: 1.5em; line-height: 1.5; font-weight: 800; letter-spacing: 1px; }
.row.sub { height: 1.5em; line-height: 1.5; font-size: 0.56em; font-weight: 600; margin-top: 2px; }
.cell { position: absolute; inset: 0; overflow: hidden; text-overflow: ellipsis; --dim: rgba(255, 255, 255, 0.62); }
.cell.plain { color: rgba(255, 255, 255, 0.9); padding: 0 4px; }
.row.sub .cell.plain { color: rgba(255, 255, 255, 0.78); }
/* 双行交错：上一行靠左、下一行靠右；还没轮到的那一行暗一点 */
.row.r-left { text-align: left; }
.row.r-right { text-align: right; }
.row.wait { opacity: .72; }
.row.wait .cell { transform: scale(0.94); }
.row.r-left .cell { transform-origin: left center; transition: transform .35s; }
.row.r-right .cell { transform-origin: right center; transition: transform .35s; }

/* 换句：新的一句从下面弹上来，旧的一句往上淡出 */
.swap-enter-active { transition: transform .5s cubic-bezier(.2, .9, .25, 1.15), opacity .32s, filter .32s; }
.swap-leave-active { transition: transform .34s ease-in, opacity .26s, filter .26s; }
.swap-enter-from { transform: translateY(62%) scale(0.9); opacity: 0; filter: blur(5px); }
.swap-leave-to { transform: translateY(-62%) scale(0.9); opacity: 0; filter: blur(5px); }
.fade-enter-active, .fade-leave-active { transition: opacity .3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.dots { display: flex; align-items: center; justify-content: center; gap: 0.36em; overflow: visible; animation: breathe 2.4s ease-in-out infinite; }
.a-left .dots { justify-content: flex-start; padding-left: 0.3em; }
.a-right .dots { justify-content: flex-end; padding-right: 0.3em; }
.dots i { width: 0.42em; height: 0.42em; border-radius: 50%; background: #fff; transition: opacity .25s, transform .25s; }
@keyframes breathe { 0%, 100% { transform: scale(0.92); } 50% { transform: scale(1.08); } }

.bar { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 3px 8px; border-radius: 16px; background: rgba(0, 0, 0, 0.45); color: #fff; cursor: default; z-index: 2; white-space: nowrap; }
.bar button { min-width: 28px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; opacity: .85; }
.bar button.txt { padding: 0 7px; }
.bar button:hover { background: rgba(255, 255, 255, 0.18); opacity: 1; }
.bar i { width: 1px; height: 14px; background: rgba(255, 255, 255, 0.25); margin: 0 4px; }
.unlock { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: 14px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 12px; z-index: 2; }
.unlock:hover { background: rgba(42, 98, 255, 0.9); }
</style>
