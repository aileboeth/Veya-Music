<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { api } from './api'
import logo from './assets/logo.svg'
import Icon from './components/Icon.vue'
import NowPlaying from './components/NowPlaying.vue'
import ImportDialog from './components/ImportDialog.vue'
import Overlays from './components/Overlays.vue'
import PlayerBar from './components/PlayerBar.vue'
import QueuePanel from './components/QueuePanel.vue'
import { createList, lists, removeList, type MyList } from './lists'
import { next, player, playList, prev, toggle } from './player'
import { settings } from './settings'
import { installUpdate, update } from './update'
import { back, confirmDialog, forward, go, openImport, openMenu, promptDialog, router, toast } from './ui'
import Boards from './views/Boards.vue'
import Daily from './views/Daily.vue'
import Discover from './views/Discover.vue'
import Downloads from './views/Downloads.vue'
import ListDetail from './views/ListDetail.vue'
import MyListView from './views/MyList.vue'
import Recent from './views/Recent.vue'
import Search from './views/Search.vue'
import Settings from './views/Settings.vue'
import SongLists from './views/SongLists.vue'

const views: Record<string, Component> = {
  discover: Discover, search: Search, songlists: SongLists, listdetail: ListDetail, boards: Boards,
  mylist: MyListView, daily: Daily, recent: Recent, downloads: Downloads, settings: Settings,
}
const nav = [
  { name: 'discover', label: '发现', icon: 'discover' },
  { name: 'daily', label: '每日推荐', icon: 'daily' },
  { name: 'boards', label: '排行榜', icon: 'chart' },
  { name: 'songlists', label: '歌单广场', icon: 'grid' },
  { name: 'recent', label: '最近播放', icon: 'clock' },
  { name: 'downloads', label: '下载', icon: 'download' },
]
const route = computed(() => router.current)
const isPlayingFrom = (name: string, id?: string) => {
  const r = player.source?.route
  return !!r && r.name == name && (id == null || r.params.id == id)
}

// ---------- 搜索框 ----------
const searchText = ref('')
const searchEl = ref<HTMLInputElement | null>(null)
const tips = ref<string[]>([])
const history = ref<string[]>([])
const focused = ref(false)
const tipIndex = ref(-1)
let tipTimer: any = null
watch(searchText, text => {
  clearTimeout(tipTimer)
  tipIndex.value = -1
  if (!text.trim()) return void (tips.value = [])
  tipTimer = setTimeout(async() => {
    const r = await api<string[]>('search.tips', text.trim()).catch(() => [])
    if (searchText.value == text) tips.value = r
  }, 220)
})
watch(route, r => { if (r.name == 'search' && r.params.text) searchText.value = r.params.text })
const dropdown = computed(() => searchText.value.trim() ? tips.value : history.value)
const doSearch = (text = searchText.value) => {
  text = text.trim()
  if (!text) return
  searchText.value = text
  history.value = [text, ...history.value.filter(h => h != text)].slice(0, 12)
  void api('data.save', 'searchHistory', history.value)
  focused.value = false
  searchEl.value?.blur()
  go('search', { text })
}
const onSearchKey = (e: KeyboardEvent) => {
  const list = dropdown.value
  if (e.key == 'ArrowDown' && list.length) { e.preventDefault(); tipIndex.value = (tipIndex.value + 1) % list.length } else if (e.key == 'ArrowUp' && list.length) { e.preventDefault(); tipIndex.value = (tipIndex.value - 1 + list.length) % list.length } else if (e.key == 'Enter') doSearch(tipIndex.value > -1 ? list[tipIndex.value] : searchText.value)
  else if (e.key == 'Escape') searchEl.value?.blur()
}
const clearHistory = () => {
  history.value = []
  void api('data.save', 'searchHistory', [])
}

// ---------- 我的歌单 ----------
const newList = async() => {
  const name = await promptDialog('新建歌单', '', '歌单名称')
  if (!name) return
  const list = createList(name)
  go('mylist', { id: list.id })
}
const listMenu = (e: MouseEvent, list: MyList) => {
  openMenu(e, [
    { label: '播放', icon: 'play', disabled: !list.songs.length, action: () => playList(list.songs, 0, { type: 'mylist', name: list.name, route: { name: 'mylist', params: { id: list.id } } }) },
    { label: '重命名', icon: 'edit', disabled: list.id == 'love', action: async() => {
      const name = await promptDialog('重命名歌单', list.name)
      if (name) list.name = name.slice(0, 60)
    } },
    { divider: true },
    { label: '删除歌单', icon: 'trash', danger: true, disabled: list.id == 'love', action: async() => {
      if (!await confirmDialog(`删除歌单「${list.name}」？`, `歌单里的 ${list.songs.length} 首歌会一起移除，此操作不能撤销。`, { okText: '删除', danger: true })) return
      removeList(list.id)
      if (route.value.name == 'mylist' && route.value.params.id == list.id) go('discover')
      toast('歌单已删除')
    } },
  ])
}

