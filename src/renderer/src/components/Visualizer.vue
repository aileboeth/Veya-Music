<script setup lang="ts">
// 播放页的律动效果：读真实的音频频谱来画（环形 / 波浪 + 音符 / 频谱条）
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readSpectrum } from '../player'

const props = withDefaults(defineProps<{
  type: 'ring' | 'wave' | 'bars'
  playing: boolean
  /** 环形：内圈半径（封面的半径） */
  radius?: number
  /** 窗口看不见时完全停下 */
  frozen?: boolean
}>(), { radius: 150, frozen: false })

const canvas = ref<HTMLCanvasElement | null>(null)
const BANDS = 48
const spectrum = new Uint8Array(256)
const levels = new Float32Array(BANDS)
let raf = 0
let ro: ResizeObserver | null = null
let w = 0
let h = 0
let bassAvg = 0
let lastBeat = 0
interface Note { x: number, y: number, vy: number, sway: number, life: number, glyph: string, size: number, hue: number }
const notes: Note[] = []
const GLYPHS = ['♪', '♫', '♩', '♬']

/** 用 CPU 画（willReadFrequently）：画布不大，CPU 画很轻；走显卡的话每帧新建的渐变会把显卡缓存撑到近百 MB */
const getCtx = () => canvas.value?.getContext('2d', { willReadFrequently: true }) ?? null
const resize = () => {
  const el = canvas.value
  if (!el) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  w = el.clientWidth
  h = el.clientHeight
  el.width = Math.round(w * dpr)
  el.height = Math.round(h * dpr)
  getCtx()!.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** 把 256 个频点按对数分成 48 段（低频分得细），并做一点平滑 */
const updateLevels = (t: number) => {
  const ok = props.playing && readSpectrum(spectrum)
  let sum = 0
  if (ok) for (let i = 0; i < 160; i++) sum += spectrum[i]
  for (let i = 0; i < BANDS; i++) {
    let target = 0
    if (ok && sum > 0) {
      const a = Math.floor(Math.pow(i / BANDS, 1.7) * 150) + 1
      const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / BANDS, 1.7) * 150) + 1)
      let v = 0
      for (let k = a; k < b; k++) v += spectrum[k]
      // 高频本来就弱，往上补一点，看起来更均匀
      target = Math.min(1, v / (b - a) / 255 * (0.85 + i / BANDS * 0.9))
    } else if (props.playing) {
      // 读不到音频数据时（极少数情况）：用一个平缓的假动画顶着，不至于一片死寂
      target = 0.22 + 0.16 * Math.sin(t / 420 + i * 0.55) + 0.1 * Math.sin(t / 170 + i * 1.3)
    }
    levels[i] += (target - levels[i]) * (target > levels[i] ? 0.75 : 0.26)
  }
}
const band = (from: number, to: number) => {
  let v = 0
  for (let i = from; i < to; i++) v += levels[i]
  return v / (to - from)
}

const grad = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, alpha: number) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, `rgba(54, 214, 240, ${alpha})`)
  g.addColorStop(0.5, `rgba(47, 124, 255, ${alpha})`)
  g.addColorStop(1, `rgba(150, 84, 255, ${alpha})`)
  return g
}

const drawRing = (ctx: CanvasRenderingContext2D, t: number) => {
  const cx = w / 2
  const cy = h / 2
  const bass = band(0, 6)
  const r0 = props.radius + 10 + bass * 5
  // 外圈的柔光，跟着低音一胀一缩
  const glow = ctx.createRadialGradient(cx, cy, r0 - 6, cx, cy, r0 + 44 + bass * 26)
  glow.addColorStop(0, `rgba(70, 130, 255, ${0.16 + bass * 0.2})`)
  glow.addColorStop(1, 'rgba(70, 130, 255, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r0 + 70, 0, Math.PI * 2)
  ctx.fill()
  const n = BANDS * 2
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2.4, (Math.PI * 2 * r0) / n * 0.46)
  const spin = t / 14000
  for (let i = 0; i < n; i++) {
    // 左右对称：低音在正下方，高音在正上方
    const k = i < BANDS ? i : n - 1 - i
    const len = 3 + levels[k] * 52
    const ang = Math.PI / 2 + (i + 0.5) / n * Math.PI * 2 + spin
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    ctx.strokeStyle = `hsla(${188 + k / BANDS * 92}, 92%, ${58 + levels[k] * 12}%, ${0.5 + levels[k] * 0.5})`
    ctx.beginPath()
    ctx.moveTo(cx + cos * r0, cy + sin * r0)
    ctx.lineTo(cx + cos * (r0 + len), cy + sin * (r0 + len))
    ctx.stroke()
  }
}

