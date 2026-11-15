import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { flushAll, load, save } from './store'
import * as userApi from './userApi'
import * as music from './music'
import * as rec from './recommend'
import * as dl from './download'
import { lxDbPath, readLxDatabase, readLxFile } from './lxImport'
import { cancelImport, importPlaylist } from './listImport'
import * as updater from './updater'
import { applyProxy, setProxyHandlers } from './net'

const isDev = !!process.env.ELECTRON_RENDERER_URL
let mainWin: BrowserWindow | null = null
let lyricWin: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let playState = { playing: false, title: '' }
let lyricDragBounds: Electron.Rectangle | null = null

const resPath = (...p: string[]) => path.join(__dirname, '../../resources', ...p)
const preloadPath = path.join(__dirname, '../preload/index.js')
const loadPage = (win: BrowserWindow, page: string) => {
  if (isDev) void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}`)
  else void win.loadFile(path.join(__dirname, '../renderer', page))
}
const sendMain = (channel: string, ...args: any[]) => {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, ...args)
}
const sendLyric = (channel: string, ...args: any[]) => {
  if (lyricWin && !lyricWin.isDestroyed()) lyricWin.webContents.send(channel, ...args)
}
const settings = () => load<any>('settings', {})

// ---------------- 主窗口 ----------------
const overlayColors = (dark: boolean) => ({ color: '#00000000', symbolColor: dark ? '#e8ecf5' : '#3a4256', height: 44 })

const createMainWindow = () => {
  const bounds = load<any>('window', {})
  mainWin = new BrowserWindow({
    width: bounds.width ?? 1180,
    height: bounds.height ?? 760,
    x: bounds.x,
    y: bounds.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: settings().dark ? '#12141c' : '#f4f6fb',
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayColors(!!settings().dark),
    icon: resPath('icon.png'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  })
  if (bounds.maximized) mainWin.maximize()
  mainWin.once('ready-to-show', () => mainWin?.show())
  mainWin.on('close', event => {
    if (mainWin && !mainWin.isMaximized() && !mainWin.isMinimized()) save('window', { ...mainWin.getBounds(), maximized: false })
    else if (mainWin?.isMaximized()) save('window', { ...load<any>('window', {}), maximized: true })
    if (!quitting && settings().closeToTray !== false) {
      event.preventDefault()
      mainWin?.hide()
    }
  })
  mainWin.on('closed', () => {
    mainWin = null
    if (!quitting) app.quit()
  })
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWin.webContents.on('will-navigate', event => { if (!isDev) event.preventDefault() })
  loadPage(mainWin, 'index.html')
}

const showMain = () => {
  if (!mainWin) return createMainWindow()
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()
}

// ---------------- 桌面歌词 ----------------
const lyricConf = () => ({ fontSize: 30, locked: false, color: 'aurora', ...(settings().desktopLyric ?? {}) })
const saveLyricConf = (patch: any) => {
  const s = settings()
  s.desktopLyric = { ...lyricConf(), ...patch }
  save('settings', s)
  sendMain('settings:changed', s)
  sendLyric('lyric:conf', s.desktopLyric)
}

const applyLyricLock = () => {
  if (!lyricWin || lyricWin.isDestroyed()) return
  lyricWin.setIgnoreMouseEvents(!!lyricConf().locked, { forward: true })
}

const openLyricWindow = () => {
  if (lyricWin && !lyricWin.isDestroyed()) return
  const conf = lyricConf() as any
  const area = screen.getPrimaryDisplay().workArea
  const width = conf.width ?? 900
  const height = conf.height ?? 150
  let x = conf.x ?? Math.round(area.x + (area.width - width) / 2)
  let y = conf.y ?? area.y + area.height - height - 40
  const visible = screen.getAllDisplays().some(d => x + 100 > d.workArea.x && x < d.workArea.x + d.workArea.width - 100 && y >= d.workArea.y - 10 && y < d.workArea.y + d.workArea.height - 40)
  if (!visible) {
    x = Math.round(area.x + (area.width - width) / 2)
    y = area.y + area.height - height - 40
  }
  lyricWin = new BrowserWindow({
    width, height, x, y,
    minWidth: 380,
    minHeight: 90,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  })
  lyricWin.setAlwaysOnTop(true, 'screen-saver')
  lyricWin.once('ready-to-show', () => {
    lyricWin?.showInactive()
    applyLyricLock()
  })
  lyricWin.on('resized', () => {
    if (lyricWin && !lyricWin.isDestroyed()) saveLyricConf(lyricWin.getBounds())
  })
  lyricWin.on('closed', () => {
    lyricWin = null
    sendMain('lyric:visible', false)
    updateTray()
  })
  loadPage(lyricWin, 'lyric.html')
  sendMain('lyric:visible', true)
  updateTray()
}

const closeLyricWindow = () => {
  if (lyricWin && !lyricWin.isDestroyed()) lyricWin.close()
}

// ---------------- 托盘 ----------------
const updateTray = () => {
  if (!tray) return
  const lyricOpen = !!lyricWin && !lyricWin.isDestroyed()
  tray.setToolTip(playState.title ? `${playState.title} - Veya Music` : 'Veya Music')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: playState.title || 'Veya Music', enabled: false },
    { type: 'separator' },
    { label: playState.playing ? '暂停' : '播放', click: () => sendMain('player:command', 'toggle') },
    { label: '上一首', click: () => sendMain('player:command', 'prev') },
    { label: '下一首', click: () => sendMain('player:command', 'next') },
    { type: 'separator' },
    { label: '桌面歌词', type: 'checkbox', checked: lyricOpen, click: () => lyricOpen ? closeLyricWindow() : openLyricWindow() },
    { label: '锁定桌面歌词', type: 'checkbox', checked: !!lyricConf().locked, enabled: lyricOpen, click: item => { saveLyricConf({ locked: item.checked }); applyLyricLock(); updateTray() } },
    { type: 'separator' },
    { label: '显示主窗口', click: showMain },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
}

const createTray = () => {
  try {
    const img = nativeImage.createFromPath(resPath('tray.png'))
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
    tray.on('click', showMain)
    updateTray()
  } catch (err) {
    console.error('[tray]', err)
  }
}

// ---------------- IPC ----------------
const DATA_KEYS = new Set(['settings', 'lists', 'queue', 'dislikes', 'searchHistory'])

const importSourceFiles = (paths: string[]) => {
  const ok: string[] = []
  const failed: string[] = []
  for (const p of paths) {
    try {
      const item = userApi.importScript(fs.readFileSync(p, 'utf8'), path.basename(p))
      ok.push(item.name)
    } catch (err: any) {
      failed.push(`${path.basename(p)}：${err?.message ?? err}`)
    }
  }
  return { ok, failed }
}

const api: Record<string, (...args: any[]) => any> = {
  'data.load': (key: string, def: any) => DATA_KEYS.has(key) ? load(key, def) : def,
  'data.save': (key: string, value: any) => {
    if (!DATA_KEYS.has(key)) return
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

  'source.list': music.sourceList,
  'source.speedTest': music.speedTest,
  'source.speedState': music.getSpeedState,
  'source.disableDead': music.disableDeadSources,
  'source.checkUpdates': userApi.checkUpdates,
  'source.update': userApi.updateFromUrl,
  'source.pick': async() => {
    const r = await dialog.showOpenDialog(mainWin!, { title: '选择音源脚本', filters: [{ name: '音源脚本', extensions: ['js'] }], properties: ['openFile', 'multiSelections'] })
    return r.canceled ? { ok: [], failed: [] } : importSourceFiles(r.filePaths)
  },
  'source.pickFolder': async() => {
    const r = await dialog.showOpenDialog(mainWin!, { title: '选择存放音源脚本的文件夹', properties: ['openDirectory'] })
    if (r.canceled) return { ok: [], failed: [] }
    const dir = r.filePaths[0]
    return importSourceFiles(fs.readdirSync(dir).filter(f => /\.js$/i.test(f)).map(f => path.join(dir, f)))
  },
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

  'import.playlist': (text: string, hint = '') => importPlaylist(text, hint, p => sendMain('import:progress', p)),
  'import.cancel': cancelImport,

  'lx.exists': () => fs.existsSync(lxDbPath()),
  'lx.readDb': readLxDatabase,
  'lx.readFile': async() => {
    const r = await dialog.showOpenDialog(mainWin!, { title: '选择 LX Music 导出的列表文件', filters: [{ name: 'LX 列表文件', extensions: ['lxmc', 'json'] }], properties: ['openFile'] })
    return r.canceled ? null : readLxFile(r.filePaths[0])
  },

  'dl.list': dl.getTasks,
  'dl.add': dl.addTasks,
  'dl.cancel': dl.cancelTask,
  'dl.remove': dl.removeTask,
  'dl.retry': dl.retryTask,
  'dl.clear': dl.clearFinished,
  'dl.dir': () => settings().downloadDir || dl.defaultDir(),
  'dl.chooseDir': async() => {
    const r = await dialog.showOpenDialog(mainWin!, { title: '选择下载文件夹', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  },
  'dl.show': (filePath: string) => {
    if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath)
    else {
      const dir = settings().downloadDir || dl.defaultDir()
      fs.mkdirSync(dir, { recursive: true })
      void shell.openPath(dir)
    }
  },

  'win.theme': (dark: boolean) => {
    try { mainWin?.setTitleBarOverlay(overlayColors(dark)) } catch {}
    mainWin?.setBackgroundColor(dark ? '#12141c' : '#f4f6fb')
  },
  'app.info': () => ({ version: app.getVersion(), electron: process.versions.electron, dataDir: path.join(app.getPath('userData'), 'VeyaData') }),
  'app.open': (url: string) => { if (/^https?:\/\//.test(url)) void shell.openExternal(url) },

  'update.state': updater.getState,
  'update.check': () => updater.check(true),
  'update.install': updater.install,
  'update.savedNotes': updater.savedNotes,

  'player.state': (state: { playing: boolean, title: string }) => {
    playState = state
    updateTray()
  },
  'lyric.toggle': (open?: boolean) => {
    const isOpen = !!lyricWin && !lyricWin.isDestroyed()
    if (open ?? !isOpen) openLyricWindow()
    else closeLyricWindow()
  },
  'lyric.visible': () => !!lyricWin && !lyricWin.isDestroyed(),
  'lyric.conf': () => lyricConf(),
  'lyric.setConf': (patch: any) => {
    saveLyricConf(patch)
    applyLyricLock()
    updateTray()
  },
  'lyric.push': (data: any) => { sendLyric('lyric:data', data) },
  'lyric.ready': () => { sendMain('lyric:request') },
  'lyric.close': closeLyricWindow,
  'lyric.command': (cmd: string) => { sendMain('player:command', cmd) },
  'lyric.dragStart': () => {
    if (lyricWin && !lyricWin.isDestroyed()) lyricDragBounds = lyricWin.getBounds()
  },
  'lyric.dragMove': (dx: number, dy: number) => {
    if (!lyricWin || lyricWin.isDestroyed() || !lyricDragBounds) return
    // 带上宽高一起设置，避免高 DPI 下拖动时窗口尺寸漂移
    lyricWin.setBounds({ ...lyricDragBounds, x: Math.round(lyricDragBounds.x + dx), y: Math.round(lyricDragBounds.y + dy) })
  },
  'lyric.dragEnd': () => {
    lyricDragBounds = null
    if (lyricWin && !lyricWin.isDestroyed()) saveLyricConf(lyricWin.getBounds())
  },
  // 锁定状态下鼠标移到解锁按钮上时，临时接收鼠标事件
  'lyric.hover': (inside: boolean) => {
    if (!lyricWin || lyricWin.isDestroyed() || !lyricConf().locked) return
    lyricWin.setIgnoreMouseEvents(!inside, { forward: true })
  },
}

const initIpc = () => {
  ipcMain.handle('veya', async(_event, method: string, ...args: any[]) => {
    const fn = api[method]
    if (!fn) throw new Error('未知的方法: ' + method)
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err: any) {
      return { ok: false, message: String(err?.message ?? err), details: err?.details }
    }
  })
}

// ---------------- 启动 ----------------
// 仅开发环境：用独立数据目录运行、加载自动化测试脚本（打包后的正式版不生效）
if (!app.isPackaged && process.env.VEYA_USER_DATA) app.setPath('userData', process.env.VEYA_USER_DATA)
const runDevScript = () => {
  if (app.isPackaged || !process.env.VEYA_DEV_SCRIPT) return
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(process.env.VEYA_DEV_SCRIPT)({ app, api, userApi, music, store: { load, save }, importSourceFiles, getMainWin: () => mainWin, getLyricWin: () => lyricWin })
  } catch (err) {
    console.error('[dev script]', err)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMain)
  app.setAppUserModelId('com.aileboeth.veyamusic')

  void app.whenReady().then(async() => {
    Menu.setApplicationMenu(null)
    userApi.initUserApi()
    await applyProxy()
    setProxyHandlers(() => userApi.closeAll(), (text, type) => sendMain('app:toast', text, type))
    userApi.setOnChange(() => sendMain('sources:changed', music.sourceList()))
    music.setOnSpeedChange(() => {
      sendMain('sources:changed', music.sourceList())
      sendMain('sources:speed', music.getSpeedState())
    })
    dl.initDownload(tasks => sendMain('downloads:changed', tasks))
    initIpc()
    createMainWindow()
    createTray()
    updater.initUpdater(state => sendMain('update:state', state), () => { quitting = true })
    setTimeout(() => userApi.warmup(), 1500)
    // 启动后把音源都跑一遍，收集脚本自己上报的「有新版本」提示
    userApi.setOnUpdateAlert(name => sendMain('app:toast', '音源「' + name + '」提示有新版本，可以到 设置 → 音源管理 里更新', 'success'))
    setTimeout(() => void userApi.checkUpdates(), 20_000)
    if (isDev && !process.env.VEYA_DEV_SCRIPT) mainWin?.webContents.openDevTools({ mode: 'detach' })
    runDevScript()
  })

  app.on('before-quit', () => {
    quitting = true
    userApi.closeAll()
    flushAll()
  })
  app.on('window-all-closed', () => {
    if (quitting) app.quit()
  })
}