// ---------- 快捷键 ----------
const onKey = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  const typing = target.tagName == 'INPUT' || target.tagName == 'TEXTAREA' || target.isContentEditable
  if (e.ctrlKey && e.key.toLowerCase() == 'f') { e.preventDefault(); searchEl.value?.focus(); searchEl.value?.select(); return }
  if (typing) return
  if (e.code == 'Space') { e.preventDefault(); toggle() } else if (e.ctrlKey && e.key == 'ArrowRight') void next()
  else if (e.ctrlKey && e.key == 'ArrowLeft') prev()
  else if (e.ctrlKey && e.key == 'ArrowUp') { e.preventDefault(); settings.volume = Math.min(1, settings.volume + 0.05) } else if (e.ctrlKey && e.key == 'ArrowDown') { e.preventDefault(); settings.volume = Math.max(0, settings.volume - 0.05) } else if (e.key == 'Escape') {
    if (player.showQueue) player.showQueue = false
    else if (player.showNowPlaying) player.showNowPlaying = false
  } else if (e.altKey && e.key == 'ArrowLeft') back()
  else if (e.altKey && e.key == 'ArrowRight') forward()
}
const onMouseNav = (e: MouseEvent) => {
  if (e.button == 3) { e.preventDefault(); back() } else if (e.button == 4) { e.preventDefault(); forward() }
}
onMounted(async() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('mouseup', onMouseNav)
  history.value = await api<string[]>('data.load', 'searchHistory', [])
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mouseup', onMouseNav)
})
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <img :src="logo" alt="" />
        <span>Veya <b class="grad-text">Music</b></span>
      </div>
      <nav>
        <button v-for="n in nav" :key="n.name" class="nav-item" :class="{ on: route.name == n.name }" @click="go(n.name)">
          <Icon :name="n.icon" :size="19" />
          <span>{{ n.label }}</span>
          <span v-if="isPlayingFrom(n.name)" class="eq-dot" :class="{ paused: !player.playing }" title="正在播放这里的歌曲" />
        </button>
      </nav>
      <div class="lists-head">
        <span>我的歌单</span>
        <span class="spacer" />
        <button class="icon-btn" title="导入歌单（网易云 / QQ / 酷狗 / 酷我 / 咪咕 / 汽水）" @click="openImport"><Icon name="link" :size="15" /></button>
        <button class="icon-btn" title="新建歌单" @click="newList"><Icon name="plus" :size="16" /></button>
      </div>
      <div class="lists">
        <button
          v-for="l in lists" :key="l.id" class="nav-item" :class="{ on: route.name == 'mylist' && route.params.id == l.id }"
          @click="go('mylist', { id: l.id })" @contextmenu="listMenu($event, l)"
        >
          <Icon :name="l.id == 'love' ? 'heart' : 'music'" :size="18" />
          <span class="ellipsis">{{ l.name }}</span>
          <span v-if="isPlayingFrom('mylist', l.id)" class="eq-dot" :class="{ paused: !player.playing }" title="正在播放这个歌单" />
        </button>
      </div>
      <button v-if="update.status == 'downloaded'" class="update-btn" :title="'新版本 ' + update.version + ' 已下载'" @click="installUpdate">
        <Icon name="sparkle" :size="17" /><span>重启更新 {{ update.version }}</span>
      </button>
      <button class="nav-item settings" :class="{ on: route.name == 'settings' }" @click="go('settings')">
        <Icon name="settings" :size="19" /><span>设置</span>
      </button>
    </aside>

    <main>
      <header class="topbar">
        <button class="icon-btn" :disabled="!router.canBack" title="后退 (Alt+←)" @click="back"><Icon name="back" /></button>
        <button class="icon-btn" :disabled="!router.canForward" title="前进 (Alt+→)" @click="forward"><Icon name="forward" /></button>
        <div class="search" :class="{ focused }">
          <Icon name="search" :size="16" />
          <input
            ref="searchEl" v-model="searchText" placeholder="搜索歌曲、歌手、歌单  (Ctrl+F)" spellcheck="false"
            @focus="focused = true" @blur="focused = false" @keydown="onSearchKey"
          />
          <button v-if="searchText" class="clear" @mousedown.prevent="searchText = ''"><Icon name="close" :size="14" /></button>
          <div v-if="focused && dropdown.length" class="dropdown" @mousedown.prevent>
            <div v-if="!searchText.trim()" class="dd-head">搜索历史 <button @click="clearHistory">清空</button></div>
            <button v-for="(t, i) in dropdown" :key="t" class="dd-item ellipsis" :class="{ on: i == tipIndex }" @click="doSearch(t)">
              <Icon :name="searchText.trim() ? 'search' : 'clock'" :size="14" />{{ t }}
            </button>
          </div>
        </div>
      </header>
      <div class="view">
        <KeepAlive :max="12">
          <component :is="views[route.name]" :key="route.key" :params="route.params" />
        </KeepAlive>
      </div>
    </main>

    <NowPlaying />
    <QueuePanel />
    <PlayerBar class="bar" />
    <ImportDialog />
    <Overlays />
  </div>