const drawBars = (ctx: CanvasRenderingContext2D) => {
  const n = BANDS * 2
  const gap = Math.max(2, w / n * 0.28)
  const bw = (w - gap * (n - 1)) / n
  ctx.fillStyle = grad(ctx, 0, 0, w, 0, 0.5)
  for (let i = 0; i < n; i++) {
    // 中间是低音，往两边是高音
    const k = i < BANDS ? BANDS - 1 - i : i - BANDS
    const bh = Math.max(3, levels[k] * h * 0.92)
    const x = i * (bw + gap)
    ctx.beginPath()
    ctx.roundRect(x, h - bh, bw, bh + 6, Math.min(bw / 2, 5))
    ctx.fill()
  }
}

const drawWave = (ctx: CanvasRenderingContext2D, t: number) => {
  const bass = band(0, 6)
  const mid = band(8, 24)
  const high = band(26, 44)
  const layers = [
    { amp: 14 + bass * h * 0.34, len: 1.1, speed: 2400, base: 0.62, alpha: 0.2 },
    { amp: 10 + mid * h * 0.3, len: 1.9, speed: -1700, base: 0.7, alpha: 0.16 },
    { amp: 8 + high * h * 0.3, len: 3.1, speed: 1200, base: 0.78, alpha: 0.13 },
  ]
  const yAt = (l: typeof layers[number], x: number) => h * l.base - l.amp * (0.62 * Math.sin(x / w * Math.PI * 2 * l.len + t / l.speed) + 0.38 * Math.sin(x / w * Math.PI * 2 * l.len * 2.3 - t / l.speed * 1.6))
  for (const l of layers) {
    ctx.fillStyle = grad(ctx, 0, 0, w, 0, l.alpha)
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, yAt(l, x))
    ctx.lineTo(w, yAt(l, w))
    ctx.lineTo(w, h)
    ctx.fill()
  }
  // 踩到鼓点时，从浪尖上冒出一个音符往上飘
  bassAvg += (bass - bassAvg) * 0.08
  if (props.playing && bass > 0.3 && bass > bassAvg * 1.22 && t - lastBeat > 320 && notes.length < 26) {
    lastBeat = t
    const x = w * (0.06 + Math.random() * 0.88)
    notes.push({ x, y: yAt(layers[0], x), vy: 0.5 + Math.random() * 0.7 + bass, sway: Math.random() * Math.PI * 2, life: 1, glyph: GLYPHS[Math.floor(Math.random() * GLYPHS.length)], size: 16 + Math.random() * 14, hue: 190 + Math.random() * 90 })
  }
  ctx.textAlign = 'center'
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]
    n.y -= n.vy * 2
    n.life -= 0.017
    n.sway += 0.09
    if (n.life <= 0 || n.y < -20) { notes.splice(i, 1); continue }
    ctx.font = `${n.size}px 'Segoe UI Symbol', sans-serif`
    ctx.fillStyle = `hsla(${n.hue}, 90%, 62%, ${Math.min(1, n.life * 1.6) * 0.75})`
    ctx.fillText(n.glyph, n.x + Math.sin(n.sway) * 9, n.y)
  }
}

let idleFrames = 0
let lastDraw = 0
const frame = (t: number) => {
  raf = 0
  // 每秒画 30 次就够顺了（上面的平滑系数、音符速度都是按 30 次调的），比跟着屏幕刷新率画省一半
  if (t - lastDraw < 30) { raf = requestAnimationFrame(frame); return }
  lastDraw = t
  const ctx = getCtx()
  if (ctx && w && h) {
    updateLevels(t)
    ctx.clearRect(0, 0, w, h)
    if (props.type == 'ring') drawRing(ctx, t)
    else if (props.type == 'bars') drawBars(ctx)
    else drawWave(ctx, t)
  }
  // 暂停后等画面落回静止（约 1.5 秒）就不再画了，继续播放时再启动
  idleFrames = props.playing ? 0 : idleFrames + 1
  if (!props.frozen && (props.playing || idleFrames < 45 || notes.length)) raf = requestAnimationFrame(frame)
}
const start = () => {
  idleFrames = 0
  if (!raf && !props.frozen) raf = requestAnimationFrame(frame)
}

onMounted(() => {
  resize()
  ro = new ResizeObserver(() => { resize(); start() })
  if (canvas.value) ro.observe(canvas.value)
  start()
})
watch(() => props.type, () => { notes.length = 0; start() })
watch(() => [props.playing, props.frozen], start)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="viz" />
</template>

<style scoped>
.viz { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
</style>
