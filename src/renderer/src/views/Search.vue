<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api, SOURCES, type Song } from '../api'
import ListCard from '../components/ListCard.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { go } from '../ui'
import { clearSearchHistory, searchHistory } from '../history'

const props = defineProps<{ params: Record<string, any> }>()

const type = ref<'music' | 'list'>('music')
const source = ref('all')
const hot = ref<string[]>([])

interface State { list: any[], page: number, loading: boolean, done: boolean, error: string }
const states = reactive<Record<string, State>>({})
const key = computed(() => `${type.value}_${source.value}`)
const state = computed<State>(() => states[key.value] ??= { list: [], page: 0, loading: false, done: false, error: '' })

const normKey = (s: Song) => `${s.name.replace(/\s|[（(].*?[）)]/g, '').toLowerCase()}|${s.singer.split(/、|&/)[0].toLowerCase()}`

/** 多个平台的结果交错合并，同一首歌只保留最先出现的 */
const interleave = (groups: any[][], seen: Set<string>, keyOf: (item: any) => string) => {
  const out: any[] = []
  const max = Math.max(0, ...groups.map(g => g.length))
  for (let i = 0; i < max; i++) {
    for (const g of groups) {
      const item = g[i]
      if (!item) continue
      const k = keyOf(item)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(item)
    }
  }
  return out
}

const seenMap = new Map<string, Set<string>>()
const loadMore = async() => {
  const text = props.params.text
  const st = state.value
  const k = key.value
  if (!text || st.loading || st.done) return
  st.loading = true
  st.error = ''
  const page = st.page + 1
  const srcs = source.value == 'all' ? SOURCES.map(s => s.id) : [source.value]
  const method = type.value == 'music' ? 'search.music' : 'songlist.search'
  const limit = type.value == 'music' ? (source.value == 'all' ? 12 : 30) : (source.value == 'all' ? 8 : 24)
  try {
    const results = await Promise.all(srcs.map(s => api(method, s, text, page, limit).then(r => r.list as any[]).catch(() => null)))
    if (props.params.text != text) return
    const ok = results.filter(Boolean) as any[][]
    if (!ok.length) throw new Error('搜索失败，请检查网络后重试')
    let seen = seenMap.get(k)
    if (!seen || page == 1) seenMap.set(k, seen = new Set())
    const fresh = interleave(ok, seen, type.value == 'music' ? normKey : (l: any) => `${l.source}_${l.id}`)
    st.list.push(...fresh)
    st.page = page
    if (!fresh.length || ok.every(l => l.length < limit / 2)) st.done = true
  } catch (err: any) {
    st.error = err.message
  } finally {
    st.loading = false
  }
}

const reset = () => {
  for (const k of Object.keys(states)) delete states[k]
  seenMap.clear()
  void loadMore()
}
watch(() => props.params.text, reset)
watch(key, () => { if (!state.value.page) void loadMore() })
onMounted(() => {
  if (props.params.text) void loadMore()
  void api<string[]>('search.hot').then(r => { hot.value = r }).catch(() => {})
})

const queueSource = computed(() => ({ type: 'search', name: `搜索：${props.params.text}`, route: { name: 'search', params: { text: props.params.text } } }))
const onScroll = (e: Event) => {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) void loadMore()
}
</script>

<template>
  <Page @scroll.passive="onScroll">
    <template v-if="params.text">
      <h1 class="page-title">「{{ params.text }}」<small class="dim">的搜索结果</small></h1>
      <div class="row gap12 bar">
        <div class="tabs">
          <button :class="{ on: type == 'music' }" @click="type = 'music'">单曲</button>
          <button :class="{ on: type == 'list' }" @click="type = 'list'">歌单</button>
        </div>
        <div class="tabs">
          <button :class="{ on: source == 'all' }" @click="source = 'all'">全部平台</button>
          <button v-for="s in SOURCES" :key="s.id" :class="{ on: source == s.id }" @click="source = s.id">{{ s.name }}</button>
        </div>
      </div>

      <SongList v-if="type == 'music' && state.list.length" :songs="state.list" :source="queueSource" show-source :locate-key="params._locate" />
      <div v-else-if="type == 'list' && state.list.length" class="card-grid"><ListCard v-for="l in state.list" :key="l.source + l.id" :list="l" /></div>

      <div v-if="state.loading" class="center-box" :style="state.list.length ? 'padding:24px' : ''"><span class="spinner" /></div>
      <div v-else-if="state.error" class="center-box">{{ state.error }}<button class="btn" @click="loadMore">重试</button></div>
      <div v-else-if="!state.list.length && state.page" class="center-box">没有找到相关{{ type == 'music' ? '歌曲' : '歌单' }}，换个关键词试试</div>
      <div v-else-if="state.done && state.list.length > 20" class="end dim">— 没有更多了 —</div>
    </template>

    <template v-else>
      <h1 class="page-title">搜索</h1>
      <p class="muted">在上方搜索框输入歌名、歌手或歌单名，会同时搜索酷我、酷狗、QQ、网易、咪咕五个平台。</p>
      <template v-if="searchHistory.length">
        <div class="section-title">搜索历史<span class="spacer" /><a @click="clearSearchHistory">清空</a></div>
        <div class="hot"><button v-for="h in searchHistory" :key="h" class="chip" @click="go('search', { text: h })">{{ h }}</button></div>
      </template>
      <div v-if="hot.length" class="section-title">热门搜索</div>
      <div class="hot">
        <button v-for="(h, i) in hot" :key="h" class="chip" @click="go('search', { text: h })"><b v-if="i < 3" class="grad-text">{{ i + 1 }}</b>{{ h }}</button>
      </div>
    </template>
  </Page>
</template>

<style scoped>
.page-title small { font-size: 14px; font-weight: 400; margin-left: 6px; }
.bar { margin-bottom: 14px; flex-wrap: wrap; }
.end { text-align: center; padding: 22px; font-size: 12px; }
.hot { display: flex; flex-wrap: wrap; gap: 10px; }
.hot b { margin-right: 6px; }
</style>
