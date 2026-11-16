// 手机版的「主进程」：和电脑版 src/main/index.ts 提供同一套 window.veya.invoke 方法，
// 搜索、歌单、换源、推荐、同步等逻辑直接复用电脑版模块（通过 shims 跑在 WebView 里）
import { flushAll, load, save, version as dataVersion } from '../main/store'
import * as userApi from '../main/userApi'
import * as music from '../main/music'
import * as rec from '../main/recommend'
import * as dl from '../main/download'
import { parseLxBuffer } from '../main/lxImport'
import { cancelImport, importPlaylist } from '../main/listImport'
import * as updater from '../main/updater'
import { applyProxy, setProxyHandlers } from '../main/net'
import * as sync from '../main/sync/engine'
import { N, call, nativeInfo, onNative } from './native'

// ---------------- 事件（主进程 → 界面） ----------------
const handlers = new Map<string, Set<(...args: any[]) => void>>()
export const emit = (channel: string, ...args: any[]) => {
  for (const fn of handlers.get(channel) ?? []) {
    try { fn(...args) } catch (err) { console.error('[event]', channel, err) }
  }
}
const settings = () => load<any>('settings', {})

// ---------------- 悬浮歌词 ----------------
let overlayOpen = false
const lyricConf = () => ({ fontSize: 22, locked: false, color: 'aurora', mode: 'single', align: 'center', effect: 'fill', ...(settings().desktopLyric ?? {}) })
const saveLyricConf = (patch: any) => {
  const s = settings()
  s.desktopLyric = { ...lyricConf(), ...patch }
  save('settings', s)
  emit('settings:changed', s)
  void call('overlay.conf', s.desktopLyric).catch(() => {})
}
onNative('overlay', (e: any) => {
  if (e?.type == 'closed') {
    overlayOpen = false
    emit('lyric:visible', false)
  } else if (e?.type == 'moved') saveLyricConf({ x: e.x, y: e.y })
  else if (e?.type == 'lock') saveLyricConf({ locked: !!e.locked })
  else if (e?.type == 'command') emit('player:command', e.cmd)
})

const DATA_KEYS = new Set(['settings', 'lists', 'queue', 'dislikes', 'searchHistory'])

const importScripts = (files: Array<{ name: string, text: string }>) => {
  const ok: string[] = []
  const failed: string[] = []
  for (const f of files ?? []) {
    if (!/\.js$/i.test(f.name)) {
      failed.push(`${f.name}：不是 .js 脚本`)
      continue
    }
    try {
      ok.push(userApi.importScript(f.text, f.name).name)
    } catch (err: any) {
      failed.push(`${f.name}：${err?.message ?? err}`)
    }
  }
  return { ok, failed }
}

