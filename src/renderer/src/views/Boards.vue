<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api, SOURCES, type Song } from '../api'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { playList } from '../player'

const props = defineProps<{ params: Record<string, any> }>()

const source = ref<string>(props.params.source ?? 'wy')
const boards = ref<Array<{ id: string, name: string }>>([])
const boardId = ref<string>(props.params.id ?? '')
const songs = ref<Song[]>([])
const loading = ref(false)
const error = ref('')

const board = computed(() => boards.value.find(b => b.id == boardId.value))
const title = computed(() => `${SOURCES.find(s => s.id == source.value)?.name ?? ''} · ${board.value?.name ?? '排行榜'}`)
const queueSource = computed(() => ({ type: 'board', name: title.value, route: { name: 'boards', params: { source: source.value, id: boardId.value } } }))

let token = 0
const loadSongs = async() => {
  if (!boardId.value) return
  const tk = ++token
  loading.value = true
  error.value = ''
  songs.value = []
  try {
    const r = await api('board.detail', boardId.value)
    if (tk == token) songs.value = r.list
  } catch (err: any) {
    if (tk == token) error.value = err.message || '榜单加载失败'
  } finally {
    if (tk == token) loading.value = false
  }
}
const loadBoards = async(keepId = false) => {
  const src = source.value
  boards.value = []
  try {
    const list = await api('board.list', src)
    if (src != source.value) return
    boards.value = list
    if (!keepId || !list.some((b: any) => b.id == boardId.value)) boardId.value = list[0]?.id ?? ''
    else void loadSongs()
  } catch (err: any) {
    error.value = err.message || '榜单加载失败'
  }
}
onMounted(() => loadBoards(!!props.params.id))
watch(source, () => loadBoards())
watch(boardId, loadSongs)
</script>

<template>
  <div class="boards-view">
    <div class="side">
      <div class="tabs src">
        <button v-for="s in SOURCES" :key="s.id" :class="{ on: source == s.id }" @click="source = s.id">{{ s.name }}</button>
      </div>
      <div class="b-list">
        <button v-for="b in boards" :key="b.id" class="b-item ellipsis" :class="{ on: b.id == boardId }" @click="boardId = b.id">{{ b.name }}</button>
      </div>
    </div>
    <Page class="main">
      <div class="head">
        <h1 class="page-title">{{ board?.name ?? '排行榜' }}</h1>
        <button class="btn primary" :disabled="!songs.length" @click="playList(songs, 0, queueSource)"><Icon name="play" :size="16" />播放全部</button>
      </div>
      <div v-if="loading" class="center-box"><span class="spinner" /></div>
      <div v-else-if="error" class="center-box">{{ error }}<button class="btn" @click="loadSongs">重试</button></div>
      <SongList v-else :songs="songs" :source="queueSource" :locate-key="params._locate" empty-text="榜单暂时没有数据" />
    </Page>
  </div>
</template>

<style scoped>
.boards-view { height: 100%; display: flex; min-height: 0; }
.side { width: 196px; flex: none; display: flex; flex-direction: column; padding: 8px 0 12px 20px; min-height: 0; }
.tabs.src { flex-wrap: wrap; width: 100%; }
.tabs.src button { padding: 0 9px; flex: 1; }
.b-list { flex: 1; overflow-y: auto; margin-top: 12px; display: flex; flex-direction: column; gap: 2px; padding-right: 4px; }
.b-item { height: 34px; flex: none; padding: 0 12px; border-radius: 9px; text-align: left; color: var(--text2); font-size: 13px; }
.b-item:hover { background: var(--hover); color: var(--text); }
.b-item.on { background: var(--active); color: var(--accent); font-weight: 600; }
.main { flex: 1; min-width: 0; padding-left: 20px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
</style>
