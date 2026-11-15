<script setup lang="ts">
import { onActivated, onMounted, ref } from 'vue'
import { api, type Song } from '../api'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { playList } from '../player'

defineProps<{ params: Record<string, any> }>()

const songs = ref<Song[]>([])
const loaded = ref(false)
const queueSource = { type: 'recent', name: '最近播放', route: { name: 'recent', params: {} } }
const load = async() => {
  songs.value = await api<Song[]>('stats.recent').catch(() => [])
  loaded.value = true
}
onMounted(load)
onActivated(load)
</script>

<template>
  <Page>
    <div class="row" style="justify-content: space-between">
      <h1 class="page-title">最近播放</h1>
      <button class="btn primary" :disabled="!songs.length" @click="playList(songs, 0, queueSource)"><Icon name="play" :size="16" />播放全部</button>
    </div>
    <SongList v-if="loaded" :songs="songs" :source="queueSource" show-source :locate-key="params._locate" empty-text="还没有播放记录" />
  </Page>
</template>
