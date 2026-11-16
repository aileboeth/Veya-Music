<script setup lang="ts">
// 播放队列抽屉：打开时自动滚动到正在播放的歌曲
import { computed, nextTick, ref, watch } from 'vue'
import { clearQueue, player, playQueueIndex, removeFromQueue } from '../player'
import { openSongMenu } from '../songMenu'
import { go, pickListFor } from '../ui'
import Icon from './Icon.vue'

const ROW_H = 50
const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewH = ref(600)

const range = computed(() => {
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_H) - 5)
  const end = Math.min(player.queue.length, Math.ceil((scrollTop.value + viewH.value) / ROW_H) + 5)
  return { start, end }
})
const visible = computed(() => player.queue.slice(range.value.start, range.value.end).map((song, i) => ({ song, index: range.value.start + i })))

const locate = (smooth = false) => {
  const el = scroller.value
  if (!el || player.index < 0) return
  viewH.value = el.clientHeight
  el.scrollTo({ top: Math.max(0, player.index * ROW_H - el.clientHeight / 2 + ROW_H / 2), behavior: smooth ? 'smooth' : 'auto' })
}
watch(() => player.showQueue, show => { if (show) void nextTick(() => locate()) })

const gotoSource = () => {
  const route = player.source?.route
  if (!route) return
  player.showQueue = false
  player.showNowPlaying = false
  go(route.name, { ...route.params, _locate: Date.now() })
}
</script>

<template>
  <Transition name="fade">
    <div v-if="player.showQueue" class="mask" @click="player.showQueue = false" />
  </Transition>
  <Transition name="slide">
    <aside v-if="player.showQueue" class="queue">
      <header>
        <div>
          <div class="title">播放队列 <small>{{ player.queue.length }} 首</small></div>
          <button v-if="player.source" class="from ellipsis" :disabled="!player.source.route" @click="gotoSource">
            {{ player.radio ? '电台' : '来自' }}：{{ player.source.name }}
          </button>
        </div>
        <span class="spacer" />
        <button class="icon-btn" title="定位到正在播放" :disabled="player.index < 0" @click="locate(true)"><Icon name="locate" /></button>
        <button class="icon-btn" title="全部添加到歌单" :disabled="!player.queue.length" @click="pickListFor(player.queue)"><Icon name="plus" /></button>
        <button class="icon-btn" title="清空队列" :disabled="!player.queue.length" @click="clearQueue"><Icon name="trash" /></button>
      </header>
      <div ref="scroller" class="scroll" @scroll.passive="scrollTop = scroller!.scrollTop">
        <div :style="{ height: player.queue.length * ROW_H + 'px', position: 'relative' }">
          <div class="rows" :style="{ transform: `translateY(${range.start * ROW_H}px)` }">
            <div
              v-for="row in visible" :key="row.song.id" class="q-row" :class="{ current: row.index == player.index }"
              @dblclick="playQueueIndex(row.index)" @contextmenu="openSongMenu($event, row.song, { recommend: !!row.song._rec, play: () => playQueueIndex(row.index) })"
            >
              <span class="idx">
                <span v-if="row.index == player.index" class="dot" />
                <template v-else>{{ row.index + 1 }}</template>
              </span>
              <div class="t" @click="playQueueIndex(row.index)">
                <div class="name ellipsis">{{ row.song.name }}</div>
                <div class="singer ellipsis">{{ row.song.singer }}</div>
              </div>
              <span class="time">{{ row.song.interval }}</span>
              <button class="icon-btn rm" title="从队列移除" @click.stop="removeFromQueue(row.index)"><Icon name="close" :size="14" /></button>
            </div>
          </div>
        </div>
        <div v-if="!player.queue.length" class="empty">队列是空的<br>去发现页找点想听的吧</div>
        <div v-else-if="player.radio || player.extending" class="tail dim">
          <span v-if="player.extending" class="spinner" style="width:14px;height:14px" />
          {{ player.extending ? '正在寻找相似歌曲…' : '电台模式：快播完时会自动补充相似歌曲' }}
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.mask { position: absolute; inset: 0; z-index: 24; }
.queue {
  position: absolute; right: 12px; top: 52px; bottom: 90px; width: 380px; z-index: 25; display: flex; flex-direction: column;
  background: var(--panel-strong); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); backdrop-filter: blur(30px); overflow: hidden;
}
header { display: flex; align-items: center; gap: 4px; padding: 16px 12px 10px 18px; }
.title { font-size: 17px; font-weight: 700; }
.title small { font-size: 12px; font-weight: 400; color: var(--text3); margin-left: 4px; }
.from { display: block; max-width: 190px; font-size: 12px; color: var(--text3); margin-top: 2px; text-align: left; }
.from:not(:disabled):hover { color: var(--accent); }
.from:disabled { cursor: default; }
.scroll { flex: 1; overflow-y: auto; padding: 0 8px 10px; }
.rows { position: absolute; left: 0; right: 0; top: 0; }
.q-row { height: 50px; display: flex; align-items: center; gap: 10px; padding: 0 6px 0 4px; border-radius: 10px; }
.q-row:hover { background: var(--hover); }
.q-row.current { background: var(--active); }
.q-row.current .name { color: var(--accent); font-weight: 600; }
.idx { width: 34px; text-align: center; font-size: 12px; color: var(--text3); flex: none; display: flex; justify-content: center; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--grad); box-shadow: 0 0 8px var(--accent); }
.t { flex: 1; min-width: 0; cursor: pointer; }
.name { font-size: 13.500px; }
.singer { font-size: 12px; color: var(--text3); margin-top: 1px; }
.time { font-size: 12px; color: var(--text3); font-variant-numeric: tabular-nums; }
.rm { width: 26px; height: 26px; visibility: hidden; }
.q-row:hover .rm { visibility: visible; }
.q-row:hover .time { display: none; }
.tail { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; padding: 14px 0 6px; }
.empty { line-height: 1.8; }
.slide-enter-active, .slide-leave-active { transition: transform .22s ease, opacity .22s; }
.slide-enter-from, .slide-leave-to { transform: translateX(30px); opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 手机：从底部弹出的面板，盖在播放页上面 */
:root.mobile .mask { position: fixed; z-index: 70; background: rgba(8, 12, 26, 0.4); }
:root.mobile .queue { position: fixed; left: 0; right: 0; top: auto; bottom: 0; width: auto; height: 72vh; z-index: 71; border-radius: 22px 22px 0 0; border-bottom: 0; padding-bottom: var(--safe-bottom, 0px); }
:root.mobile .rm { visibility: visible; width: 36px; height: 36px; }
:root.mobile .q-row .time { display: none; }
:root.mobile .q-row:hover { background: none; }
:root.mobile .q-row.current { background: var(--active); }
:root.mobile .name { font-size: 15px; }
:root.mobile .slide-enter-from, :root.mobile .slide-leave-to { transform: translateY(100%); opacity: 1; }
</style>
