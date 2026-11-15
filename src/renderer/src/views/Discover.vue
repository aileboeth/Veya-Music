<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { api, on, type Song } from '../api'
import Cover from '../components/Cover.vue'
import Icon from '../components/Icon.vue'
import ListCard from '../components/ListCard.vue'
import Page from '../components/Page.vue'
import { player, playList, startPersonalRadio, toggle } from '../player'
import { dislikeVersion, openSongMenu } from '../songMenu'
import { go } from '../ui'

defineProps<{ params: Record<string, any> }>()

const daily = ref<{ date: string, songs: Song[], cold: boolean } | null>(null)
const dailyLoading = ref(true)
const info = ref<any>(null)
const boards = ref<Array<{ id: string, name: string, songs: Song[] }>>([])
const hasSource = ref(true)

const BOARDS = [
  { id: 'tx__26', name: 'QQ 热歌榜' },
  { id: 'wy__19723756', name: '网易 飙升榜' },
  { id: 'kw__16', name: '酷我 热歌榜' },
  { id: 'kg__8888', name: '酷狗 TOP500' },
]
const dailySource = { type: 'daily', name: '每日推荐', route: { name: 'daily', params: {} } }
watch(dislikeVersion, () => void api('rec.daily').then(r => { daily.value = r }).catch(() => {}))

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好'
})
const today = new Date()

const load = async() => {
  void api<any[]>('source.list').then(l => { hasSource.value = l.some(s => s.enabled) })
  void api('rec.daily').then(r => { daily.value = r }).catch(() => {}).finally(() => { dailyLoading.value = false })
  void api('rec.discover').then(r => { info.value = r }).catch(() => {})
  void Promise.all(BOARDS.map(b => api('board.detail', b.id).then(r => ({ ...b, songs: r.list.slice(0, 4) })).catch(() => null)))
    .then(list => { boards.value = list.filter(Boolean) as any })
}
onMounted(load)
let lastLoad = Date.now()
onActivated(() => {
  // 隔一段时间回到发现页时刷新（每日推荐由主进程按天缓存）
  if (Date.now() - lastLoad > 30 * 60_000) {
    lastLoad = Date.now()
    void load()
  }
})
on('sources:changed', (l: any[]) => { hasSource.value = l.some(s => s.enabled) })

const playDaily = (index = 0) => {
  if (!daily.value?.songs.length) return
  if (player.source?.type == 'daily' && index == 0) return toggle()
  playList(daily.value.songs, index, dailySource)
}
const dailyPlaying = computed(() => player.source?.type == 'daily' && player.playing)
const radioPlaying = computed(() => player.source?.name == '私人电台' && player.playing)
const playBoard = (b: { id: string, name: string }, index: number) => {
  void api('board.detail', b.id).then(r => playList(r.list, index, { type: 'board', name: b.name, route: { name: 'boards', params: { source: b.id.split('__')[0], id: b.id } } }))
}
</script>

<template>
  <Page>
    <h1 class="page-title">{{ greeting }}，<span class="grad-text">听点什么？</span></h1>

    <button v-if="!hasSource" class="notice" @click="go('settings', { tab: 'source' })">
      <Icon name="info" :size="18" />
      <span>还没有导入音源，歌曲暂时无法播放。<b>点这里去「设置 → 音源管理」导入音源脚本</b></span>
    </button>

    <div class="heroes">
      <div class="hero daily" @click="go('daily')">
        <div class="date"><b>{{ today.getDate() }}</b><span>{{ today.getMonth() + 1 }} 月</span></div>
        <div class="txt">
          <h2>每日推荐</h2>
          <p v-if="dailyLoading">正在根据你的口味挑歌…</p>
          <p v-else-if="daily?.cold">多听、多收藏几首，推荐会越来越懂你</p>
          <p v-else>根据你的听歌记录生成 · 每天凌晨 4 点更新</p>
        </div>
        <div class="covers">
          <Cover v-for="s in (daily?.songs ?? []).slice(0, 4)" :key="s.id" :src="s.img" :text="s.name" :size="46" :radius="10" />
        </div>
        <button class="hero-play" :title="dailyPlaying ? '暂停' : '播放每日推荐'" @click.stop="playDaily(0)"><Icon :name="dailyPlaying ? 'pause' : 'play'" :size="24" /></button>
      </div>
      <div class="hero radio" @click="startPersonalRadio()">
        <div class="waves"><i v-for="n in 5" :key="n" :class="{ on: radioPlaying }" /></div>
        <div class="txt">
          <h2>私人电台</h2>
          <p>从你最近爱听的歌出发，无限播放相似好歌</p>
        </div>
        <button class="hero-play" title="开始私人电台"><Icon name="radio" :size="24" /></button>
      </div>
    </div>

    <template v-if="daily?.songs.length">
      <div class="section-title">猜你喜欢 <small>{{ daily.cold ? '近期热门' : '为你挑选' }}</small><span class="spacer" /><a @click="go('daily')">查看全部</a></div>
      <div class="guess">
        <div
          v-for="(s, i) in daily.songs.slice(0, 9)" :key="s.id" class="g-item" :class="{ on: player.song?.id == s.id }"
          @click="playDaily(i)" @contextmenu="openSongMenu($event, s, { recommend: true, play: () => playDaily(i) })"
        >
          <Cover :src="s.img" :text="s.name" :size="52" :radius="10" />
          <div class="t">
            <div class="name ellipsis">{{ s.name }}</div>
            <div class="singer ellipsis">{{ s.singer }}</div>
            <div class="reason ellipsis">{{ s._reason }}</div>
          </div>
          <span class="g-play"><Icon :name="player.song?.id == s.id && player.playing ? 'pause' : 'play'" :size="16" /></span>
        </div>
      </div>
    </template>

    <template v-if="info?.forYouLists?.length">
      <div class="section-title">为你推荐的歌单 <small>根据你常听的歌手</small></div>
      <div class="card-grid"><ListCard v-for="l in info.forYouLists" :key="l.source + l.id" :list="l" /></div>
    </template>

    <template v-if="boards.length">
      <div class="section-title">排行榜<span class="spacer" /><a @click="go('boards')">全部榜单</a></div>
      <div class="boards">
        <div v-for="b in boards" :key="b.id" class="board">
          <button class="b-name" @click="go('boards', { source: b.id.split('__')[0], id: b.id })">{{ b.name }} <Icon name="forward" :size="14" /></button>
          <button v-for="(s, i) in b.songs" :key="s.id" class="b-song" :title="`${s.name} - ${s.singer}`" @click="playBoard(b, i)">
            <b :class="'n' + i">{{ i + 1 }}</b>
            <span class="ellipsis">{{ s.name }} <span class="dim">· {{ s.singer }}</span></span>
          </button>
        </div>
      </div>
    </template>

    <template v-if="info?.hotLists?.length">
      <div class="section-title">热门歌单<span class="spacer" /><a @click="go('songlists')">歌单广场</a></div>
      <div class="card-grid"><ListCard v-for="l in info.hotLists" :key="l.source + l.id" :list="l" /></div>
    </template>
    <div v-else-if="!info" class="empty"><span class="spinner" /></div>
  </Page>
