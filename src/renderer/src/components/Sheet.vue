<script setup lang="ts">
// 底部弹出面板（手机）/ 居中小窗（电脑）
defineProps<{ show: boolean, title?: string, glass?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="sheet">
    <div v-if="show" class="sheet-mask" @click.self="emit('close')">
      <div class="sheet" :class="{ glass }">
        <div class="grip" />
        <div v-if="title" class="sheet-title">{{ title }}</div>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-mask { position: fixed; inset: 0; z-index: 140; background: rgba(8, 12, 26, 0.38); display: flex; align-items: center; justify-content: center; }
.sheet { width: 420px; max-width: calc(100vw - 40px); max-height: 80vh; overflow-y: auto; padding: 18px 18px 20px; border-radius: 20px; background: var(--panel-strong); border: 1px solid var(--border); box-shadow: var(--shadow); backdrop-filter: blur(30px); }
.grip { display: none; }
.sheet-title { font-size: 16px; font-weight: 700; margin: 2px 4px 12px; }
.sheet-enter-active, .sheet-leave-active { transition: opacity .2s; }
.sheet-enter-active .sheet, .sheet-leave-active .sheet { transition: transform .26s cubic-bezier(.2, .8, .2, 1); }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .sheet, .sheet-leave-to .sheet { transform: scale(0.96); }

:root.mobile .sheet-mask { align-items: flex-end; }
:root.mobile .sheet { width: 100%; max-width: none; max-height: 86vh; border-radius: 22px 22px 0 0; padding: 8px 16px calc(var(--safe-bottom, 0px) + 16px); border-left: 0; border-right: 0; border-bottom: 0; }
:root.mobile .grip { display: block; width: 38px; height: 4px; border-radius: 2px; background: var(--text3); opacity: .5; margin: 4px auto 10px; }
:root.mobile .sheet-enter-from .sheet, :root.mobile .sheet-leave-to .sheet { transform: translateY(100%); }
</style>
