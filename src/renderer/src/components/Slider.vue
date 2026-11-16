<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ value: number, max: number, buffered?: number, disabled?: boolean }>(), { buffered: 0 })
const emit = defineEmits<{ change: [value: number], input: [value: number] }>()

const el = ref<HTMLElement | null>(null)
const dragging = ref(false)
const dragValue = ref(0)
const percent = computed(() => {
  const v = dragging.value ? dragValue.value : props.value
  return props.max > 0 ? Math.max(0, Math.min(100, v / props.max * 100)) : 0
})

const valueAt = (e: PointerEvent) => {
  const rect = el.value!.getBoundingClientRect()
  return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * props.max
}
const onDown = (e: PointerEvent) => {
  if (props.disabled || !props.max) return
  dragging.value = true
  dragValue.value = valueAt(e)
  emit('input', dragValue.value)
  el.value!.setPointerCapture(e.pointerId)
}
const onMove = (e: PointerEvent) => {
  if (!dragging.value) return
  dragValue.value = valueAt(e)
  emit('input', dragValue.value)
}
const onUp = (e: PointerEvent) => {
  if (!dragging.value) return
  dragging.value = false
  emit('change', valueAt(e))
}
</script>

<template>
  <div ref="el" class="slider" :class="{ dragging, disabled }" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="dragging = false">
    <div class="track">
      <div class="fill" :style="{ width: percent + '%' }" />
    </div>
    <div class="thumb" :style="{ left: percent + '%' }" />
  </div>
</template>

<style scoped>
.slider { position: relative; height: 16px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.slider.disabled { cursor: default; opacity: .6; }
.track { width: 100%; height: 4px; border-radius: 2px; background: rgba(130, 140, 165, 0.25); overflow: hidden; transition: height .12s; }
.fill { height: 100%; background: var(--grad); border-radius: 2px; }
.thumb { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: #fff; box-shadow: 0 1px 5px rgba(20, 40, 100, 0.4); opacity: 0; transition: opacity .12s; }
.slider:hover .thumb, .slider.dragging .thumb { opacity: 1; }
.slider:hover .track, .slider.dragging .track { height: 5px; }
/* 手机：滑块一直显示，触摸范围大一些 */
:root.mobile .slider { height: 26px; }
:root.mobile .slider .thumb { opacity: 1; width: 14px; height: 14px; margin: -7px 0 0 -7px; }
</style>