</template>

<style scoped>
.notice { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; margin-bottom: 16px; border-radius: 12px; background: rgba(255, 170, 40, 0.14); color: #b06a00; text-align: left; }
:root[data-theme='dark'] .notice { color: #ffc266; }
.heroes { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; }
.hero { position: relative; height: 150px; border-radius: 20px; padding: 22px 24px; display: flex; align-items: center; gap: 18px; overflow: hidden; cursor: pointer; color: #fff; transition: transform .2s, box-shadow .2s; box-shadow: var(--shadow-sm); }
.hero:hover { transform: translateY(-3px); box-shadow: var(--shadow); }
.hero.daily { background: linear-gradient(120deg, #12cfd6 0%, #2a8bff 45%, #6a4dfc 100%); }
.hero.radio { background: linear-gradient(120deg, #7a4dfb 0%, #b04df0 55%, #ff6fa8 120%); }
.hero h2 { margin: 0 0 6px; font-size: 22px; }
.hero p { margin: 0; font-size: 13px; opacity: .88; }
.txt { min-width: 0; flex: 1; }
.date { width: 70px; height: 76px; border-radius: 16px; background: rgba(255, 255, 255, 0.2); display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(6px); flex: none; }
.date b { font-size: 30px; line-height: 1; }
.date span { font-size: 12px; margin-top: 4px; opacity: .9; }
.hero p { overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.covers { display: flex; flex: none; padding-left: 12px; }
.covers > * { margin-left: -12px; border: 2px solid rgba(255, 255, 255, 0.7); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
@media (max-width: 1250px) { .covers { display: none; } }
.hero-play { width: 52px; height: 52px; border-radius: 50%; background: rgba(255, 255, 255, 0.95); color: #2a62ff; display: flex; align-items: center; justify-content: center; flex: none; box-shadow: 0 8px 22px rgba(0, 0, 0, 0.22); transition: transform .15s; }
.hero.radio .hero-play { color: #8a46fb; }
.hero-play:hover { transform: scale(1.08); }
.waves { display: flex; align-items: center; gap: 5px; height: 60px; width: 70px; justify-content: center; flex: none; }
.waves i { width: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.85); height: 30%; }
.waves i:nth-child(2) { height: 65%; } .waves i:nth-child(3) { height: 100%; } .waves i:nth-child(4) { height: 55%; } .waves i:nth-child(5) { height: 25%; }
.waves i.on { animation: wave 1s ease-in-out infinite; transform-origin: center; }
.waves i.on:nth-child(2) { animation-delay: -.2s; } .waves i.on:nth-child(3) { animation-delay: -.4s; } .waves i.on:nth-child(4) { animation-delay: -.6s; } .waves i.on:nth-child(5) { animation-delay: -.8s; }
@keyframes wave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }

.section-title a { font-size: 13px; font-weight: 400; }
.guess { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 16px; }
.g-item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 12px; cursor: pointer; transition: background .12s; min-width: 0; }
.g-item:hover { background: var(--hover); }
.g-item.on { background: var(--active); }
.g-item.on .name { color: var(--accent); font-weight: 600; }
.g-item .t { min-width: 0; flex: 1; }
.singer { font-size: 12px; color: var(--text2); margin-top: 1px; }
.reason { font-size: 11px; color: var(--text3); margin-top: 2px; }
.g-play { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--card); color: var(--accent); opacity: 0; transition: opacity .12s; flex: none; }
.g-item:hover .g-play, .g-item.on .g-play { opacity: 1; }

.boards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.board { padding: 14px 12px 10px; border-radius: 16px; background: var(--card); border: 1px solid var(--border); min-width: 0; display: flex; flex-direction: column; }
.b-name { display: flex; align-items: center; gap: 4px; font-weight: 700; padding: 0 6px 8px; }
.b-name:hover { color: var(--accent); }
.b-song { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 6px; border-radius: 8px; text-align: left; font-size: 13px; min-width: 0; }
.b-song:hover { background: var(--hover); }
.b-song b { width: 16px; text-align: center; color: var(--text3); flex: none; }
.b-song b.n0 { color: #ff4d6d; } .b-song b.n1 { color: #ff8a3d; } .b-song b.n2 { color: #f5b301; }
@media (max-width: 1150px) {
  .guess { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .boards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
