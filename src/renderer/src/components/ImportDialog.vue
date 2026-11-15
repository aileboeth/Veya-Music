<script setup lang="ts">
// 导入其他音乐 App 的歌单：粘贴分享内容，自动识别平台 → 预览、去掉不想要的歌 → 保存
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { api, on, sourceName, type Song } from '../api'
import { addSongs, createList, lists, type MyList } from '../lists'
import { player, playSong } from '../player'
import { alertDialog, go, importDialog, toast } from '../ui'
import Icon from './Icon.vue'

const PLATFORMS = [
  { id: '', name: '自动识别' },
  { id: 'wy', name: '网易云' },
  { id: 'tx', name: 'QQ 音乐' },
  { id: 'kg', name: '酷狗' },
  { id: 'kw', name: '酷我' },
  { id: 'mg', name: '咪咕' },
]

const text = ref('')
const hint = ref('')
const busy = ref(false)
const progress = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)

// ---- 预览 ----
const step = ref<'input' | 'preview'>('input')
const result = ref<any>(null)
/** 之前导入过的同一个歌单（有的话这次只补新增的歌） */
const exist = ref<MyList | undefined>()
/** 这次可以加入的歌（已经在歌单里的不算） */
const rows = ref<Song[]>([])
const picked = ref(new Set<string>())
const name = ref('')
const filter = ref('')
const showMissing = ref(false)

const shown = computed(() => {
  const kw = filter.value.trim().toLowerCase()
  return kw ? rows.value.filter(s => `${s.name} ${s.singer} ${s.albumName ?? ''}`.toLowerCase().includes(kw)) : rows.value
})
const allPicked = computed(() => shown.value.length > 0 && shown.value.every(s => picked.value.has(s.id)))

const reset = () => {
  step.value = 'input'
  result.value = null
  exist.value = undefined
  rows.value = []
  picked.value = new Set()
  filter.value = ''
  showMissing.value = false
  progress.value = ''
}

watch(() => importDialog.show, show => {
  if (!show) return
  text.value = ''
  hint.value = ''
  reset()
  void nextTick(() => inputEl.value?.focus())
})

const off = on('import:progress', (p: { stage: string, done: number, total: number, name?: string }) => {
  if (!busy.value) return
  progress.value = p.stage == 'match' ? `正在匹配歌曲 ${p.done} / ${p.total}${p.name ? `：${p.name}` : ''}` : '正在读取歌单…'
})
onBeforeUnmount(off)

const close = () => {
  if (busy.value) void api('import.cancel').catch(() => {})
  busy.value = false
  importDialog.show = false
}

const run = async() => {
  const input = text.value.trim()
  if (!input || busy.value) return
  busy.value = true
  progress.value = '正在读取歌单…'
  try {
    const r = await api('import.playlist', input, hint.value)
    if (!busy.value) return
    if (!r.songs.length) throw new Error('歌单里的歌一首都没有匹配到')
    const old = r.source ? lists.find(l => l.source == r.source && l.sourceListId == r.sourceListId) : undefined
    const have = new Set(old?.songs.map(s => s.id))
    const seen = new Set<string>()
    const fresh = (r.songs as Song[]).filter(s => !have.has(s.id) && !seen.has(s.id) && !!seen.add(s.id))
    if (old && !fresh.length) {
      importDialog.show = false
      go('mylist', { id: old.id })
      toast(`「${old.name}」之前导入过，没有新增的歌`, 'success')
      return
    }
    // 以前从这个歌单里删掉的歌默认不勾
    const removed = new Set(old?.removed ?? [])
    result.value = r
    exist.value = old
    rows.value = fresh
    picked.value = new Set(fresh.filter(s => !removed.has(s.id)).map(s => s.id))
    name.value = old?.name ?? r.name
    step.value = 'preview'
  } catch (err: any) {
    if (busy.value && !/已取消/.test(err.message)) void alertDialog('导入失败', err.message)
  } finally {
    busy.value = false
    progress.value = ''
  }
}

