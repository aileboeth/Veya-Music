<script setup lang="ts">
// 另一台设备正在放歌（而这台没在放）：提示一下，点一下就接着听
import { computed, ref } from 'vue'
import { player } from '../player'
import { pullFrom, remote } from '../remote'
import { remoteNP, sync } from '../sync'
import Icon from './Icon.vue'

const dismissed = ref('')
const item = computed(() => {
  if (player.playing || remote.following) return null
  for (const [id, np] of Object.entries(remoteNP)) {
    if (!np?.song || !np.playing) continue
    const dev = sync.devices.find(d => d.id == id && d.online)
    if (!dev) continue
    if (dismissed.value == id + np.song.id) continue
    return { id, name: dev.name || '另一台设备', np }
  }
  return null
})
</script>

<template>
  <Transition name="pop">
    <div v-if="item" class="banner">
      <Icon name="cast" :size="18" />
      <button class="t ellipsis" @click="pullFrom(item.id)"><b>{{ item.name }}</b> 正在放《{{ item.np.song.name }}》</button>
      <button class="go" :disabled="remote.pulling == item.id" @click="pullFrom(item.id)">{{ remote.pulling == item.id ? '接力中…' : '接着听' }}</button>
      <button class="x" @click="dismissed = item.id + item.np.song.id"><Icon name="close" :size="14" /></button>
    </div>
  </Transition>
</template>

<style scoped>
.banner { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 6px 0 12px; border-radius: 20px; background: var(--grad-soft); border: 1px solid var(--border); color: var(--accent); backdrop-filter: blur(20px); font-size: 13px; }
.t { flex: 1; min-width: 0; text-align: left; color: var(--text); }
.go { height: 28px; padding: 0 12px; border-radius: 14px; background: var(--grad); color: #fff; font-weight: 600; font-size: 12.5px; flex: none; }
.x { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; color: var(--text3); flex: none; }
.pop-enter-active, .pop-leave-active { transition: opacity .2s, transform .2s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(8px); }
</style>
