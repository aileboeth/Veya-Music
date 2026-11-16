// 手机版：在所有模块之前执行，补上电脑版代码用到的 Node 全局变量
import { Buffer } from 'buffer'

const g = globalThis as any
g.Buffer = Buffer
g.global = globalThis
g.process = {
  env: {},
  platform: 'android',
  versions: { node: '', electron: '' },
  nextTick: (fn: (...a: any[]) => void, ...args: any[]) => queueMicrotask(() => fn(...args)),
}
g.setImmediate ??= (fn: (...a: any[]) => void, ...args: any[]) => setTimeout(fn, 0, ...args)
g.veyaPlatform = 'android'
