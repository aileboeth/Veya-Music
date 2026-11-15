<script setup lang="ts">
// 桌面歌词窗口
import { onMounted, reactive, ref } from 'vue'
import { api, on } from './api'
import Icon from './components/Icon.vue'

const data = reactive({ title: '', playing: false, text: 'Veya Music', trans: '', next: '' })
const conf = reactive<Record<string, any>>({ fontSize: 30, locked: false, color: 'aurora' })
const hover = ref(false)
let hideTimer: any = null

const setConf = (patch: Record<string, any>) => {
  Object.assign(conf, patch)
  void api('lyric.setConf', patch)
}

onMounted(async() => {
  Object.assign(conf, await api('lyric.conf'))
  on('lyric:data', (d: any) => Object.assign(data, d))
  on('lyric:conf', (c: any) => Object.assign(conf, c))
  void api('lyric.ready')
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
    class="lyric-win" :class="[{ hover: hover && !conf.locked, locked: conf.locked }, 'c-' + (conf.color || 'aurora')]"
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
      <div class="main"><span>{{ data.text || data.title || 'Veya Music' }}</span></div>
      <div v-if="data.trans || data.next" class="sub"><span>{{ data.trans || data.next }}</span></div>
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
.lines { width: 100%; text-align: center; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.5)); }
.main { font-weight: 800; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 1px; }
.sub { font-size: 0.58em; font-weight: 600; line-height: 1.4; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .82; }
.main span, .sub span { -webkit-background-clip: text; background-clip: text; color: transparent; padding: 0 4px; }
.c-aurora span { background-image: linear-gradient(90deg, #45f7ea, #4db2ff 38%, #7d86ff 66%, #c986ff); }
.c-white span { background-image: linear-gradient(#fff, #fff); }
.c-gold span { background-image: linear-gradient(90deg, #ffe08a, #ffb347); }
.c-pink span { background-image: linear-gradient(90deg, #ff9ecb, #ff6fa8 60%, #c98bff); }

.bar { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 2px; padding: 3px 8px; border-radius: 16px; background: rgba(0, 0, 0, 0.45); color: #fff; cursor: default; z-index: 2; }
.bar button { min-width: 28px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; opacity: .85; }
.bar button:hover { background: rgba(255, 255, 255, 0.18); opacity: 1; }
.bar i { width: 1px; height: 14px; background: rgba(255, 255, 255, 0.25); margin: 0 4px; }
.unlock { position: absolute; top: 6px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border-radius: 14px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 12px; z-index: 2; }
.unlock:hover { background: rgba(42, 98, 255, 0.9); }
</style>
