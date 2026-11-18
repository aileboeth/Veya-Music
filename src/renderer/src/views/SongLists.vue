<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api, SOURCES } from '../api'
import Icon from '../components/Icon.vue'
import ListCard from '../components/ListCard.vue'
import ListFilterBar from '../components/ListFilterBar.vue'
import Page from '../components/Page.vue'
import { applyListFilter, isFiltering, newListFilter } from '../listFilter'
import { go, openImport, promptDialog, toast } from '../ui'

defineProps<{ params: Record<string, any> }>()

const source = ref('wy')
const meta = ref<{ sortList: any[], tags: any[], hotTag: any[] }>({ sortList: [], tags: [], hotTag: [] })
const sortId = ref<any>(null)
const tag = ref<{ id: any, name: string } | null>(null)
const showAllTags = ref(false)
const state = reactive({ list: [] as any[], page: 0, loading: false, done: false, error: '' })
let loadToken = 0

const loadMore = async() => {
  if (state.loading || state.done) return
  const tk = loadToken
  state.loading = true
  state.error = ''
  try {
    const r = await api('songlist.lists', source.value, sortId.value, tag.value?.id ?? null, state.page + 1)
    if (tk != loadToken) return
    const ids = new Set(state.list.map(l => l.id))
    const fresh = (r.list as any[]).filter(l => !ids.has(l.id))
    state.list.push(...fresh)
    state.page++
    if (!fresh.length || (r.total && state.list.length >= r.total)) state.done = true
  } catch (err: any) {
    if (tk == loadToken) state.error = err.message
  } finally {
    if (tk == loadToken) state.loading = false
  }
}
const reload = () => {
  loadToken++
  Object.assign(state, { list: [], page: 0, loading: false, done: false, error: '' })
  void loadMore()
}
const loadMeta = async() => {
  const src = source.value
  meta.value = { sortList: [], tags: [], hotTag: [] }
  sortId.value = null
  tag.value = null
  showAllTags.value = false
  reload()
  const m = await api('songlist.meta', src).catch(() => null)
  if (m && src == source.value) {
    meta.value = m
    sortId.value ??= m.sortList[0]?.id ?? null
  }
}
onMounted(loadMeta)
watch(source, loadMeta)
const setSort = (id: any) => { if (sortId.value != id) { sortId.value = id; reload() } }
const setTag = (t: { id: any, name: string } | null) => {
  if (tag.value?.id == t?.id) return
  tag.value = t
  showAllTags.value = false
  reload()
}

// 排序 / 筛选只作用于已经加载的歌单；筛掉太多时自动多加载几页（每次改条件最多 8 页）
const filter = newListFilter()
const shown = computed(() => applyListFilter(state.list, filter))
let autoPages = 0
watch(() => [filter.sort, filter.minPlay], () => { autoPages = 0; fillUp() })
const fillUp = () => {
  if (!isFiltering(filter) || state.loading || state.done || state.error || shown.value.length >= 24 || autoPages >= 8) return
  autoPages++
  void loadMore().then(() => setTimeout(fillUp, 50))
}
watch(() => state.list.length, () => { if (filter.minPlay) setTimeout(fillUp, 50) })

const onScroll = (e: Event) => {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) void loadMore()
}

/** 通过歌单链接或 ID 打开歌单 */
const openByLink = async() => {
  const input = await promptDialog(`打开${SOURCES.find(s => s.id == source.value)!.name}歌单`, '', '粘贴歌单分享链接或歌单 ID')
  if (!input) return
  toast('正在打开歌单…')
  go('listdetail', { source: source.value, id: input.trim(), name: '', img: '' })
}
</script>

<template>
  <Page @scroll.passive="onScroll">
    <h1 class="page-title">歌单广场</h1>
    <div class="row gap12 bar">
      <div class="tabs">
        <button v-for="s in SOURCES" :key="s.id" :class="{ on: source == s.id }" @click="source = s.id">{{ s.name }}</button>
      </div>
      <div v-if="meta.sortList.length > 1" class="tabs">
        <button v-for="s in meta.sortList" :key="s.id" :class="{ on: sortId == s.id }" @click="setSort(s.id)">{{ s.name }}</button>
      </div>
      <span class="spacer" />
      <button class="btn small" title="用分享链接或 ID 打开歌单，之后可以收藏到「我的歌单」" @click="openByLink"><Icon name="link" :size="15" />打开歌单链接</button>
      <button class="btn small primary" title="把其他音乐 App 的歌单导入到「我的歌单」" @click="openImport"><Icon name="download" :size="15" />导入歌单</button>
    </div>

    <div class="tags">
      <button class="chip" :class="{ on: !tag }" @click="setTag(null)">全部</button>
      <button v-for="t in meta.hotTag" :key="t.id" class="chip" :class="{ on: tag?.id == t.id }" @click="setTag(t)">{{ t.name }}</button>
      <button v-if="tag && !meta.hotTag.some(t => t.id == tag!.id)" class="chip on">{{ tag.name }}</button>
      <button v-if="meta.tags.length" class="chip more" :class="{ on: showAllTags }" @click="showAllTags = !showAllTags">更多分类 <Icon name="down" :size="13" /></button>
    </div>
    <div v-if="showAllTags" class="all-tags">
      <div v-for="g in meta.tags" :key="g.name" class="group">
        <div class="g-name">{{ g.name }}</div>
        <div class="g-list">
          <button v-for="t in g.list" :key="t.id" class="chip" :class="{ on: tag?.id == t.id }" @click="setTag(t)">{{ t.name }}</button>
        </div>
      </div>
    </div>

    <ListFilterBar :filter="filter" :shown="shown.length" :total="state.list.length" />

    <div class="card-grid"><ListCard v-for="l in shown" :key="l.id" :list="{ ...l, source }" /></div>
    <div v-if="state.loading" class="center-box" :style="state.list.length ? 'padding:24px' : ''"><span class="spinner" /></div>
    <div v-else-if="state.error" class="center-box">{{ state.error }}<button class="btn" @click="loadMore">重试</button></div>
    <div v-else-if="!state.list.length && state.page" class="center-box">这个分类下暂时没有歌单</div>
    <div v-else-if="state.list.length && !shown.length" class="center-box">已加载的歌单里没有播放量这么高的，换个分类或者降低一点试试</div>
  </Page>
</template>

<style scoped>
.bar { margin-bottom: 14px; flex-wrap: wrap; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.chip.more { gap: 4px; }
.all-tags { margin: -6px 0 20px; padding: 16px 18px; border-radius: 16px; background: var(--card); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; }
.group { display: flex; gap: 14px; }
.g-name { width: 56px; flex: none; color: var(--text3); font-size: 13px; line-height: 30px; }
.g-list { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
