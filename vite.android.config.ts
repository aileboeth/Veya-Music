// 手机版网页的打包配置：npm run build:android → android/app/src/main/assets/www
// 电脑版的主进程模块直接复用；用到 Node / Electron 的地方换成 src/android/shims，
// 少数和平台强相关的模块整个换成 src/android/main 下的手机版
import { resolve, relative } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = __dirname
const shim = (name: string) => resolve(root, 'src/android/shims', name)
const REPLACE: Record<string, string> = {
  'src/main/userApiHost.ts': 'src/android/main/userApiHost.ts',
  'src/main/downloadIO.ts': 'src/android/main/downloadIO.ts',
  'src/main/net.ts': 'src/android/main/net.ts',
  'src/main/updater.ts': 'src/android/main/updater.ts',
  'src/main/sync/transport.ts': 'src/android/main/syncTransport.ts',
}

const replaceModules = (): Plugin => ({
  name: 'veya-android-replace',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || source.startsWith('\0') || !/^\.{1,2}\//.test(source)) return null
    const r = await this.resolve(source, importer, { ...options, skipSelf: true })
    if (!r) return null
    const key = relative(root, r.id.split('?')[0]).replace(/\\/g, '/')
    return REPLACE[key] ? resolve(root, REPLACE[key]) : null
  },
})

export default defineConfig({
  root: resolve(root, 'src/android'),
  base: './',
  plugins: [replaceModules(), vue()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(root, 'src/renderer/src') },
      { find: /^electron$/, replacement: shim('electron.ts') },
      { find: /^(node:)?fs$/, replacement: shim('fs.ts') },
      { find: /^(node:)?path$/, replacement: shim('path.ts') },
      { find: /^(node:)?os$/, replacement: shim('os.ts') },
      { find: /^(node:)?crypto$/, replacement: shim('crypto.ts') },
      { find: /^(node:)?zlib$/, replacement: shim('zlib.ts') },
      { find: /^needle$/, replacement: shim('needle.ts') },
      { find: /^(tunnel|dns|http|https|net|tls|ws|electron-updater|node:dns|node:http|node:https|node:net|node:tls)$/, replacement: shim('stubs.ts') },
    ],
  },
  worker: { format: 'es' },
  build: {
    outDir: resolve(root, 'android/app/src/main/assets/www'),
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
  },
})