<script setup lang="ts">
// 歌曲列表：虚拟滚动（几千首也流畅）、列表内筛选、高亮并「定位」正在播放的歌曲
import { computed, inject, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { bestQuality, qualityLabel, sourceName, type Song } from '../api'
import { isLoved, removeSongs, toggleLove } from '../lists'
import { confirmDialog, toast } from '../ui'
import { addNext, player, playList, toggle, type QueueSource } from '../player'
import { dislike, openSongMenu } from '../songMenu'
import { isAndroid } from '../platform'
import Cover from './Cover.vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{
  songs: Song[]
  source?: QueueSource | null
  listId?: string
  recommend?: boolean
  showSource?: boolean
  showToolbar?: boolean
  emptyText?: string
  /** 值变化（且非空）时自动定位到正在播放的歌曲 */
  locateKey?: any
}>(), { source: null, showToolbar: true, emptyText: '这里还没有歌曲' })
const emit = defineEmits<{ removed: [] }>()

const ROW_H = 54
const scroller = inject<Ref<HTMLElement | null>>('scroller', ref(null))
const root = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewH = ref(800)
const listTop = ref(0)
const filter = ref('')
const flashId = ref('')

const filtered = computed(() => {
  const kw = filter.value.trim().toLowerCase()
  const list = props.songs.map((song, index) => ({ song, index }))
  if (!kw) return list
  return list.filter(({ song }) => `${song.name} ${song.singer} ${song.albumName}`.toLowerCase().includes(kw))
})

const range = computed(() => {
  const start = Math.max(0, Math.floor((scrollTop.value - listTop.value) / ROW_H) - 6)
  const end = Math.min(filtered.value.length, Math.ceil((scrollTop.value - listTop.value + viewH.value) / ROW_H) + 6)
  return { start, end: Math.max(start, end) }
})
const visible = computed(() => filtered.value.slice(range.value.start, range.value.end))

/** 正在播放的歌在当前（筛选后）列表里的位置 */
const playingPos = computed(() => {
  const id = player.song?.id
  if (!id) return -1
  return filtered.value.findIndex(r => r.song.id == id)
})
const playingInList = computed(() => !!player.song && props.songs.some(s => s.id == player.song!.id))
/** 正在播放的那一行当前是否在可视区域内 */
const playingVisible = computed(() => {
  if (playingPos.value < 0) return false
  const y = listTop.value + playingPos.value * ROW_H
  return y + ROW_H > scrollTop.value && y < scrollTop.value + viewH.value
})

const measure = () => {
  const sc = scroller.value
  if (!sc || !body.value) return
  scrollTop.value = sc.scrollTop
  viewH.value = sc.clientHeight
  listTop.value = body.value.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop
}
const onScroll = () => { if (scroller.value) scrollTop.value = scroller.value.scrollTop }

let ro: ResizeObserver | null = null
onMounted(() => {
  const sc = scroller.value
  if (!sc) return
  sc.addEventListener('scroll', onScroll, { passive: true })
  ro = new ResizeObserver(measure)
  ro.observe(sc)
  if (root.value?.parentElement) ro.observe(root.value.parentElement)
  measure()
  if (props.locateKey) void nextTick(() => locate(false))
})
onActivated(() => void nextTick(measure))
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('scroll', onScroll)
  ro?.disconnect()
})
watch(() => [props.songs.length, filter.value], () => void nextTick(measure))

const locate = (smooth = true) => {
  if (playingPos.value < 0 && filter.value) filter.value = ''
  void nextTick(() => {
    measure()
    const sc = scroller.value
    const pos = playingPos.value
    if (!sc || pos < 0) return
    const top = Math.max(0, listTop.value + pos * ROW_H - viewH.value / 2 + ROW_H / 2)
    sc.scrollTo({ top, behavior: smooth && Math.abs(top - sc.scrollTop) < 6000 ? 'smooth' : 'auto' })
    flashId.value = player.song!.id
    setTimeout(() => { flashId.value = '' }, 1800)
  })
}
watch(() => props.locateKey, v => { if (v) locate(false) })
// 列表数据是异步加载的：数据到达后补一次定位
watch(() => props.songs.length, (n, o) => { if (props.locateKey && n && !o) locate(false) })
defineExpose({ locate })

