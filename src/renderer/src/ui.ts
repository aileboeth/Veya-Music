// 全局 UI 状态：路由、提示、右键菜单、对话框
import { reactive } from 'vue'

// ---------- 路由（简单的历史栈） ----------
export interface Route { name: string, params: Record<string, any>, key: string }
const makeRoute = (name: string, params: Record<string, any> = {}): Route => ({ name, params, key: `${name}:${JSON.stringify(params)}` })

export const router = reactive({
  stack: [makeRoute('discover')] as Route[],
  index: 0,
  get current(): Route { return this.stack[this.index] },
  get canBack(): boolean { return this.index > 0 },
  get canForward(): boolean { return this.index < this.stack.length - 1 },
})

/** 路由参数里以 _ 开头的是一次性指令（例如 _locate），不参与页面缓存 key */
export const go = (name: string, params: Record<string, any> = {}) => {
  const keyParams: Record<string, any> = {}
  for (const [k, v] of Object.entries(params)) if (!k.startsWith('_')) keyParams[k] = v
  const route = { ...makeRoute(name, keyParams), params }
  if (router.current.key == route.key) {
    router.stack[router.index] = route
    return
  }
  router.stack.splice(router.index + 1)
  router.stack.push(route)
  if (router.stack.length > 40) router.stack.shift()
  router.index = router.stack.length - 1
}
export const back = () => { if (router.canBack) router.index-- }
/** 手机版切换底部标签：清空历史，从这个标签的首页开始 */
export const resetTo = (name: string, params: Record<string, any> = {}) => {
  router.stack.splice(0, router.stack.length, makeRoute(name, params))
  router.index = 0
}
export const forward = () => { if (router.canForward) router.index++ }

// ---------- 轻提示 ----------
export const toasts = reactive<Array<{ id: number, text: string, type: string }>>([])
let toastId = 0
export const toast = (text: string, type: 'info' | 'error' | 'success' = 'info', ms = 2600) => {
  const id = ++toastId
  toasts.push({ id, text, type })
  if (toasts.length > 4) toasts.shift()
  setTimeout(() => {
    const i = toasts.findIndex(t => t.id == id)
    if (i > -1) toasts.splice(i, 1)
  }, type == 'error' ? ms + 1500 : ms)
}

// ---------- 右键菜单 ----------
export interface MenuItem { label?: string, icon?: string, danger?: boolean, disabled?: boolean, divider?: boolean, children?: MenuItem[], action?: () => void }
export const menu = reactive({ show: false, x: 0, y: 0, items: [] as MenuItem[] })
export const openMenu = (e: MouseEvent | { x: number, y: number }, items: MenuItem[]) => {
  if ('preventDefault' in e) e.preventDefault()
  menu.items = items.filter(Boolean)
  menu.x = 'clientX' in e ? e.clientX : e.x
  menu.y = 'clientY' in e ? e.clientY : e.y
  menu.show = true
}
export const closeMenu = () => { menu.show = false }

// ---------- 底部弹出面板（手机版：定时关闭、设备、播放页的更多操作） ----------
export const sheet = reactive({ show: '' as '' | 'sleep' | 'devices' | 'npmore' })
export const openSheet = (name: typeof sheet.show) => { sheet.show = name }

// ---------- 对话框 ----------
interface DialogState {
  show: boolean
  type: 'confirm' | 'prompt' | 'alert'
  title: string
  message: string
  value: string
  placeholder: string
  okText: string
  danger: boolean
  resolve: ((v: any) => void) | null
}
export const dialog = reactive<DialogState>({ show: false, type: 'confirm', title: '', message: '', value: '', placeholder: '', okText: '确定', danger: false, resolve: null })
const openDialog = (opts: Partial<DialogState>) => new Promise<any>(resolve => {
  dialog.resolve?.(null)
  Object.assign(dialog, { show: true, type: 'confirm', title: '', message: '', value: '', placeholder: '', okText: '确定', danger: false }, opts, { resolve })
})
export const confirmDialog = (title: string, message = '', opts: { okText?: string, danger?: boolean } = {}): Promise<boolean> =>
  openDialog({ type: 'confirm', title, message, ...opts }).then(v => !!v)
export const promptDialog = (title: string, value = '', placeholder = ''): Promise<string | null> =>
  openDialog({ type: 'prompt', title, value, placeholder }).then(v => typeof v == 'string' ? v : null)
export const alertDialog = (title: string, message = '', opts: { okText?: string } = {}) => openDialog({ type: 'alert', title, message, ...opts })
export const closeDialog = (value: any) => {
  dialog.show = false
  dialog.resolve?.(value)
  dialog.resolve = null
}

// ---------- 「导入歌单」对话框 ----------
/** preset：不经过粘贴链接，直接带着读好的歌单进预览（「同步更新」用） */
export const importDialog = reactive({ show: false, preset: null as null | { result: any, listId: string } })
export const openImport = () => { importDialog.preset = null; importDialog.show = true }
export const openSyncPreview = (result: any, listId: string) => { importDialog.preset = { result, listId }; importDialog.show = true }

// ---------- 「添加到歌单」选择器 ----------
export const listPicker = reactive({ show: false, songs: [] as any[] })
export const pickListFor = (songs: any[]) => {
  listPicker.songs = songs
  listPicker.show = true
}
