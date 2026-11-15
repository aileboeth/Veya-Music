<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { thumb } from '../api'

const props = withDefaults(defineProps<{ src?: string | null, size?: number, radius?: number, text?: string, px?: number }>(), { size: 40, radius: 8, text: '' })
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
const url = computed(() => failed.value ? '' : thumb(props.src, props.px ?? (props.size <= 60 ? 120 : 300)))

// 没有封面时：用歌名首字 + 由文字决定的渐变色
const hue = computed(() => {
  let h = 0
  for (const c of props.text) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
})
</script>

<template>
  <div class="cover" :style="{ width: size + 'px', height: size + 'px', borderRadius: radius + 'px', '--h': hue }">
    <img v-if="url" :src="url" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failed = true" />
    <span v-else :style="{ fontSize: Math.max(12, size * 0.4) + 'px' }">{{ (text || '♪').trim().slice(0, 1) }}</span>
  </div>
</template>

<style scoped>
.cover {
  flex: none; overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, hsl(var(--h) 70% 72%), hsl(calc(var(--h) + 50) 72% 62%));
  color: rgba(255, 255, 255, 0.92); font-weight: 700;
}
img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