</template>

<style scoped>
.app { position: relative; height: 100%; display: grid; grid-template-columns: 216px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
.bar { grid-column: 1 / -1; }
.sidebar { display: flex; flex-direction: column; padding: 0 10px 10px; background: var(--panel); border-right: 1px solid var(--border); min-height: 0; -webkit-app-region: drag; }
.sidebar button { -webkit-app-region: no-drag; }
.brand { height: 64px; display: flex; align-items: center; gap: 6px; padding: 6px 8px 0; font-size: 19px; font-weight: 700; letter-spacing: .3px; flex: none; }
.brand img { width: 40px; height: 40px; margin-left: -4px; }
.brand b { font-weight: 700; }
nav { display: flex; flex-direction: column; gap: 2px; }
.nav-item { display: flex; align-items: center; gap: 11px; width: 100%; height: 38px; padding: 0 12px; border-radius: 10px; color: var(--text2); text-align: left; transition: background .12s, color .12s; flex: none; position: relative; }
.nav-item:hover { background: var(--hover); color: var(--text); }
.nav-item.on { background: var(--active); color: var(--accent); font-weight: 600; }
.nav-item.on::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: var(--grad); background: linear-gradient(180deg, #12dcd8, #2a62ff, #8a46fb); }
.nav-item span.ellipsis { flex: 1; min-width: 0; }
.eq-dot { margin-left: auto; width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(135deg, #12dcd8, #8a46fb); animation: pulse 1.400s ease-in-out infinite; flex: none; }
.eq-dot.paused { animation: none; opacity: .6; }
@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(42, 108, 255, 0.5); } 50% { box-shadow: 0 0 0 5px rgba(42, 108, 255, 0); } }
.lists-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 6px 6px 12px; font-size: 12px; color: var(--text3); flex: none; }
.lists-head .icon-btn { width: 26px; height: 26px; }
.lists { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0 -6px; padding: 0 6px; -webkit-app-region: no-drag; }
.settings { margin-top: 8px; }
.update-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 36px; margin-top: 8px; border-radius: 10px; background: var(--grad); color: #fff; font-weight: 600; font-size: 13px; flex: none; box-shadow: 0 6px 16px rgba(42, 98, 255, 0.28); }
.update-btn:hover { filter: brightness(1.08); }

main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.topbar { height: 52px; flex: none; display: flex; align-items: center; gap: 4px; padding: 8px 150px 0 20px; -webkit-app-region: drag; }
.topbar > * { -webkit-app-region: no-drag; }
.search { position: relative; display: flex; align-items: center; gap: 8px; width: 320px; height: 34px; margin-left: 10px; padding: 0 12px; border-radius: 17px; background: var(--card); border: 1px solid var(--border); color: var(--text3); transition: all .18s; }
.search.focused { border-color: var(--accent); box-shadow: 0 0 0 3px var(--active); width: 380px; color: var(--text2); }
.search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; user-select: text; }
.search input::placeholder { color: var(--text3); }
.clear { display: flex; color: var(--text3); }
.dropdown { position: absolute; left: 0; right: 0; top: 40px; z-index: 40; padding: 6px; border-radius: 14px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); backdrop-filter: blur(30px); }
.dd-head { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 12px; color: var(--text3); }
.dd-head button:hover { color: var(--accent); }
.dd-item { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 10px; border-radius: 8px; text-align: left; color: var(--text); }
.dd-item:hover, .dd-item.on { background: var(--active); color: var(--accent); }
.view { flex: 1; min-height: 0; }
</style>
