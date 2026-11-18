<script setup lang="ts">
// 手机版的外壳：顶部栏 + 页面 + 迷你播放条 + 底部标签；页面本身和电脑版共用
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { api } from './api'
import logo from './assets/logo.svg'
import DevicesSheet from './components/DevicesSheet.vue'
import Icon from './components/Icon.vue'
import ImportDialog from './components/ImportDialog.vue'
import MiniPlayer from './components/MiniPlayer.vue'
import MobileNowPlaying from './components/MobileNowPlaying.vue'
import Overlays from './components/Overlays.vue'
import QueuePanel from './components/QueuePanel.vue'
import RemoteBanner from './components/RemoteBanner.vue'
import SleepSheet from './components/SleepSheet.vue'
import { addSearchHistory, initSearchHistory } from './history'
import { getList } from './lists'
import { player } from './player'
import { sync } from './sync'
import { back, closeDialog, closeMenu, dialog, go, importDialog, listPicker, menu, openImport, openSheet, resetTo, router, sheet } from './ui'
import Boards from './views/Boards.vue'
import Daily from './views/Daily.vue'
import Discover from './views/Discover.vue'
import Downloads from './views/Downloads.vue'
import Library from './views/Library.vue'
import ListDetail from './views/ListDetail.vue'
import MyListView from './views/MyList.vue'
import Recent from './views/Recent.vue'
import Search from './views/Search.vue'
import Settings from './views/Settings.vue'
import About from './views/About.vue'
import SongLists from './views/SongLists.vue'

const views: Record<string, Component> = {
  discover: Discover, search: Search, songlists: SongLists, listdetail: ListDetail, boards: Boards,
  mylist: MyListView, daily: Daily, recent: Recent, downloads: Downloads, settings: Settings, about: About, library: Library,
}
const TABS = [
  { name: 'discover', label: '首页', icon: 'home' },
  { name: 'boards', label: '排行', icon: 'chart' },
  { name: 'songlists', label: '歌单', icon: 'grid' },
  { name: 'library', label: '我的', icon: 'library' },
]
const route = computed(() => router.current)
const tab = computed(() => router.stack[0]?.name)
const isRoot = computed(() => router.index == 0 && TABS.some(t => t.name == route.value.name))