const play = (index: number) => {
  const song = props.songs[index]
  if (player.song?.id == song.id && player.queue.length == props.songs.length && player.source?.name == props.source?.name) return toggle()
  playList(props.songs, index, props.source)
}
const onMenu = (e: MouseEvent, song: Song, index: number) => {
  if (manage.value) return e.preventDefault()
  openSongMenu(e, song, { listId: props.listId, recommend: props.recommend, play: () => play(index), onRemoved: () => emit('removed') })
}

// ---- 我的歌单：删除单首 / 批量管理 ----
const manage = ref(false)
const picked = ref(new Set<string>())
const allPicked = computed(() => filtered.value.length > 0 && filtered.value.every(r => picked.value.has(r.song.id)))
const togglePick = (id: string) => {
  const set = new Set(picked.value)
  if (!set.delete(id)) set.add(id)
  picked.value = set
}
const pickAll = () => {
  const set = new Set(picked.value)
  for (const r of filtered.value) allPicked.value ? set.delete(r.song.id) : set.add(r.song.id)
  picked.value = set
}
const exitManage = () => {
  manage.value = false
  picked.value = new Set()
}
const removeOne = (song: Song) => {
  removeSongs(props.listId!, [song.id])
  toast(`已从歌单删除《${song.name}》`)
  emit('removed')
}
const removePicked = async() => {
  const ids = [...picked.value]
  if (!ids.length) return
  if (!await confirmDialog(`从歌单删除选中的 ${ids.length} 首歌？`, '只是从这个歌单里移除，不会删除下载的文件。', { okText: '删除', danger: true })) return
  removeSongs(props.listId!, ids)
  toast(`已删除 ${ids.length} 首`, 'success')
  exitManage()
  emit('removed')
}
// 手机上点一下就播放（电脑上是双击）
const onRowClick = (song: Song, index: number) => {
  if (manage.value) togglePick(song.id)
  else if (isAndroid) play(index)
}
const onRowDbl = (index: number) => { if (!manage.value) play(index) }
watch(() => props.listId, exitManage)
</script>

