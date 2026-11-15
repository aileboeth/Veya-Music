<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, sourceName } from '../api'
import Cover from '../components/Cover.vue'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { addSongs, countRemoved, getList, removeList } from '../lists'
import { enqueue, playList } from '../player'
import { settings } from '../settings'
import { download } from '../songMenu'
import { confirmDialog, go, openMenu, promptDialog, toast } from '../ui'

const props = defineProps<{ params: Record<string, any> }>()

const list = computed(() => getList(props.params.id))
const songs = computed(() => list.value?.songs ?? [])
const queueSource = computed(() => ({ type: 'mylist', name: list.value?.name ?? '', route: { name: 'mylist', params: { id: props.params.id } } }))
const cover = computed(() => songs.value.find(s => s.img)?.img)
const syncing = ref(false)

const play = (shuffle = false) => {
  if (!songs.value.length) return
  if (shuffle) settings.playMode = 'shuffle'
  playList(songs.value, shuffle ? Math.floor(Math.random() * songs.value.length) : 0, queueSource.value)
}

/** 收藏自在线歌单的列表：把原歌单里新增的歌同步过来 */
const sync = async() => {
  const l = list.value
  if (!l?.source || !l.sourceListId || syncing.value) return
  syncing.value = true
  try {
    const r = await api('songlist.detail', l.source, l.sourceListId)
    const n = addSongs(l.id, r.list, false, true)
    const skipped = countRemoved(l.id, r.list)
    toast((n ? `同步完成，新增 ${n} 首` : '已经是最新的了') + (skipped ? `（你删掉的 ${skipped} 首没有加回来）` : ''), 'success', 4000)
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
    ...(l.removed?.length ? [{ label: `恢复删掉的 ${l.removed.length} 首（下次同步时加回来）`, icon: 'refresh', action: () => { l.removed = []; toast('已恢复，点「同步更新」就会把它们加回来', 'success', 4000) } }] : []),
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
          <button v-if="list.sourceListId" class="btn" :disabled="syncing" title="把原歌单里新增的歌曲同步过来" @click="sync"><Icon name="refresh" :size="16" />{{ syncing ? '同步中…' : '同步更新' }}</button>
          <button class="btn" title="更多" @click="more"><Icon name="more" :size="16" /></button>
        </div>
      </div>
    </div>
    <SongList :songs="songs" :source="queueSource" :list-id="list.id" show-source :locate-key="params._locate">
      <template #empty>
        <div>这个歌单还没有歌曲</div>
        <div>在任意歌曲上点 <b>♡</b> 或右键「添加到歌单」就能收进来</div>
      </template>
    </SongList>
  </Page>
  <div v-else class="center-box">歌单不存在或已被删除</div>
</template>
