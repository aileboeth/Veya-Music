import { createApp } from 'vue'
import App from './App.vue'
import { initLists } from './lists'
import { initPlayer } from './player'
import { initSettings } from './settings'
import { initUpdate } from './update'
import './styles.css'

const boot = async() => {
  await initSettings()
  await initLists()
  await initPlayer()
  await initUpdate()
  createApp(App).mount('#app')
}
void boot()
