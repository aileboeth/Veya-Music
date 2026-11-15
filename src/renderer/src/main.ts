import { createApp } from 'vue'
import App from './App.vue'
import { initLists } from './lists'
import { initPlayer } from './player'
import { initSettings } from './settings'
import { initUpdate } from './update'
import { on } from './api'
import { toast } from './ui'
import './styles.css'

const boot = async() => {
  await initSettings()
  await initLists()
  await initPlayer()
  await initUpdate()
  on('app:toast', (text: string, type: 'error' | 'success') => toast(text, type, 6000))
  createApp(App).mount('#app')
}
void boot()
