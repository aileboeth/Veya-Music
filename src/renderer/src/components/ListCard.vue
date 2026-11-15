<script setup lang="ts">
import { sourceName } from '../api'
import { go } from '../ui'
import Cover from './Cover.vue'
import Icon from './Icon.vue'

const props = defineProps<{ list: any }>()
const open = () => go('listdetail', { source: props.list.source, id: String(props.list.id), name: props.list.name, img: props.list.img ?? '' })
</script>

<template>
  <button class="list-card" :title="list.name" @click="open">
    <div class="pic">
      <Cover :src="list.img" :text="list.name" :size="150" :radius="14" :px="300" class="c" />
      <span v-if="list.play_count" class="count"><Icon name="play" :size="10" />{{ list.play_count }}</span>
      <span class="src">{{ sourceName(list.source) }}</span>
      <span class="go"><Icon name="play" :size="20" /></span>
    </div>
    <div class="name">{{ list.name }}</div>
    <div v-if="list._reason || list.author" class="sub ellipsis">{{ list._reason || list.author }}</div>
  </button>
</template>

<style scoped>
.list-card { display: flex; flex-direction: column; text-align: left; min-width: 0; animation: fade-in .3s ease both; }
.pic { position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-sm); transition: transform .2s, box-shadow .2s; }
.pic .c { width: 100% !important; height: 100% !important; }
.list-card:hover .pic { transform: translateY(-4px); box-shadow: var(--shadow); }
.count, .src { position: absolute; top: 8px; display: flex; align-items: center; gap: 3px; height: 20px; padding: 0 7px; border-radius: 10px; background: rgba(0, 0, 0, 0.42); color: #fff; font-size: 11px; backdrop-filter: blur(6px); }
.count { right: 8px; }
.src { left: 8px; }
.go { position: absolute; right: 10px; bottom: 10px; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.92); color: #2a62ff; opacity: 0; transform: translateY(6px); transition: all .2s; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); }
.list-card:hover .go { opacity: 1; transform: none; }
.name { margin-top: 9px; font-size: 13.500px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sub { margin-top: 3px; font-size: 12px; color: var(--text3); }
</style>
