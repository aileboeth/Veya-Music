<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'
import { api, sourceName, type Song } from '../api'
import Cover from '../components/Cover.vue'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { countRemoved, getList, removeList } from '../lists'
import { enqueue, playList } from '../player'
import { settings } from '../settings'
import { download } from '../songMenu'
import { confirmDialog, go, openMenu, openSyncPreview, promptDialog, toast } from '../ui'

const props = defineProps<{ params: Record<string, any> }>()

const list = computed(() => getList(props.params.id))
const allSongs = computed(() => list.value?.songs ?? [])

// ---- 排序 / 筛选：只影响显示和播放顺序，不改歌单本身 ----
const SORTS = [
  { id: 'default', name: '默认顺序' },
  { id: 'plays', name: '我听得最多' },
  { id: 'recent', name: '最近听过' },
  { id: 'name', name: '歌名' },
  { id: 'singer', name: '歌手' },
  { id: 'duration', name: '时长' },
] as const
const counts = ref<Record<string, { p: number, l: number }>>({})
const loadCounts = () => void api<Record<string, { p: number, l: number }>>('stats.counts').then(r => { counts.value = r ?? {} }).catch(() => {})
onMounted(loadCounts)
onActivated(loadCounts)
const heard = ref<'all' | 'heard' | 'new'>('all')
const secs = (s: Song) => {
  const m = /^(\d+):(\d+)/.exec(s.interval ?? '')
  return m ? +m[1] * 60 + +m[2] : 0
}
const collator = new Intl.Collator('zh-CN', { numeric: true })
const songs = computed(() => {
  const c = counts.value
  let arr = allSongs.value
  if (heard.value == 'heard') arr = arr.filter(s => c[s.id]?.p)
  else if (heard.value == 'new') arr = arr.filter(s => !c[s.id]?.p)
  const mode = settings.myListSort ?? 'default'
  if (mode == 'default') return arr
  const out = arr.slice()
  if (mode == 'plays') out.sort((a, b) => (c[b.id]?.p ?? 0) - (c[a.id]?.p ?? 0) || (c[b.id]?.l ?? 0) - (c[a.id]?.l ?? 0))
  else if (mode == 'recent') out.sort((a, b) => (c[b.id]?.l ?? 0) - (c[a.id]?.l ?? 0))
  else if (mode == 'name') out.sort((a, b) => collator.compare(a.name, b.name))
  else if (mode == 'singer') out.sort((a, b) => collator.compare(a.singer, b.singer) || collator.compare(a.name, b.name))
  else if (mode == 'duration') out.sort((a, b) => secs(b) - secs(a))
  return out
})
const sortName = computed(() => SORTS.find(s => s.id == (settings.myListSort ?? 'default'))?.name ?? '默认顺序')
const sortMenu = (e: MouseEvent) => openMenu(e, SORTS.map(s => ({
  label: (s.id == (settings.myListSort ?? 'default') ? '✓ ' : '　 ') + s.name,
  action: () => { settings.myListSort = s.id; if (s.id == 'plays' || s.id == 'recent') loadCounts() },
})))
const queueSource = computed(() => ({ type: 'mylist', name: list.value?.name ?? '', route: { name: 'mylist', params: { id: props.params.id } } }))
const cover = computed(() => songs.value.find(s => s.img)?.img)
const syncing = ref(false)

const play = (shuffle = false) => {
  if (!songs.value.length) return
  if (shuffle) settings.playMode = 'shuffle'
  playList(songs.value, shuffle ? Math.floor(Math.random() * songs.value.length) : 0, queueSource.value)
}

/** 收藏自在线歌单的列表：把原歌单里新增的歌同步过来 */
const sync = async(force = false) => {
  const l = list.value
  if (!l?.source || !l.sourceListId || syncing.value) return
  syncing.value = true
  try {
    const r = await api('songlist.detail', l.source, l.sourceListId)
    const have = new Set(l.songs.map(s => s.id))
    const removed = new Set(l.removed ?? [])
    const fresh = (r.list as any[]).filter(s => !have.has(s.id))
    const skipped = countRemoved(l.id, r.list)
    // 真正新增的歌一首都没有：不用弹预览（删掉的那些不会自己回来，想要回来可以在「…」菜单里点「找回删掉的歌」）
    if (!fresh.length) toast('已经是最新的了', 'success')
    else if (!force && !fresh.some(s => !removed.has(s.id))) toast('已经是最新的了' + (skipped ? `（你删掉的 ${skipped} 首没有加回来）` : ''), 'success', 4000)
    else openSyncPreview({ songs: r.list, missing: [], total: r.list.length, name: l.name, platformName: sourceName(l.source), source: l.source, sourceListId: l.sourceListId }, l.id)
  } catch (err: any) {
    toast('同步失败：' + err.message, 'error')
  } finally {
    syncing.value = false
  }
}

