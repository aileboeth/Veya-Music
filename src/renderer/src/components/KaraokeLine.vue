<script setup lang="ts">
// 一句会动的歌词：唱到哪个字，哪个字就被填上颜色并轻轻抬起（或跳一下）
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { makeUnits, mixStops, type LyricWord } from '../lyricFx'

const props = withDefaults(defineProps<{
  text: string
  words?: LyricWord[]
  /** 这一句开始的时间（秒）和唱完需要的时间 */
  start: number
  dur: number
  /** 正在唱这一句 */
  active: boolean
  /** 当前播放时间（秒），每一帧调用 */
  getTime: () => number
  /** fill = 逐字填色并抬起；bounce = 逐字跳动；none = 不动 */
  effect?: 'fill' | 'bounce' | 'none'
  /** 唱过的部分用的渐变色 */
  stops?: string[]
  /** 单行显示：太长时跟着进度横向滚动 */
  scroll?: boolean
}>(), { effect: 'fill', stops: () => ['#1f9bff', '#8a46fb'], scroll: false })

const root = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const units = computed(() => makeUnits(props.text, props.words, props.dur))
const colors = computed(() => units.value.map((_, i) => mixStops(props.stops, (i + 0.5) / units.value.length)))

let raf = 0
let frame = 0
let overflow = 0
const clamp = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v
const easeOut = (p: number) => 1 - (1 - p) * (1 - p)

const els = () => inner.value ? Array.from(inner.value.children) as HTMLElement[] : []
const paint = (el: HTMLElement, p: number, y: number, scale: number) => {
  const key = `${p.toFixed(3)}|${y.toFixed(3)}|${scale.toFixed(3)}`
  if (el.dataset.k == key) return
  el.dataset.k = key
  el.style.setProperty('--p', p.toFixed(3))
  el.style.transform = y > 0.001 || Math.abs(scale - 1) > 0.001 ?`translateY(${(-y).toFixed(3)}em) scale(${scale.toFixed(3)})` : ''
}
const setAll = (p: number) => { for (const el of els()) paint(el, p, 0, 1) }

const tick = () => {
  raf = requestAnimationFrame(tick)
  const t = props.getTime() - props.start
  const list = els()
  const us = units.value
  for (let i = 0; i < list.length && i < us.length; i++) {
    const u = us[i]
    const p = clamp((t - u.t) / u.d)
    let y = 0
    let scale = 1
    if (props.effect == 'bounce') {
      // 每个字开唱时跳一下再落回去
      const b = clamp((t - u.t) / Math.min(0.42, Math.max(0.24, u.d)))
      const hop = Math.sin(Math.PI * b)
      y = 0.2 * hop
      scale = 1 + 0.1 * hop
    } else {
      // 唱过的字保持微微抬起；拖长音的字唱的时候会稍微鼓起来
      y = 0.07 * easeOut(p)
      if (u.d >= 0.9) scale = 1 + 0.07 * Math.sin(Math.PI * p)
    }
    paint(list[i], p, y, scale)
  }
  if (props.scroll && root.value && inner.value) {
    if (frame++ % 20 == 0) overflow = Math.max(0, inner.value.scrollWidth - root.value.clientWidth)
    const g = clamp((t / Math.max(0.3, props.dur) - 0.12) / 0.76)
    inner.value.style.marginLeft = overflow ? `${(-overflow * g).toFixed(1)}px` : ''
  }
}

const sync = () => {
  cancelAnimationFrame(raf)
  frame = 0
  if (props.active && props.effect != 'none') tick()
  else {
    setAll(props.active ? 1 : 0)
    if (inner.value) inner.value.style.marginLeft = ''
  }
}
onMounted(sync)
watch(() => [props.active, props.effect], sync)
watch(units, () => void nextTick(sync))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span ref="root" class="kl" :class="{ scroll, live: active && effect != 'none' }">
    <span ref="inner" class="in"><span v-for="(u, i) in units" :key="i" class="u" :style="{ '--c': colors[i] }">{{ u.s }}</span></span>
  </span>
</template>

<style scoped>
.kl.scroll { display: block; overflow: hidden; white-space: nowrap; }
.kl.scroll .in { display: inline-block; padding: 0 4px; }
.u {
  --p: 0;
  display: inline-block; white-space: pre; transform-origin: 50% 85%;
  background-image: linear-gradient(90deg, var(--c) calc(var(--p) * 124% - 24%), var(--dim, rgba(255, 255, 255, 0.6)) calc(var(--p) * 124%));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
/* 只有正在唱的这一句需要独立图层；每个字都常驻一个图层的话，一首歌要多占几百个显卡图层 */
.kl.live .u { will-change: transform; }
</style>
