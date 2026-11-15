<script setup lang="ts">
// 可滚动的页面容器：向子组件提供滚动元素（歌曲列表的虚拟滚动/定位要用），并在 KeepAlive 切换时恢复滚动位置
import { onActivated, provide, ref } from 'vue'

const el = ref<HTMLElement | null>(null)
let saved = 0
provide('scroller', el)
onActivated(() => { if (el.value) el.value.scrollTop = saved })
const onScroll = () => { if (el.value) saved = el.value.scrollTop }
defineExpose({ el })
</script>

<template>
  <div ref="el" class="page" @scroll.passive="onScroll">
    <slot />
  </div>
</template>
