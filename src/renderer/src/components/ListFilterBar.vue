<script setup lang="ts">
// 歌单筛选条：排序（默认 / 播放最多 / 收藏最多）+ 最少播放量
import { PLAY_STEPS, type ListFilter } from '../listFilter'

const props = defineProps<{ filter: ListFilter, shown?: number, total?: number }>()
const f = props.filter
</script>

<template>
  <div class="list-filter">
    <div class="tabs">
      <button :class="{ on: f.sort == 'default' }" @click="f.sort = 'default'">默认</button>
      <button :class="{ on: f.sort == 'play' }" @click="f.sort = 'play'">播放最多</button>
      <button :class="{ on: f.sort == 'collect' }" title="没有收藏数的平台（QQ 音乐等）按播放量排在后面" @click="f.sort = 'collect'">收藏最多</button>
    </div>
    <div class="steps">
      <span class="lbl">播放量</span>
      <button v-for="s in PLAY_STEPS" :key="s.v" class="chip" :class="{ on: f.minPlay == s.v }" @click="f.minPlay = s.v">{{ s.name }}</button>
    </div>
    <span v-if="f.minPlay && total" class="hint">已加载 {{ total }} 个，显示 {{ shown }} 个</span>
  </div>
</template>

<style scoped>
.list-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 16px; }
.steps { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.lbl { flex: none; white-space: nowrap; font-size: 12.5px; color: var(--text3); margin-right: 2px; }
.steps .chip { height: 28px; padding: 0 11px; font-size: 12.5px; }
.hint { font-size: 12px; color: var(--text3); }
/* 手机：播放量那排不折行，放不下就左右滑 */
:root.mobile .steps { flex-wrap: nowrap; overflow-x: auto; max-width: 100%; scrollbar-width: none; }
:root.mobile .steps .chip { flex: none; }
</style>