const toggle = (id: string) => {
  const set = new Set(picked.value)
  if (!set.delete(id)) set.add(id)
  picked.value = set
}
const toggleAll = () => {
  const set = new Set(picked.value)
  for (const s of shown.value) allPicked.value ? set.delete(s.id) : set.add(s.id)
  picked.value = set
}

const save = () => {
  const r = result.value
  const chosen = rows.value.filter(s => picked.value.has(s.id))
  if (!chosen.length) return
  // 没勾的歌记下来：以后「同步更新」不会又把它们加回来
  const dropped = rows.value.filter(s => !picked.value.has(s.id)).map(s => s.id)
  let target = exist.value
  if (target) {
    addSongs(target.id, chosen)
    if (dropped.length) target.removed = [...new Set([...(target.removed ?? []), ...dropped])].slice(-5000)
  } else {
    target = createList(name.value || r.name, chosen, r.source ? { source: r.source, sourceListId: r.sourceListId, removed: dropped } : {})
  }
  importDialog.show = false
  go('mylist', { id: target.id })
  toast(exist.value ? `已往「${target.name}」里新增 ${chosen.length} 首` : `已从${r.platformName}导入「${target.name}」，共 ${chosen.length} 首`, 'success', 4000)
}
</script>

<template>
  <Transition name="modal">
    <div v-if="importDialog.show" class="modal-mask" @mousedown.self="close">
      <div v-if="step == 'input'" class="modal" @keydown.esc="close">
        <h3>导入歌单</h3>
        <p class="tip">
          在音乐 App 里打开歌单 →「分享」→「复制链接」，把复制到的内容整段粘贴到下面。<br>
          支持 <b>网易云音乐、QQ 音乐、酷狗、酷我、咪咕、汽水音乐</b>；其他 App 可以粘贴「歌名 - 歌手」的文本（每行一首）。
        </p>
        <textarea
          ref="inputEl" v-model="text" class="input area" :disabled="busy" spellcheck="false" maxlength="200000"
          placeholder="例如：分享歌单《我喜欢的音乐》https://music.163.com/playlist?id=123456 (来自@网易云音乐)" @keydown.ctrl.enter="run"
        />
        <div class="row gap8 plat">
          <span class="dim">平台</span>
          <button v-for="p in PLATFORMS" :key="p.id" class="chip" :class="{ on: hint == p.id }" :disabled="busy" @click="hint = p.id">{{ p.name }}</button>
        </div>
        <p class="dim small">一般保持「自动识别」即可；只有歌单 ID（或酷狗码）没有链接时才需要选平台。歌单必须是公开的。读取之后可以先预览，去掉不想要的歌再保存。</p>
        <div class="btns">
          <span v-if="busy" class="prog ellipsis"><span class="spinner" />{{ progress }}</span>
          <span class="spacer" />
          <button class="btn" @click="close">{{ busy ? '取消' : '关闭' }}</button>
          <button class="btn primary" :disabled="busy || !text.trim()" @click="run">读取歌单</button>
        </div>
      </div>

      <div v-else class="modal wide" @keydown.esc="close">
        <h3>预览歌单</h3>
        <div class="row gap8 name-row">
          <span class="dim">歌单名</span>
          <input v-model="name" class="input name-input" maxlength="60" spellcheck="false" :disabled="!!exist" />
          <span class="badge src">{{ result.platformName }}</span>
        </div>
        <p class="tip sum">
          <template v-if="exist">这个歌单之前导入过，下面是这次<b>新增的 {{ rows.length }} 首</b>。</template>
          <template v-else>共读取到 <b>{{ rows.length }}</b> 首。</template>
          把不想要的歌取消勾选，再点保存；点歌名前的 ▶ 可以先试听。
          <template v-if="result.missing.length">
            另有 {{ result.missing.length }} 首没有找到，<a class="link" @click="showMissing = !showMissing">{{ showMissing ? '收起' : '查看' }}</a>。
          </template>
        </p>
        <div v-if="showMissing" class="missing">{{ result.missing.slice(0, 300).map((m: string) => `· ${m}`).join('\n') }}</div>

        <div class="bar">
          <button class="btn small" @click="toggleAll">{{ allPicked ? '全不选' : '全选' }}</button>
          <span class="dim count">已选 {{ picked.size }} / {{ rows.length }} 首</span>
          <span class="spacer" />
          <input v-model="filter" class="input find" placeholder="在歌单中查找" spellcheck="false" />
        </div>
        <div class="songs">
          <div v-for="(s, i) in shown" :key="s.id" class="item" :class="{ off: !picked.has(s.id) }" @click="toggle(s.id)">
            <span class="check" :class="{ on: picked.has(s.id) }"><Icon v-if="picked.has(s.id)" name="check" :size="12" /></span>
            <button class="icon-btn try" :class="{ on: player.song?.id == s.id }" title="试听" @click.stop="playSong(s)"><Icon name="play" :size="14" /></button>
            <span class="idx">{{ i + 1 }}</span>
            <span class="n ellipsis">{{ s.name }}</span>
            <span class="a ellipsis">{{ s.singer }}</span>
            <span class="badge src">{{ sourceName(s.source) }}</span>
            <span class="d">{{ s.interval || '--:--' }}</span>
          </div>
          <div v-if="!shown.length" class="none">没有找到「{{ filter }}」</div>
        </div>

        <div class="btns">
          <button class="btn" @click="reset">返回</button>
          <span class="spacer" />
          <button class="btn" @click="close">取消</button>
          <button class="btn primary" :disabled="!picked.size" @click="save">{{ exist ? `添加 ${picked.size} 首到歌单` : `保存 ${picked.size} 首到我的歌单` }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-mask { position: fixed; inset: 0; z-index: 119; background: rgba(10, 14, 30, 0.35); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
.modal { width: 560px; max-width: calc(100vw - 40px); padding: 24px; border-radius: 18px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); }
.modal.wide { width: 760px; display: flex; flex-direction: column; max-height: calc(100vh - 60px); }
.modal h3 { margin: 0 0 10px; font-size: 17px; }
.tip { margin: 0 0 14px; color: var(--text2); line-height: 1.75; font-size: 13px; }
.area { width: 100%; height: 130px; padding: 10px 12px; resize: vertical; line-height: 1.6; font-family: inherit; }
.plat { margin-top: 12px; flex-wrap: wrap; align-items: center; }
.small { font-size: 12px; margin: 8px 0 0; line-height: 1.6; }
.btns { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.prog { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text2); min-width: 0; }

.name-row { align-items: center; margin-bottom: 10px; }
.name-input { flex: 1; height: 34px; padding: 0 12px; }
.sum { margin-bottom: 10px; }
.link { color: var(--accent); cursor: pointer; }
.missing { max-height: 110px; overflow: auto; margin-bottom: 10px; padding: 8px 12px; border-radius: 10px; background: var(--hover); color: var(--text2); font-size: 12px; line-height: 1.7; white-space: pre-wrap; user-select: text; }
.bar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.count { font-size: 13px; }
.find { width: 200px; height: 30px; padding: 0 12px; }
.songs { flex: 1; min-height: 160px; overflow: auto; border: 1px solid var(--border); border-radius: 12px; padding: 4px; }
.item { display: grid; grid-template-columns: 22px 28px 30px minmax(0, 1fr) minmax(0, 0.55fr) auto 46px; align-items: center; gap: 8px; height: 38px; padding: 0 10px 0 8px; border-radius: 8px; cursor: pointer; font-size: 13px; content-visibility: auto; contain-intrinsic-size: auto 38px; }
.item:hover { background: var(--hover); }
.item.off .n, .item.off .a { color: var(--text3); text-decoration: line-through; }
.check { width: 18px; height: 18px; border-radius: 5px; border: 1.500px solid var(--text3); display: flex; align-items: center; justify-content: center; color: #fff; }
.check.on { background: var(--accent); border-color: var(--accent); }
.try { width: 26px; height: 26px; }
.idx { color: var(--text3); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.a { color: var(--text2); }
.d { color: var(--text3); text-align: right; font-variant-numeric: tabular-nums; }
.none { padding: 30px; text-align: center; color: var(--text3); }

.modal-enter-active, .modal-leave-active { transition: opacity .18s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