const more = (e: MouseEvent) => {
  const l = list.value!
  openMenu(e, [
    { label: '添加到播放队列', icon: 'queue', disabled: !songs.value.length, action: () => enqueue(songs.value) },
    { label: '下载全部', icon: 'download', disabled: !songs.value.length, action: async() => {
      if (await confirmDialog(`下载全部 ${songs.value.length} 首歌曲？`, '会按「设置 → 下载」里选择的音质依次下载。')) void download(songs.value)
    } },
    { divider: true },
    { label: '重命名', icon: 'edit', disabled: l.id == 'love', action: async() => {
      const name = await promptDialog('重命名歌单', l.name)
      if (name) l.name = name.slice(0, 60)
    } },
    ...(l.removed?.length && l.sourceListId ? [{ label: `找回删掉的歌（${l.removed.length} 首）…`, icon: 'refresh', action: () => void sync(true) }] : []),
    { label: '清空歌单', icon: 'trash', danger: true, disabled: !songs.value.length, action: async() => {
      if (await confirmDialog(`清空「${l.name}」？`, `将移除全部 ${songs.value.length} 首歌，此操作不能撤销。`, { okText: '清空', danger: true })) l.songs = []
    } },
    { label: '删除歌单', icon: 'trash', danger: true, disabled: l.id == 'love', action: async() => {
      if (!await confirmDialog(`删除歌单「${l.name}」？`, '此操作不能撤销。', { okText: '删除', danger: true })) return
      removeList(l.id)
      go('discover')
    } },
  ])
}
</script>

<template>
  <Page v-if="list">
    <div class="list-hero">
      <div v-if="list.id == 'love'" class="hero-icon love"><Icon name="heart-fill" :size="64" /></div>
      <Cover v-else-if="cover" class="hero-cover" :src="cover" :text="list.name" :size="150" :radius="20" :px="500" />
      <div v-else class="hero-icon"><Icon name="music" :size="60" /></div>
      <div class="hero-info">
        <div class="hero-tag">我的歌单<template v-if="list.source"> · 收藏自{{ sourceName(list.source) }}</template></div>
        <h1>{{ list.name }}</h1>
        <div class="hero-btns">
          <button class="btn primary" :disabled="!songs.length" @click="play()"><Icon name="play" :size="16" />播放全部</button>
          <button class="btn" :disabled="!songs.length" @click="play(true)"><Icon name="shuffle" :size="16" />随机播放</button>
          <button v-if="list.sourceListId" class="btn" :disabled="syncing" title="把原歌单里新增的歌曲同步过来" @click="sync()"><Icon name="refresh" :size="16" />{{ syncing ? '同步中…' : '同步更新' }}</button>
          <button class="btn" title="更多" @click="more"><Icon name="more" :size="16" /></button>
        </div>
      </div>
    </div>
    <SongList :songs="songs" :source="queueSource" :list-id="list.id" show-source :locate-key="params._locate">
      <template #toolbar>
        <button class="btn small" title="只影响显示和播放顺序，不改歌单本身" @click="sortMenu"><Icon name="sort" :size="14" />{{ sortName }}<Icon name="down" :size="12" /></button>
        <div class="tabs small heard">
          <button :class="{ on: heard == 'all' }" @click="heard = 'all'">全部</button>
          <button :class="{ on: heard == 'heard' }" @click="heard = 'heard'">听过的</button>
          <button :class="{ on: heard == 'new' }" @click="heard = 'new'">没听过</button>
        </div>
        <span v-if="heard != 'all'" class="dim heard-n">{{ songs.length }} / {{ allSongs.length }}</span>
      </template>
      <template #empty>
        <template v-if="allSongs.length">
          <div>{{ heard == 'heard' ? '这个歌单里的歌你还都没听过' : '这个歌单里的歌你都听过了' }}</div>
          <button class="btn small" @click="heard = 'all'">显示全部 {{ allSongs.length }} 首</button>
        </template>
        <template v-else>
          <div>这个歌单还没有歌曲</div>
          <div>在任意歌曲上点 <b>♡</b> 或右键「添加到歌单」就能收进来</div>
        </template>
      </template>
    </SongList>
  </Page>
  <div v-else class="center-box">歌单不存在或已被删除</div>
</template>

<style scoped>
.tabs.small { padding: 3px; border-radius: 10px; }
.tabs.small button { height: 26px; padding: 0 11px; font-size: 12.5px; }
.heard-n { font-size: 12px; }
</style>
