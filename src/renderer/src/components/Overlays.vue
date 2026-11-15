<script setup lang="ts">
// 全局弹层：轻提示、右键菜单、对话框、「添加到歌单」
import { nextTick, ref, watch } from 'vue'
import { addSongs, createList, lists } from '../lists'
import { closeDialog, closeMenu, dialog, listPicker, menu, toast, toasts, type MenuItem } from '../ui'
import Icon from './Icon.vue'

// ----- 右键菜单：防止超出窗口 -----
const menuEl = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })
watch(() => [menu.show, menu.x, menu.y], () => {
  if (!menu.show) return
  pos.value = { x: menu.x, y: menu.y }
  void nextTick(() => {
    const el = menuEl.value
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    pos.value = {
      x: Math.max(8, Math.min(menu.x, window.innerWidth - w - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - h - 8)),
    }
  })
})
const runItem = (item: MenuItem) => {
  if (item.disabled) return
  closeMenu()
  item.action?.()
}

// ----- 对话框 -----
const inputEl = ref<HTMLInputElement | null>(null)
watch(() => dialog.show, show => {
  if (show && dialog.type == 'prompt') void nextTick(() => { inputEl.value?.focus(); inputEl.value?.select() })
})
const ok = () => closeDialog(dialog.type == 'prompt' ? dialog.value.trim() || null : true)

// ----- 添加到歌单 -----
const addTo = (listId: string, name: string) => {
  const n = addSongs(listId, listPicker.songs)
  toast(n ? `已添加 ${n} 首到「${name}」` : `歌曲已在「${name}」中`, n ? 'success' : 'info')
  listPicker.show = false
}
const newListName = ref('')
const createAndAdd = () => {
  const name = newListName.value.trim()
  if (!name) return
  const list = createList(name)
  newListName.value = ''
  addTo(list.id, list.name)
}
</script>

<template>
  <!-- 轻提示 -->
  <TransitionGroup name="toast" tag="div" class="toasts">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.text }}</div>
  </TransitionGroup>

  <!-- 右键菜单 -->
  <div v-if="menu.show" class="menu-mask" @mousedown="closeMenu" @contextmenu.prevent="closeMenu" />
  <Transition name="menu">
    <div v-if="menu.show" ref="menuEl" class="menu" :style="{ left: pos.x + 'px', top: pos.y + 'px' }">
      <template v-for="(item, i) in menu.items" :key="i">
        <div v-if="item.divider" class="divider" />
        <button v-else class="item" :class="{ danger: item.danger, disabled: item.disabled }" @click="runItem(item)">
          <span class="ic"><Icon v-if="item.icon" :name="item.icon" :size="16" /></span>
          <span class="ellipsis">{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Transition>

  <!-- 对话框 -->
  <Transition name="modal">
    <div v-if="dialog.show" class="modal-mask" @mousedown.self="closeDialog(null)">
      <div class="modal" @keydown.enter="ok" @keydown.esc="closeDialog(null)">
        <h3>{{ dialog.title }}</h3>
        <p v-if="dialog.message" class="msg">{{ dialog.message }}</p>
        <input v-if="dialog.type == 'prompt'" ref="inputEl" v-model="dialog.value" class="input" :placeholder="dialog.placeholder" maxlength="200" spellcheck="false" />
        <div class="btns">
          <button v-if="dialog.type != 'alert'" class="btn" @click="closeDialog(null)">取消</button>
          <button class="btn primary" :class="{ 'danger-bg': dialog.danger }" @click="ok">{{ dialog.okText }}</button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- 添加到歌单 -->
  <Transition name="modal">
    <div v-if="listPicker.show" class="modal-mask" @mousedown.self="listPicker.show = false">
      <div class="modal picker" @keydown.esc="listPicker.show = false">
        <h3>添加到歌单 <small class="dim">{{ listPicker.songs.length }} 首</small></h3>
        <div class="list">
          <button v-for="l in lists" :key="l.id" class="pick" @click="addTo(l.id, l.name)">
            <span class="pic" :class="{ love: l.id == 'love' }"><Icon :name="l.id == 'love' ? 'heart-fill' : 'music'" :size="17" /></span>
            <span class="ellipsis">{{ l.name }}</span>
            <span class="spacer" />
            <small class="dim">{{ l.songs.length }} 首</small>
          </button>
        </div>
        <div class="new">
          <input v-model="newListName" class="input" placeholder="新建歌单并添加" maxlength="60" spellcheck="false" @keydown.enter.stop="createAndAdd" />
          <button class="btn primary" :disabled="!newListName.trim()" @click="createAndAdd">新建</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toasts { position: fixed; left: 0; right: 0; bottom: 100px; z-index: 200; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
.toast { max-width: 560px; padding: 10px 18px; border-radius: 12px; background: rgba(28, 33, 50, 0.92); color: #fff; font-size: 13px; box-shadow: var(--shadow); backdrop-filter: blur(12px); line-height: 1.5; }
.toast.error { background: rgba(190, 40, 50, 0.94); }
.toast.success { background: linear-gradient(90deg, rgba(20, 150, 190, 0.96), rgba(60, 90, 235, 0.96)); }
.toast-enter-active, .toast-leave-active { transition: all .25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px); }

.menu-mask { position: fixed; inset: 0; z-index: 150; }
.menu { position: fixed; z-index: 151; min-width: 190px; max-width: 280px; padding: 6px; border-radius: 12px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); backdrop-filter: blur(30px); }
.item { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 10px 0 6px; border-radius: 8px; text-align: left; font-size: 13px; }
.item:hover { background: var(--active); color: var(--accent); }
.item.danger { color: var(--danger); }
.item.danger:hover { background: rgba(229, 72, 77, 0.12); color: var(--danger); }
.item.disabled { opacity: .4; pointer-events: none; }
.ic { width: 20px; display: flex; justify-content: center; flex: none; }
.divider { height: 1px; background: var(--border); margin: 5px 8px; }
.menu-enter-active { transition: opacity .12s, transform .12s; }
.menu-enter-from { opacity: 0; transform: scale(0.96); }

.modal-mask { position: fixed; inset: 0; z-index: 120; background: rgba(10, 14, 30, 0.35); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
.modal { width: 400px; max-width: calc(100vw - 40px); padding: 24px; border-radius: 18px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); }
.modal h3 { margin: 0 0 12px; font-size: 17px; }
.modal h3 small { font-size: 12px; font-weight: 400; margin-left: 6px; }
.msg { margin: 0 0 14px; color: var(--text2); line-height: 1.7; white-space: pre-wrap; user-select: text; max-height: 50vh; overflow-y: auto; }
.modal .input { width: 100%; }
.btns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.danger-bg { background: linear-gradient(90deg, #f0555b, #d93a55) !important; box-shadow: 0 6px 18px rgba(229, 72, 77, 0.3) !important; }
.picker .list { max-height: 320px; overflow-y: auto; margin: 0 -8px; }
.pick { display: flex; align-items: center; gap: 12px; width: 100%; height: 48px; padding: 0 10px; border-radius: 10px; text-align: left; }
.pick:hover { background: var(--hover); }
.pic { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: var(--grad-soft); color: var(--accent); flex: none; }
.pic.love { color: #ff4d6d; background: rgba(255, 77, 109, 0.12); }
.new { display: flex; gap: 10px; margin-top: 14px; }
.modal-enter-active, .modal-leave-active { transition: opacity .18s; }
.modal-enter-active .modal, .modal-leave-active .modal { transition: transform .18s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal, .modal-leave-to .modal { transform: scale(0.96); }
</style>
