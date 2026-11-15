<script setup lang="ts">
// 导入其他音乐 App 的歌单：粘贴分享内容，自动识别平台
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { api, on } from '../api'
import { addSongs, createList, lists } from '../lists'
import { alertDialog, go, importDialog, toast } from '../ui'

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

watch(() => importDialog.show, show => {
  if (!show) return
  text.value = ''
  hint.value = ''
  progress.value = ''
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
    // 已经导入过同一个歌单：只把新增的歌补进去
    const exist = r.source ? lists.find(l => l.source == r.source && l.sourceListId == r.sourceListId) : undefined
    let target = exist
    let added = r.songs.length
    if (exist) added = addSongs(exist.id, r.songs)
    else target = createList(r.name, r.songs, r.source ? { source: r.source, sourceListId: r.sourceListId } : {})
    busy.value = false
    importDialog.show = false
    go('mylist', { id: target!.id })
    if (r.missing.length) {
      void alertDialog(
        `已导入 ${r.songs.length} / ${r.total} 首，${r.missing.length} 首没有找到`,
        `歌单「${target!.name}」里没有匹配到下面这些歌（各平台都搜不到，或者版本、时长对不上）：\n\n${r.missing.slice(0, 200).map((m: string) => `· ${m}`).join('\n')}`,
      )
    } else if (exist) toast(added ? `「${exist.name}」之前导入过，这次新增 ${added} 首` : `「${exist.name}」之前导入过，没有新增的歌`, 'success')
    else toast(`已从${r.platformName}导入「${target!.name}」，共 ${r.songs.length} 首`, 'success')
  } catch (err: any) {
    if (busy.value) progress.value = ''
    if (busy.value && !/已取消/.test(err.message)) void alertDialog('导入失败', err.message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Transition name="modal">
    <div v-if="importDialog.show" class="modal-mask" @mousedown.self="close">
      <div class="modal" @keydown.esc="close">
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
        <p class="dim small">一般保持「自动识别」即可；只有歌单 ID（或酷狗码）没有链接时才需要选平台。歌单必须是公开的。</p>
        <div class="btns">
          <span v-if="busy" class="prog ellipsis"><span class="spinner" />{{ progress }}</span>
          <span class="spacer" />
          <button class="btn" @click="close">{{ busy ? '取消' : '关闭' }}</button>
          <button class="btn primary" :disabled="busy || !text.trim()" @click="run">导入</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-mask { position: fixed; inset: 0; z-index: 119; background: rgba(10, 14, 30, 0.35); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
.modal { width: 560px; max-width: calc(100vw - 40px); padding: 24px; border-radius: 18px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); }
.modal h3 { margin: 0 0 10px; font-size: 17px; }
.tip { margin: 0 0 14px; color: var(--text2); line-height: 1.75; font-size: 13px; }
.area { width: 100%; height: 130px; padding: 10px 12px; resize: vertical; line-height: 1.6; font-family: inherit; }
.plat { margin-top: 12px; flex-wrap: wrap; align-items: center; }
.small { font-size: 12px; margin: 8px 0 0; line-height: 1.6; }
.btns { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.prog { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text2); min-width: 0; }
.modal-enter-active, .modal-leave-active { transition: opacity .18s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