<template>
  <div ref="root" class="song-list">
    <div v-if="showToolbar && songs.length" class="toolbar">
      <slot name="toolbar" />
      <template v-if="listId && manage">
        <button class="btn small" @click="pickAll">{{ allPicked ? '取消全选' : '全选' }}</button>
        <button class="btn small danger" :disabled="!picked.size" @click="removePicked"><Icon name="trash" :size="14" />删除所选（{{ picked.size }}）</button>
        <button class="btn small" @click="exitManage">完成</button>
      </template>
      <button v-else-if="listId" class="btn small" title="勾选多首歌一起删除" @click="manage = true"><Icon name="edit" :size="14" />批量管理</button>
      <span class="spacer" />
      <span class="dim count">{{ filter ? `${filtered.length} / ${songs.length}` : songs.length }} 首</span>
      <div class="filter">
        <Icon name="search" :size="15" />
        <input v-model="filter" placeholder="在列表中查找" spellcheck="false" />
        <button v-if="filter" class="clear" @click="filter = ''"><Icon name="close" :size="13" /></button>
      </div>
    </div>

    <div v-if="songs.length" class="head">
      <span class="c-idx">#</span>
      <span>歌曲</span>
      <span>歌手</span>
      <span>专辑</span>
      <span class="c-time">时长</span>
    </div>

    <div ref="body" class="body" :style="{ height: filtered.length * ROW_H + 'px' }">
      <div class="rows" :style="{ transform: `translateY(${range.start * ROW_H}px)` }">
        <div
          v-for="(row, i) in visible" :key="row.song.id"
          class="song-row" :class="{ playing: player.song?.id == row.song.id, flash: flashId == row.song.id, managing: manage, picked: manage && picked.has(row.song.id) }"
          @click="onRowClick(row.song, row.index)" @dblclick="onRowDbl(row.index)" @contextmenu="onMenu($event, row.song, row.index)"
        >
          <div class="c-idx">
            <span v-if="manage" class="check" :class="{ on: picked.has(row.song.id) }"><Icon v-if="picked.has(row.song.id)" name="check" :size="12" /></span>
            <span v-else-if="player.song?.id == row.song.id" class="eq" :class="{ paused: !player.playing }"><i /><i /><i /></span>
            <template v-else>
              <span class="num">{{ range.start + i + 1 }}</span>
              <button class="play-btn" title="播放" @click="play(row.index)"><Icon name="play" :size="15" /></button>
            </template>
          </div>
          <div class="c-title">
            <Cover :src="row.song.img" :text="row.song.name" :size="38" :radius="7" />
            <div class="t">
              <div class="name ellipsis">{{ row.song.name }}</div>
              <div class="sub">
                <span v-if="bestQuality(row.song)" class="badge" :class="'q-' + bestQuality(row.song)">{{ qualityLabel[bestQuality(row.song)] }}</span>
                <span v-if="showSource" class="badge src">{{ sourceName(row.song.source) }}</span>
                <span class="m-singer ellipsis">{{ row.song.singer }}<template v-if="row.song.albumName"> · {{ row.song.albumName }}</template></span>
                <span v-if="row.song._reason" class="reason ellipsis">{{ row.song._reason }}</span>
              </div>
            </div>
            <div v-if="!manage" class="actions">
              <button v-if="listId" class="icon-btn del" title="从歌单删除" @click.stop="removeOne(row.song)"><Icon name="trash" :size="16" /></button>
              <button class="icon-btn" :class="{ loved: isLoved(row.song) }" :title="isLoved(row.song) ? '取消喜欢' : '喜欢'" @click.stop="toggleLove(row.song)">
                <Icon :name="isLoved(row.song) ? 'heart-fill' : 'heart'" :size="16" />
              </button>
              <button v-if="recommend" class="icon-btn" title="不喜欢，以后不再推荐" @click.stop="dislike(row.song).then(() => emit('removed'))"><Icon name="ban" :size="16" /></button>
              <button class="icon-btn" title="下一首播放" @click.stop="addNext([row.song])"><Icon name="playnext" :size="16" /></button>
              <button class="icon-btn more-btn" title="更多" @click.stop="onMenu($event, row.song, row.index)"><Icon name="more" :size="16" /></button>
            </div>
          </div>
          <div class="c-singer ellipsis">{{ row.song.singer }}</div>
          <div class="c-album ellipsis">{{ row.song.albumName }}</div>
          <div class="c-time">{{ row.song.interval || '--:--' }}</div>
        </div>
      </div>
    </div>

    <div v-if="!songs.length" class="empty"><slot name="empty">{{ emptyText }}</slot></div>
    <div v-else-if="!filtered.length" class="empty">没有找到「{{ filter }}」</div>

    <!-- 定位正在播放的歌曲 -->
    <div class="locate-wrap">
      <Transition name="pop">
        <button v-if="playingInList && !playingVisible" class="locate-btn" title="定位到正在播放的歌曲" @click="locate()">
          <Icon name="locate" :size="17" />
          <span class="ellipsis">正在播放：{{ player.song?.name }}</span>
        </button>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.song-list { position: relative; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; min-height: 34px; }
.count { font-size: 13px; }
.filter { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border-radius: 16px; background: var(--card); border: 1px solid var(--border); color: var(--text3); width: 190px; transition: all .15s; }
.filter:focus-within { border-color: var(--accent); width: 240px; color: var(--text); }
.filter input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; user-select: text; }
.filter .clear { display: flex; color: var(--text3); }