const api: Record<string, (...args: any[]) => any> = {
  'data.load': (key: string, def: any) => DATA_KEYS.has(key) ? load(key, def) : def,
  'data.loadV': (key: string, def: any) => ({ value: DATA_KEYS.has(key) ? load(key, def) : def, v: dataVersion(key) }),
  'data.save': (key: string, value: any, v?: number) => {
    if (!DATA_KEYS.has(key)) return
    if (typeof v == 'number' && v < dataVersion(key)) {
      if (key == 'settings') emit('settings:changed', load('settings', {}))
      else emit('data:changed', key)
      return { stale: true }
    }
    save(key, value)
    if (key == 'settings') void applyProxy()
  },

  'search.music': music.searchMusic,
  'search.tips': music.tipSearch,
  'search.hot': music.hotSearch,
  'songlist.meta': music.songListMeta,
  'songlist.lists': music.songLists,
  'songlist.search': music.searchSongLists,
  'songlist.detail': music.songListDetail,
  'board.list': music.boards,
  'board.detail': music.boardDetail,
  'music.url': music.getMusicUrl,
  'music.lyric': music.getLyric,
  'music.pic': music.getPic,
  'music.others': music.findOtherSources,
  'music.mismatch': music.reportMismatch,
  'music.playFail': music.reportPlayFail,

  'source.list': music.sourceList,
  'source.speedTest': music.speedTest,
  'source.speedState': music.getSpeedState,
  'source.disableDead': music.disableDeadSources,
  'source.checkUpdates': userApi.checkUpdates,
  'source.update': userApi.updateFromUrl,
  'source.pick': async() => importScripts(await call('file.pick', { multiple: true, mime: '*/*' })),
  'source.pickFolder': async() => importScripts(await call('file.pick', { multiple: true, mime: '*/*' })),
  'source.remove': userApi.removeScript,
  'source.enable': userApi.setEnabled,
  'source.reorder': userApi.reorder,
  'source.reload': userApi.reload,

  'stats.record': rec.record,
  'stats.recent': rec.recentSongs,
  'stats.clear': rec.clearStats,
  'rec.daily': rec.daily,
  'rec.radio': rec.radio,
  'rec.similar': rec.similarSongs,
  'rec.discover': rec.discover,
  'rec.dislike': rec.dislike,

  'import.playlist': (text: string, hint = '') => importPlaylist(text, hint, p => emit('import:progress', p)),
  'import.cancel': cancelImport,

  'lx.exists': () => false,
  'lx.readDb': () => [],
  'lx.readFile': async() => {
    const files = await call<Array<{ name: string, base64: string }>>('file.pick', { multiple: false, mime: '*/*', binary: true })
    if (!files?.length) return null
    return parseLxBuffer(Buffer.from(files[0].base64, 'base64'))
  },

  'dl.list': dl.getTasks,
  'dl.add': dl.addTasks,
  'dl.cancel': dl.cancelTask,
  'dl.remove': dl.removeTask,
  'dl.retry': dl.retryTask,
  'dl.clear': dl.clearFinished,
  'dl.dir': () => dl.defaultDir(),
  'dl.chooseDir': () => null,
  'dl.show': () => {},

  'win.theme': (dark: boolean) => void call('ui.theme', { dark }).catch(() => {}),
  'app.info': () => ({ version: nativeInfo.version, electron: '', android: nativeInfo.sdk, model: nativeInfo.model, dataDir: nativeInfo.dataDir }),
  'app.open': (url: string) => { if (/^https?:\/\//.test(url)) void call('app.open', { url }) },
  'app.copy': (text: string) => call('app.copy', { text: String(text ?? '') }),
  'app.scanQr': () => call<string | null>('qr.scan'),
  'app.share': (text: string) => call('app.share', { text }),

  'update.state': updater.getState,
  'update.check': () => updater.check(true),
  'update.install': updater.install,
  'update.savedNotes': updater.savedNotes,

  'player.state': () => {},
  'player.sleep': (opts: any) => call('player.sleep', opts),

  'lyric.toggle': async(open?: boolean) => {
    const want = open ?? !overlayOpen
    if (want) {
      const r = await call<{ shown: boolean, needPermission?: boolean }>('overlay.show', lyricConf())
      overlayOpen = r.shown
      if (r.needPermission) emit('app:toast', '需要允许「显示在其他应用上层」才能显示悬浮歌词，开启后再点一次', 'error')
    } else {
      await call('overlay.hide')
      overlayOpen = false
    }
    emit('lyric:visible', overlayOpen)
  },
  'lyric.visible': () => overlayOpen,
  'lyric.conf': () => lyricConf(),
  'lyric.setConf': (patch: any) => saveLyricConf(patch),
  'lyric.push': (data: any) => { if (overlayOpen) N.player('lyric', JSON.stringify(data)) },
  'lyric.lines': (lines: any) => N.player('lines', JSON.stringify(lines ?? [])),
  'lyric.place': (where: string) => void call('overlay.place', { where }).catch(() => {}),
  'lyric.ready': () => emit('lyric:request'),
  'lyric.close': () => api['lyric.toggle'](false),
  'lyric.command': (cmd: string) => emit('player:command', cmd),
  'lyric.dragStart': () => {},
  'lyric.dragMove': () => {},
  'lyric.dragEnd': () => {},
  'lyric.hover': () => {},

  'sync.state': sync.getState,
  'sync.pair': sync.pair,
  'sync.unpair': sync.unpair,
  'sync.enable': sync.setEnabled,
  'sync.groups': sync.setGroups,
  'sync.rename': sync.setDeviceName,
  'sync.now': sync.syncNow,
  'sync.code': sync.pairCode,
  'sync.np': sync.sendNowPlaying,
  'sync.cmd': sync.sendCommand,
  'sync.forget': sync.forgetDevice,
  'sync.clock': () => ({ now: sync.serverNow(), ...sync.clockInfo() }),
}

// ---------------- window.veya ----------------
;(window as any).veya = {
  async invoke(method: string, ...args: any[]) {
    const fn = api[method]
    if (!fn) return { ok: false, message: '未知的方法: ' + method }
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err: any) {
      return { ok: false, message: String(err?.message ?? err), details: err?.details }
    }
  },
  on(channel: string, handler: (...args: any[]) => void) {
    let set = handlers.get(channel)
    if (!set) handlers.set(channel, set = new Set())
    set.add(handler)
    return () => { set!.delete(handler) }
  },
}
// 自动化测试 / 排查问题用（只在调试版里能直接导入脚本）
;(window as any).__veyaApi = api
if (nativeInfo.debug) {
  api['dev.importScript'] = (text: string, name: string) => userApi.importScript(text, name)
  ;(window as any).__veyaDebug = { userApi, music, rec, sync, load, save }
}
// 界面里的播放器（renderer/src/nativeAudio.ts）通过它控制原生的 ExoPlayer
;(window as any).__veyaNativePlayer = {
  cmd: (op: string, data?: any) => N.player(op, JSON.stringify(data ?? null)),
  on: (fn: (e: any) => void) => onNative('player', fn),
}

// ---------------- 启动 ----------------
userApi.initUserApi()
void applyProxy()
setProxyHandlers(() => userApi.closeAll(), (text, type) => emit('app:toast', text, type))
userApi.setOnChange(() => emit('sources:changed', music.sourceList()))
music.setOnSpeedChange(() => {
  emit('sources:changed', music.sourceList())
  emit('sources:speed', music.getSpeedState())
})
dl.initDownload(tasks => emit('downloads:changed', tasks))
music.setLocalLookup(dl.localFileOf)
sync.initSync({
  version: nativeInfo.version,
  state: st => emit('sync:state', st),
  data: keys => {
    for (const key of keys) {
      if (key == 'settings') emit('settings:changed', load('settings', {}))
      else emit('data:changed', key)
    }
  },
  np: (device, st) => emit('sync:np', device, st),
  cmd: msg => emit('sync:cmd', msg),
})
updater.initUpdater(state => emit('update:state', state), () => {})
setTimeout(() => userApi.warmup(), 1500)
userApi.setOnUpdateAlert(name => emit('app:toast', '音源「' + name + '」提示有新版本，可以到 设置 → 音源 里更新', 'success'))
setTimeout(() => void userApi.checkUpdates(), 30_000)

// 通知栏 / 锁屏 / 耳机按键 → 播放器
onNative('media', (e: any) => { if (e?.action) emit('player:command', e.action) })
// 应用切到后台 / 回到前台：停掉页面动画省电
onNative('app', (e: any) => {
  if (e?.type == 'visible') emit('win:visible', !!e.visible)
  if (e?.type == 'pause') flushAll()
})
