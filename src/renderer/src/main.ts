import { createApp } from 'vue'
import App from './App.vue'
import MobileApp from './MobileApp.vue'
import * as listsModule from './lists'
import { initLists } from './lists'
import * as playerModule from './player'
import { initPlayer, player } from './player'
import { initSettings, settings } from './settings'
import { initUpdate } from './update'
import { initSync } from './sync'
import * as remoteModule from './remote'
import { initRemote } from './remote'
import * as syncModule from './sync'
import { isAndroid } from './platform'
import { on } from './api'
import { toast } from './ui'
import './styles.css'
import './mobile.css'

// 自动化测试用：脚本里直接读写歌单、设置
;(window as any).__veya = { lists: listsModule, settings, player, playerApi: playerModule, remote: remoteModule, sync: syncModule }

// 手机版：竖屏布局（mobile.css 和各组件里 html.mobile 开头的样式）
if (isAndroid) document.documentElement.classList.add('mobile')

const boot = async() => {
  await initSettings()
  await initLists()
  await initPlayer()
  await initUpdate()
  await initSync()
  initRemote()
  on('app:toast', (text: string, type: 'error' | 'success') => toast(text, type, 6000))
  createApp(isAndroid ? MobileApp : App).mount('#app')
}
void boot()
