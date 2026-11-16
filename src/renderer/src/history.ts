// 搜索历史（会同步到其他设备）
import { ref } from 'vue'
import { api, on } from './api'

export const searchHistory = ref<string[]>([])
let ver = 0

const reload = async() => {
  const r = await api<{ value: string[], v: number }>('data.loadV', 'searchHistory', [])
  searchHistory.value = Array.isArray(r.value) ? r.value : []
  ver = r.v
}
const persist = () => void api('data.save', 'searchHistory', searchHistory.value, ver).catch(() => {})

export const initSearchHistory = async() => {
  await reload()
  on('data:changed', (key: string) => { if (key == 'searchHistory') void reload() })
}

export const addSearchHistory = (text: string) => {
  searchHistory.value = [text, ...searchHistory.value.filter(h => h != text)].slice(0, 12)
  persist()
}

export const clearSearchHistory = () => {
  searchHistory.value = []
  persist()
}
