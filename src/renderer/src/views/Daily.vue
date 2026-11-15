<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type Song } from '../api'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import SongList from '../components/SongList.vue'
import { createList } from '../lists'
import { playList } from '../player'
import { toast } from '../ui'

defineProps<{ params: Record<string, any> }>()

const songs = ref<Song[]>([])
const cold = ref(false)
const loading = ref(true)
const error = ref('')
const today = new Date()
const queueSource = { type: 'daily', name: '每日推荐', route: { name: 'daily', params: {} } }

const load = async(force = false) => {
  loading.value = true
  error.value = ''
  try {
    const r = await api('rec.daily', force)
    songs.value = r.songs
    cold.value = r.cold
    if (force) toast('已换一批推荐', 'success')
  } catch (err: any) {
    error.value = err.message || '推荐生成失败'
  } finally {
    loading.value = false
  }
}
onMounted(() => load())
/** 标记不喜欢后主进程会从缓存里移除，这里重新读取 */
const reload = () => void api('rec.daily').then(r => { songs.value = r.songs })

const saveAs = () => {
  createList(`每日推荐 ${today.getMonth() + 1}.${today.getDate()}`, songs.value)
  toast('已保存为歌单', 'success')
}
</script>

<template>
  <Page>
    <div class="list-hero">
      <div class="hero-icon date"><b>{{ today.getDate() }}</b><span>{{ today.getMonth() + 1 }} 月</span></div>
      <div class="hero-info">
        <div class="hero-tag">为你推荐 · 每天凌晨 4 点更新</div>
        <h1>每日推荐</h1>
        <div class="hero-desc">
          {{ cold ? '听歌记录还不够多，先为你准备了一些近期热门。多听、多点 ♡，推荐会越来越准。' : '根据你常听、收藏的歌曲计算出的相似好歌；对不喜欢的歌右键选「不喜欢」，以后就不会再出现。' }}
        </div>
        <div class="hero-btns">
          <button class="btn primary" :disabled="!songs.length" @click="playList(songs, 0, queueSource)"><Icon name="play" :size="16" />播放全部</button>
          <button class="btn" :disabled="loading" @click="load(true)"><Icon name="refresh" :size="16" />换一批</button>
          <button class="btn" :disabled="!songs.length" @click="saveAs"><Icon name="plus" :size="16" />保存为歌单</button>
        </div>
      </div>
    </div>
    <div v-if="loading" class="center-box"><span class="spinner" />正在根据你的口味挑歌…</div>
    <div v-else-if="error" class="center-box">{{ error }}<button class="btn" @click="load()">重试</button></div>
    <SongList v-else :songs="songs" :source="queueSource" recommend show-source :locate-key="params._locate" empty-text="暂时没有拿到推荐，稍后再试" @removed="reload" />
  </Page>
</template>

<style scoped>
.date { flex-direction: column; }
.date b { font-size: 56px; line-height: 1; }
.date span { font-size: 15px; margin-top: 8px; opacity: .92; }
</style>
