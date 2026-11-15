<script setup lang="ts">
// 在线歌单详情
import { computed, onMounted, ref } from 'vue'
import { api, sourceName, type Song } from '../api'
import Cover from '../components/Cover.vue'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { createList, lists } from '../lists'
import { enqueue, playList } from '../player'
import { settings } from '../settings'
import { download } from '../songMenu'
import { confirmDialog, go, toast } from '../ui'

const props = defineProps<{ params: Record<string, any> }>()

const songs = ref<Song[]>([])
const info = ref<any>({})
const loading = ref(true)
const error = ref('')

const name = computed(() => info.value.name || props.params.name || '歌单')
const img = computed(() => info.value.img || props.params.img)
const queueSource = computed(() => ({ type: 'online', name: name.value, route: { name: 'listdetail', params: { source: props.params.source, id: props.params.id, name: name.value, img: img.value ?? '' } } }))
const saved = computed(() => lists.find(l => l.source == props.params.source && l.sourceListId == props.params.id))

const load = async() => {
  loading.value = true
  error.value = ''
  try {
    const r = await api('songlist.detail', props.params.source, props.params.id)
    songs.value = r.list
    info.value = r.info ?? {}
  } catch (err: any) {
    error.value = err.message || '歌单加载失败'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const play = (shuffle = false) => {
  if (!songs.value.length) return
  if (shuffle) settings.playMode = 'shuffle'
  playList(songs.value, shuffle ? Math.floor(Math.random() * songs.value.length) : 0, queueSource.value)
}
const save = () => {
  if (saved.value) return go('mylist', { id: saved.value.id })
  createList(name.value, songs.value, { source: props.params.source, sourceListId: props.params.id })
  toast(`已收藏到我的歌单：${name.value}`, 'success')
}
const downloadAll = async() => {
  if (await confirmDialog(`下载全部 ${songs.value.length} 首歌曲？`, '会按「设置 → 下载」里选择的音质依次下载。')) void download(songs.value)
}
</script>

<template>
  <Page>
    <div class="list-hero">
      <Cover class="hero-cover" :src="img" :text="name" :size="170" :radius="20" :px="500" />
      <div class="hero-info">
        <div class="hero-tag">{{ sourceName(params.source) }}歌单<template v-if="info.author"> · {{ info.author }}</template><template v-if="info.play_count"> · {{ info.play_count }} 次播放</template></div>
        <h1>{{ name }}</h1>
        <div v-if="info.desc" class="hero-desc" :title="info.desc">{{ info.desc }}</div>
        <div class="hero-btns">
          <button class="btn primary" :disabled="!songs.length" @click="play()"><Icon name="play" :size="16" />播放全部</button>
          <button class="btn" :disabled="!songs.length" @click="play(true)"><Icon name="shuffle" :size="16" />随机播放</button>
          <button class="btn" :disabled="!songs.length" @click="save"><Icon :name="saved ? 'check' : 'heart'" :size="16" />{{ saved ? '已收藏 · 查看' : '收藏歌单' }}</button>
          <button class="btn" :disabled="!songs.length" title="添加到播放队列" @click="enqueue(songs)"><Icon name="queue" :size="16" /></button>
          <button class="btn" :disabled="!songs.length" title="下载全部" @click="downloadAll"><Icon name="download" :size="16" /></button>
        </div>
      </div>
    </div>
    <div v-if="loading" class="center-box"><span class="spinner" />正在加载歌单…</div>
    <div v-else-if="error" class="center-box">{{ error }}<button class="btn" @click="load">重试</button></div>
    <SongList v-else :songs="songs" :source="queueSource" :locate-key="params._locate" empty-text="这个歌单是空的" />
  </Page>
</template>
