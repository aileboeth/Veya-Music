<script setup lang="ts">
// 手机版「我的」：同步状态、常用入口、我的歌单
import { computed } from 'vue'
import Cover from '../components/Cover.vue'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import { createList, lists, removeList, type MyList } from '../lists'
import { player, playList, startPersonalRadio } from '../player'
import { sync, timeAgo } from '../sync'
import { confirmDialog, go, openImport, openMenu, openSheet, promptDialog, toast } from '../ui'

defineProps<{ params: Record<string, any> }>()

const syncText = computed(() => {
  if (!sync.paired) return '连接自己的服务器，和电脑同步歌单、记录和音源'
  if (sync.syncing) return '正在同步…'
  if (sync.error) return '同步出错：' + sync.error
  if (!sync.online) return '正在连接同步服务器…'
  const others = sync.devices.filter(d => d.online && d.id != sync.deviceId).length
  return `已同步${sync.lastSync ? ' · ' + timeAgo(sync.lastSync) : ''}${others ? ` · ${others} 台设备在线` : ''}`
})
const coverOf = (l: MyList) => l.songs.find(s => s.img)?.img ?? ''
const newList = async() => {
  const name = await promptDialog('新建歌单', '', '歌单名称')
  if (name) go('mylist', { id: createList(name).id })
}
const listMenu = (e: MouseEvent, l: MyList) => openMenu(e, [
  { label: '播放', icon: 'play', disabled: !l.songs.length, action: () => playList(l.songs, 0, { type: 'mylist', name: l.name, route: { name: 'mylist', params: { id: l.id } } }) },
  { label: '重命名', icon: 'edit', disabled: l.id == 'love', action: async() => {
    const name = await promptDialog('重命名歌单', l.name)
    if (name) l.name = name.slice(0, 60)
  } },
  { divider: true },
  { label: '删除歌单', icon: 'trash', danger: true, disabled: l.id == 'love', action: async() => {
    if (!await confirmDialog(`删除歌单「${l.name}」？`, `歌单里的 ${l.songs.length} 首歌会一起移除，此操作不能撤销。`, { okText: '删除', danger: true })) return
    removeList(l.id)
    toast('歌单已删除')
  } },
])
const isPlayingList = (id: string) => player.source?.route?.name == 'mylist' && player.source.route.params.id == id
</script>

<template>
  <Page>
    <button class="sync-card" :class="{ ok: sync.online && !sync.error, bad: !!sync.error }" @click="sync.paired ? openSheet('devices') : go('settings', { _sync: Date.now() })">
      <span class="ic"><Icon :name="sync.paired ? 'cloud' : 'link'" :size="22" /></span>
      <span class="t">
        <b>{{ sync.paired ? sync.deviceName : '多设备同步' }}</b>
        <small class="ellipsis">{{ syncText }}</small>
      </span>
      <Icon name="forward" :size="18" />
    </button>

    <div class="quick">
      <button @click="go('daily')"><span class="q daily"><Icon name="daily" :size="22" /></span>每日推荐</button>
      <button @click="startPersonalRadio()"><span class="q radio"><Icon name="radio" :size="22" /></span>私人电台</button>
      <button @click="go('recent')"><span class="q recent"><Icon name="clock" :size="22" /></span>最近播放</button>
      <button @click="go('downloads')"><span class="q dl"><Icon name="download" :size="22" /></span>下载</button>
    </div>

    <div class="section-title">我的歌单 <small>{{ lists.length }}</small><span class="spacer" />
      <button class="icon-btn" title="导入歌单" @click="openImport"><Icon name="link" :size="19" /></button>
      <button class="icon-btn" title="新建歌单" @click="newList"><Icon name="plus" :size="20" /></button>
    </div>
    <div class="lists">
      <div v-for="l in lists" :key="l.id" class="l-row" @click="go('mylist', { id: l.id })" @contextmenu="listMenu($event, l)">
        <span v-if="l.id == 'love'" class="pic love"><Icon name="heart-fill" :size="22" /></span>
        <Cover v-else-if="coverOf(l)" :src="coverOf(l)" :text="l.name" :size="50" :radius="12" />
        <span v-else class="pic"><Icon name="music" :size="22" /></span>
        <span class="t">
          <b class="ellipsis" :class="{ on: isPlayingList(l.id) }">{{ l.name }}</b>
          <small>{{ l.songs.length }} 首</small>
        </span>
        <button class="icon-btn" @click.stop="listMenu($event, l)"><Icon name="more" :size="18" /></button>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.sync-card { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px; margin-top: 4px; border-radius: 18px; background: var(--card); border: 1px solid var(--border); text-align: left; }
.sync-card .ic { width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: var(--grad-soft); color: var(--accent); flex: none; }
.sync-card.ok .ic { color: #12a37a; }
.sync-card.bad .ic { color: var(--danger); }
.sync-card .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sync-card b { font-size: 15px; }
.sync-card small { font-size: 12px; color: var(--text3); }
.quick { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
.quick button { display: flex; flex-direction: column; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text2); padding: 6px 0; }
.q { width: 52px; height: 52px; border-radius: 18px; display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: 0 6px 16px rgba(30, 60, 140, 0.18); }
.q.daily { background: linear-gradient(135deg, #12cfd6, #2a8bff); }
.q.radio { background: linear-gradient(135deg, #7a4dfb, #ff6fa8); }
.q.recent { background: linear-gradient(135deg, #ffb347, #ff6b6b); }
.q.dl { background: linear-gradient(135deg, #2ad3a0, #1f9bff); }
.section-title .icon-btn { width: 36px; height: 36px; }
.lists { display: flex; flex-direction: column; gap: 2px; }
.l-row { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-radius: 14px; }
.l-row:active { background: var(--hover); }
.pic { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--grad-soft); color: var(--accent); flex: none; }
.pic.love { color: #fff; background: linear-gradient(135deg, #ff7a9c, #ff4d6d 55%, #c44dff); }
.l-row .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.l-row b { font-size: 15px; font-weight: 600; }
.l-row b.on { color: var(--accent); }
.l-row small { font-size: 12px; color: var(--text3); }
</style>
