<script setup lang="ts">
// 定时关闭
import { onBeforeUnmount, ref, watch } from 'vue'
import { setSleep, sleepLeft, sleepState } from '../sleep'
import { sheet } from '../ui'
import Icon from './Icon.vue'
import Sheet from './Sheet.vue'

const OPTIONS = [10, 15, 20, 30, 45, 60, 90]
const now = ref(Date.now())
let t: any = null
watch(() => sheet.show == 'sleep', open => {
  clearInterval(t)
  if (open) t = setInterval(() => { now.value = Date.now() }, 1000)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(t))

const pick = async(m: number) => {
  await setSleep(m)
  sheet.show = ''
}
</script>

<template>
  <Sheet :show="sheet.show == 'sleep'" title="定时关闭" @close="sheet.show = ''">
    <div v-if="sleepState.until || sleepState.waitingSong" class="left">
      <Icon name="timer" :size="18" />
      <span>{{ sleepState.waitingSong ? '当前这首放完就停' : `还剩 ${sleepLeft(now)} 停止播放` }}</span>
      <span class="spacer" />
      <button class="btn small" @click="pick(0)">关闭定时</button>
    </div>
    <div class="grid">
      <button v-for="m in OPTIONS" :key="m" class="opt" @click="pick(m)"><b>{{ m }}</b><span>分钟</span></button>
    </div>
    <label class="after" @click="sleepState.afterSong = !sleepState.afterSong">
      <span class="switch" :class="{ on: sleepState.afterSong }" />
      <span>到时间后把当前这首放完再停</span>
    </label>
  </Sheet>
</template>

<style scoped>
.left { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 12px; border-radius: 12px; background: var(--active); color: var(--accent); font-weight: 600; font-size: 14px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.opt { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 64px; border-radius: 14px; background: var(--card); border: 1px solid var(--border); }
.opt b { font-size: 20px; }
.opt span { font-size: 11px; color: var(--text3); }
.opt:active { background: var(--active); }
.after { display: flex; align-items: center; gap: 10px; margin-top: 16px; font-size: 14px; color: var(--text2); cursor: pointer; }
</style>
