<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api, on, qualityName } from '../api'
import Cover from '../components/Cover.vue'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'

defineProps<{ params: Record<string, any> }>()

const tasks = ref<any[]>([])
const dir = ref('')
let off: (() => void) | null = null
onMounted(async() => {
  tasks.value = await api('dl.list')
  dir.value = await api('dl.dir')
  off = on('downloads:changed', (list: any[]) => { tasks.value = list })
})
onBeforeUnmount(() => off?.())

const statusText = (t: any) => {
  switch (t.status) {
    case 'waiting': return '等待中'
    case 'running': return t.message || (t.total ? `${Math.round(t.progress * 100)}%` : '下载中…')
    case 'done': return '已完成'
    case 'canceled': return '已取消'
    default: return t.message || '下载失败'
  }
}
const size = (n: number) => n ? `${(n / 1048576).toFixed(1)} MB` : ''
</script>

<template>
  <Page>
    <div class="row gap12">
      <h1 class="page-title">下载</h1>
      <span class="spacer" />
      <button class="btn" :title="dir" @click="api('dl.show', '')"><Icon name="folder" :size="16" />打开下载文件夹</button>
      <button class="btn" :disabled="!tasks.length" @click="api('dl.clear')">清除记录</button>
    </div>
    <div v-if="!tasks.length" class="empty">
      <Icon name="download" :size="40" />
      <div>还没有下载任务</div>
      <div>在歌曲上右键选择「下载」即可</div>
    </div>
    <div v-for="t in tasks" :key="t.id" class="task" :class="t.status">
      <Cover :src="t.song.img" :text="t.song.name" :size="44" :radius="9" />
      <div class="info">
        <div class="name ellipsis">{{ t.song.name }} <span class="dim">- {{ t.song.singer }}</span></div>
        <div class="bar"><i :style="{ width: (t.status == 'done' ? 100 : t.progress * 100) + '%' }" /></div>
        <div class="sub">
          <span class="st">{{ statusText(t) }}</span>
          <span>{{ qualityName(t.quality) }}</span>
          <span v-if="t.total">{{ size(t.total) }}</span>
        </div>
      </div>
      <button v-if="t.status == 'done'" class="icon-btn" title="在文件夹中显示" @click="api('dl.show', t.filePath)"><Icon name="folder" /></button>
      <button v-if="t.status == 'error' || t.status == 'canceled'" class="icon-btn" title="重试" @click="api('dl.retry', t.id)"><Icon name="refresh" /></button>
      <button v-if="t.status == 'running' || t.status == 'waiting'" class="icon-btn" title="取消" @click="api('dl.cancel', t.id)"><Icon name="close" /></button>
      <button v-else class="icon-btn" title="移除记录（不删除文件）" @click="api('dl.remove', t.id)"><Icon name="trash" /></button>
    </div>
  </Page>
</template>

<style scoped>
.task { display: flex; align-items: center; gap: 14px; padding: 10px 12px; border-radius: 12px; }
.task:hover { background: var(--hover); }
.info { flex: 1; min-width: 0; }
.bar { height: 3px; border-radius: 2px; background: rgba(130, 140, 165, 0.2); margin: 7px 0 5px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--grad); transition: width .3s; }
.sub { display: flex; gap: 12px; font-size: 12px; color: var(--text3); }
.task.error .st { color: var(--danger); }
.task.done .st { color: var(--cyan); }
.task.done .bar { opacity: .35; }
</style>