const switchTab = (name: string) => {
  if (tab.value == name && router.index == 0) {
    document.querySelector('.m-view .page')?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  resetTo(name)
}

const title = computed(() => {
  const r = route.value
  switch (r.name) {
    case 'boards': return '排行榜'
    case 'songlists': return '歌单广场'
    case 'library': return '我的'
    case 'listdetail': return r.params.name || '歌单'
    case 'mylist': return getList(r.params.id)?.name ?? '歌单'
    case 'daily': return '每日推荐'
    case 'recent': return '最近播放'
    case 'downloads': return '下载'
    case 'settings': return '设置'
    case 'about': return '关于'
    default: return ''
  }
})

// ---------- 搜索 ----------
const searchText = ref('')
const searchEl = ref<HTMLInputElement | null>(null)
const tips = ref<string[]>([])
const focused = ref(false)
let tipTimer: any = null
watch(searchText, text => {
  clearTimeout(tipTimer)
  if (!text.trim()) return void (tips.value = [])
  tipTimer = setTimeout(async() => {
    const r = await api<string[]>('search.tips', text.trim()).catch(() => [])
    if (searchText.value == text) tips.value = r
  }, 250)
})
watch(route, r => {
  if (r.name == 'search') {
    searchText.value = r.params.text ?? ''
    if (!r.params.text) void nextTick(() => searchEl.value?.focus())
  }
})
const doSearch = (text = searchText.value) => {
  text = text.trim()
  if (!text) return
  searchText.value = text
  addSearchHistory(text)
  focused.value = false
  searchEl.value?.blur()
  if (route.value.name == 'search' && !route.value.params.text) router.stack[router.index] = { name: 'search', params: { text }, key: `search:${JSON.stringify({ text })}` }
  else go('search', { text })
}

// ---------- 返回键：先关弹层，再返回上一页，最后回到首页；首页时交给系统（回到桌面） ----------
const onBack = () => {
  if (menu.show) return closeMenu(), true
  if (dialog.show) return closeDialog(null), true
  if (listPicker.show) return (listPicker.show = false), true
  if (importDialog.show) return (importDialog.show = false), true
  if (sheet.show) return (sheet.show = ''), true
  if (player.showQueue) return (player.showQueue = false), true
  if (player.showNowPlaying) return (player.showNowPlaying = false), true
  if (focused.value) return searchEl.value?.blur(), true
  if (router.canBack) return back(), true
  if (route.value.name != 'discover') return resetTo('discover'), true
  return false
}
;(window as any).__veyaBack = onBack

const onlineOthers = computed(() => sync.devices.filter(d => d.online && d.id != sync.deviceId).length)

onMounted(() => { void initSearchHistory() })
</script>

<template>
  <div class="m-app">
    <header class="m-top">
      <template v-if="route.name == 'search'">
        <button class="icon-btn" @click="onBack"><Icon name="back" :size="22" /></button>
        <div class="search on">
          <Icon name="search" :size="17" />
          <input ref="searchEl" v-model="searchText" type="search" enterkeyhint="search" placeholder="歌名、歌手、歌单" spellcheck="false" @focus="focused = true" @blur="focused = false" @keydown.enter="doSearch()" />
          <button v-if="searchText" class="clear" @mousedown.prevent="searchText = ''"><Icon name="close" :size="15" /></button>
        </div>
        <button class="go" @click="doSearch()">搜索</button>
      </template>
      <template v-else-if="route.name == 'discover' && isRoot">
        <img :src="logo" class="logo" alt="" />
        <button class="search" @click="go('search')"><Icon name="search" :size="17" /><span>搜索歌曲、歌手、歌单</span></button>
        <button class="icon-btn" :class="{ on: onlineOthers > 0 }" @click="openSheet('devices')"><Icon name="cast" :size="22" /></button>
      </template>
      <template v-else-if="isRoot">
        <h1>{{ title }}</h1>
        <span class="spacer" />
        <button v-if="route.name == 'songlists'" class="icon-btn" title="导入歌单" @click="openImport"><Icon name="link" :size="21" /></button>
        <button class="icon-btn" @click="go('search')"><Icon name="search" :size="21" /></button>
        <button v-if="route.name == 'library'" class="icon-btn" @click="go('settings')"><Icon name="settings" :size="21" /></button>
      </template>
      <template v-else>
        <button class="icon-btn" @click="onBack"><Icon name="back" :size="22" /></button>
        <div class="sub-title ellipsis">{{ title }}</div>
        <button class="icon-btn" @click="go('search')"><Icon name="search" :size="21" /></button>
      </template>
      <div v-if="route.name == 'search' && focused && tips.length && searchText.trim()" class="tips" @mousedown.prevent>
        <button v-for="t in tips" :key="t" class="tip ellipsis" @click="doSearch(t)"><Icon name="search" :size="14" />{{ t }}</button>
      </div>
    </header>

    <main class="m-view" :class="'r-' + route.name">
      <KeepAlive :max="10">
        <component :is="views[route.name]" :key="route.key" :params="route.params" />
      </KeepAlive>
    </main>

    <div class="m-bottom">
      <div class="banner-wrap"><RemoteBanner /></div>
      <MiniPlayer />
      <nav class="m-tabs">
        <button v-for="t in TABS" :key="t.name" :class="{ on: tab == t.name }" @click="switchTab(t.name)">
          <Icon :name="t.icon" :size="23" />
          <span>{{ t.label }}</span>
        </button>
      </nav>
    </div>

    <MobileNowPlaying />
    <QueuePanel />
    <ImportDialog />
    <SleepSheet />
    <DevicesSheet />
    <Overlays />
  </div>
</template>

<style scoped>
.m-app { position: relative; height: 100%; display: flex; flex-direction: column; padding-top: var(--safe-top, 0px); }
.m-top { position: relative; height: 54px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 10px; z-index: 10; }
.m-top h1 { font-size: 24px; font-weight: 800; margin: 0 0 0 8px; letter-spacing: .3px; }
.m-top .icon-btn { width: 42px; height: 42px; color: var(--text); }
.m-top .icon-btn.on { color: var(--accent); }
.logo { width: 34px; height: 34px; margin: 0 2px 0 4px; flex: none; }
.search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 20px; background: var(--card); border: 1px solid var(--border); color: var(--text3); font-size: 14px; text-align: left; }
.search.on { color: var(--text2); border-color: var(--accent); }
.search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font-size: 15px; color: var(--text); user-select: text; }
.search input::-webkit-search-cancel-button { display: none; }
.search .clear { display: flex; color: var(--text3); }
.go { height: 40px; padding: 0 8px 0 6px; font-weight: 600; color: var(--accent); flex: none; }
.sub-title { flex: 1; min-width: 0; font-size: 17px; font-weight: 700; }
.tips { position: absolute; left: 12px; right: 12px; top: 52px; padding: 6px; border-radius: 16px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); backdrop-filter: blur(30px); }
.tip { display: flex; align-items: center; gap: 10px; width: 100%; height: 44px; padding: 0 12px; border-radius: 10px; text-align: left; font-size: 15px; }
.m-view { flex: 1; min-height: 0; position: relative; }
.m-bottom { flex: none; position: relative; z-index: 20; padding-bottom: var(--safe-bottom, 0px); background: linear-gradient(180deg, transparent, var(--bg) 30%); }
.banner-wrap { padding: 0 12px 6px; }
.m-tabs { height: 56px; display: grid; grid-template-columns: repeat(4, 1fr); }
.m-tabs button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--text3); font-size: 11px; transition: color .15s; }
.m-tabs button.on { color: var(--accent); font-weight: 600; }
.m-tabs button.on :deep(svg) { filter: drop-shadow(0 2px 6px rgba(42, 108, 255, 0.35)); }
</style>
