import { createApp } from 'vue'
import App from './App.vue'
import * as listsModule from './lists'
import { initLists } from './lists'
import * as playerModule from './player'
import { initPlayer, player } from './player'
import { initSettings, settings } from './settings'
import { initUpdate } from './update'
import { initSync } from './sync'
import { on } from './api'
import { toast } from './ui'
import './styles.css'

// 自动化测试用：脚本里直接读写歌单、设置
;(window as any).__veya = { lists: listsModule, settings, player, playerApi: playerModule }

const boot = async() => {
  await initSettings()
  await initLists()
  await initPlayer()
  await initUpdate()
  await initSync()
  on('app:toast', (text: string, type: 'error' | 'success') => toast(text, type, 6000))
  createApp(App).mount('#app')
}
void boot()
