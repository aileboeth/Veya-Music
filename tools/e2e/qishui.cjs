// 汽水音乐巡检：取链接 / 歌词 / 封面 → 在真实播放器里播放 → 导入歌单（可选）
// 用法：$env:VEYA_E2E_SOURCES='音源文件夹'; $env:VEYA_E2E_QS='汽水歌单分享链接'; powershell -File tools\run-e2e.ps1 -Steps tools\e2e\qishui.cjs -Fresh
// 加 $env:VEYA_E2E_QS_IMPORT='1' 时只跑「导入整个歌单」（逐首匹配比较慢）
const fs = require('fs')
const path = require('path')

module.exports = async({ api, qishui, importSourceFiles, js, shot, waitFor, sleep, log, win }) => {
  win().setSize(1280, 860)
  const dir = process.env.VEYA_E2E_SOURCES
  importSourceFiles(fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)))
  const url = process.env.VEYA_E2E_QS

  if (process.env.VEYA_E2E_QS_IMPORT) {
    const t0 = Date.now()
    const r = await api['import.playlist'](url, '', () => {})
    const by = {}
    for (const s of r.songs) by[s.source] = (by[s.source] ?? 0) + 1
    log(`导入「${r.name}」用时 ${Math.round((Date.now() - t0) / 1000)}s：读到 ${r.total} 首，匹配/保留 ${r.songs.length} 首，其中汽水 ${r.qsOnly} 首，没找到 ${r.missing.length} 首`, by)
    log('汽水保留的歌', r.songs.filter(s => s.source == 'qs').slice(0, 12).map(s => `${s.name} - ${s.singer} (${s.interval})`))
    log('没找到的', r.missing.slice(0, 10))
    return
  }

  // 直接拿歌单里的前几首当「汽水歌曲」测（正常导入时只有其他平台没有的歌才会走汽水）
  const list = await qishui.fetchPlaylist(url)
  log(`歌单「${list.name}」读到 ${list.songs.length} 首，带 ID 的 ${list.songs.filter(s => s.id).length} 首，带封面的 ${list.songs.filter(s => s.img).length} 首`)
  const songs = list.songs.slice(0, 3).map(t => ({ id: 'qs_' + t.id, source: 'qs', songmid: t.id, vid: t.vid, name: t.name, singer: t.singer, albumName: t.albumName, interval: t.interval, img: t.img, types: [], _types: {} }))
  for (const s of songs) {
    const t0 = Date.now()
    try {
      const r = await api['music.url'](s, '320k', { allowSwitch: false })
      log(`取链接 《${s.name}》 ${Date.now() - t0}ms -> ${r.scriptName} [${r.quality}] ${new URL(r.url).host}`)
    } catch (e) { log(`取链接 《${s.name}》 失败 ${e.message}`, e.details) }
    const ly = await api['music.lyric'](s).catch(e => ({ err: e.message }))
    log(`歌词 《${s.name}》 ${ly.err ?? `${ly.lyric.split('\n').length} 行，逐字 ${ly.lxlyric.split('\n').filter(Boolean).length} 行，第 3 行：${ly.lyric.split('\n')[2]}`}`)
    log(`封面 《${s.name}》 ${await api['music.pic']({ ...s, img: '' }).catch(e => e.message)}`)
  }
  log('音源上报的汽水支持', (await api['source.list']()).filter(m => m.sources?.qs).map(m => m.name))

  // 放进播放队列，在真实的播放器里播
  await api['data.save']('queue', { songs, index: 1, time: 0, source: { type: 'list', name: '汽水测试' }, radio: false })
  win().webContents.reload()
  await sleep(1500)
  await waitFor(`document.querySelector('.sidebar')`)
  await sleep(1200)
  await js(`document.querySelector('.player-bar .play').click()`)
  log('开始播放', await waitFor(`(() => { const t = document.querySelectorAll('.player-bar .time'); return t[0] && t[0].textContent > '00:02' })()`, 60000))
  await js(`document.querySelector('.cover-btn').click()`)
  log('歌词行亮起', await waitFor(`document.querySelector('.now .line.on')`, 60000))
  await sleep(1500)
  log('播放页', await js(`
    const t = [...document.querySelectorAll('.player-bar .time')].map(e => e.textContent)
    const on = document.querySelector('.now .line.on')
    return { time: t, name: document.querySelector('.now .name')?.textContent, album: document.querySelector('.now .album')?.textContent.trim(), line: on?.querySelector('.txt').textContent, units: on?.querySelectorAll('.u').length, lines: document.querySelectorAll('.now .line').length, cover: !!document.querySelector('.now .big-cover img')?.naturalWidth, spectrum: window.__veyaSpectrum() }
  `))
  await shot('qs-now')
}