.head, .song-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) minmax(0, 0.42fr) minmax(0, 0.38fr) 58px; align-items: center; gap: 12px; padding: 0 12px 0 6px; }
.head { height: 32px; font-size: 12px; color: var(--text3); border-bottom: 1px solid var(--border); margin-bottom: 4px; }
.body { position: relative; }
.rows { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }
.song-row { height: 54px; border-radius: 10px; transition: background .12s; }
.song-row:hover { background: var(--hover); }
.song-row.playing { background: var(--active); }
.song-row.flash { animation: flash 1.800s ease; }
@keyframes flash {
  0%, 40% { box-shadow: inset 0 0 0 2px var(--accent); background: var(--active); }
  100% { box-shadow: inset 0 0 0 2px transparent; }
}
.c-idx { display: flex; justify-content: center; color: var(--text3); font-size: 13px; font-variant-numeric: tabular-nums; }
.c-idx .play-btn { display: none; color: var(--accent); }
.song-row:hover .c-idx .num { display: none; }
.song-row:hover .c-idx .play-btn { display: flex; }
.c-title { display: flex; align-items: center; gap: 11px; min-width: 0; }
.c-title .t { min-width: 0; flex: 1; }
.name { font-size: 14px; }
.song-row.playing .name { color: var(--accent); font-weight: 600; }
.sub { display: flex; align-items: center; gap: 5px; margin-top: 3px; min-height: 16px; }
.reason { font-size: 12px; color: var(--text3); }
.c-singer, .c-album { color: var(--text2); font-size: 13px; }
.c-time { color: var(--text3); font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
.actions { display: none; gap: 2px; flex: none; }
.song-row:hover .actions { display: flex; }
.actions .icon-btn { width: 28px; height: 28px; }
.actions .loved { color: #ff4d6d; }
.actions .del:hover { color: var(--danger); }
.toolbar .btn.small { display: inline-flex; align-items: center; gap: 5px; }
.song-row.managing { cursor: pointer; }
.song-row.picked { background: var(--active); }
.check { width: 18px; height: 18px; border-radius: 5px; border: 1.500px solid var(--text3); display: flex; align-items: center; justify-content: center; color: #fff; }
.check.on { background: var(--accent); border-color: var(--accent); }

.eq { display: flex; align-items: flex-end; gap: 2.500px; height: 15px; }
.eq i { width: 3px; border-radius: 2px; background: var(--grad); background: linear-gradient(180deg, #1f9bff, #8a46fb); animation: eq 0.900s ease-in-out infinite; }
.eq i:nth-child(1) { height: 60%; animation-delay: -0.200s; }
.eq i:nth-child(2) { height: 100%; animation-delay: -0.500s; }
.eq i:nth-child(3) { height: 45%; animation-delay: -0.700s; }
.eq.paused i { animation-play-state: paused; }
@keyframes eq { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
.eq i { transform-origin: bottom; }

.locate-wrap { position: sticky; bottom: 14px; height: 0; display: flex; justify-content: flex-end; align-items: flex-end; pointer-events: none; z-index: 5; }
.locate-btn {
  pointer-events: auto; display: flex; align-items: center; gap: 7px; max-width: 300px; height: 38px; padding: 0 16px 0 12px; border-radius: 19px;
  background: var(--panel-strong); color: var(--accent); font-weight: 600; font-size: 13px;
  border: 1px solid var(--border); box-shadow: var(--shadow); backdrop-filter: blur(16px); transform: translateY(-4px);
}
.locate-btn:hover { filter: brightness(1.05); box-shadow: 0 10px 30px rgba(42, 98, 255, 0.28); }
.pop-enter-active, .pop-leave-active { transition: opacity .2s, transform .2s; }
.pop-enter-from, .pop-leave-to { opacity: 0; transform: translateY(10px); }
.m-singer { display: none; font-size: 12px; color: var(--text3); min-width: 0; }

/* 手机：一行 = 封面 + 歌名 / 歌手，右边只留「更多」；点一下播放，长按出菜单 */
:root.mobile .song-list .head, :root.mobile .song-list .c-singer, :root.mobile .song-list .c-album, :root.mobile .song-list .c-time { display: none; }
:root.mobile .song-list .song-row { grid-template-columns: 26px minmax(0, 1fr); gap: 8px; padding: 0 0 0 0; }
:root.mobile .song-list .song-row:hover { background: none; }
:root.mobile .song-list .song-row.playing { background: var(--active); }
:root.mobile .song-list .song-row:active { background: var(--hover); }
:root.mobile .song-list .c-idx .num { display: inline !important; font-size: 12px; }
:root.mobile .song-list .c-idx .play-btn { display: none !important; }
:root.mobile .song-list .m-singer { display: inline; }
:root.mobile .song-list .reason { display: none; }
:root.mobile .song-list .actions { display: flex; }
:root.mobile .song-list .actions .icon-btn:not(.more-btn) { display: none; }
:root.mobile .song-list .actions .more-btn { width: 40px; height: 40px; color: var(--text3); }
:root.mobile .song-list .name { font-size: 15px; }
:root.mobile .song-list .toolbar { flex-wrap: wrap; }
:root.mobile .song-list .filter { width: auto; flex: 1; min-width: 140px; height: 36px; border-radius: 18px; }
:root.mobile .song-list .filter:focus-within { width: auto; }
:root.mobile .song-list .count { display: none; }
:root.mobile .song-list .locate-btn { max-width: 70vw; }
</style>
