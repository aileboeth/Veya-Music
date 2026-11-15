// 功能巡检：音源、LX 迁移、我的歌单定位、每日推荐、电台、榜单、歌单广场、桌面歌词、深色主题
const path = require('path')
const fs = require('fs')

module.exports = async({ api, importSourceFiles, js, shot, waitFor, click, clickText, sleep, log, win, getLyricWin }) => {
  win().setSize(1280, 820)
  const dir = process.env.VEYA_E2E_SOURCES // 存放音源脚本的文件夹
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
  log('import', importSourceFiles(files))

  // 逐个测试音源初始化
  for (const s of api['source.list']()) {
    await api['source.reload'](s.id).catch(e => log('reload err', s.name, String(e)))
  }
  log('sources', api['source.list']().map(s => `${s.name} ${s.version} [${s.status}] ${s.message} => ${s.sources ? Object.entries(s.sources).map(([k, v]) => k + ':' + v.qualitys.join('/')).join(' ') : ''}`))

  // 设置页
  await clickText('.nav-item', '设置')
  await sleep(1200)
  await shot('10-settings')

  // LX 迁移（直接调用主进程读取，再走渲染进程的导入逻辑）
  const lists = api['lx.readDb']()
  log('lx lists', lists.map(l => `${l.name}:${l.songs.length}`))
  await js(`window.__lx = ${JSON.stringify(lists.map(l => ({ ...l, songs: l.songs.slice(0, 400) })))}`)
  await js(`document.querySelector('.page').scrollTop = 99999`)
  await sleep(300)
  await clickText('.btn', '一键迁移')
  await waitFor(`document.querySelector('.modal')`, 8000)
  await sleep(400)
  await shot('11-lx-import-confirm')
  await clickText('.modal .btn', '导入')
  await sleep(1500)
  await shot('12-lx-imported')

  // 打开第一个导入的歌单，播放第 60 首，然后滚到顶部看「定位」按钮
  await js(`[...document.querySelectorAll('.lists .nav-item')][2].click()`)
  await waitFor(`document.querySelectorAll('.song-row').length > 5`)
  await sleep(600)
  await shot('13-mylist')
  await js(`document.querySelector('.page').scrollTop = 54 * 58`)
  await sleep(500)
  await js(`document.querySelectorAll('.song-row')[8].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  const ok = await waitFor(`document.querySelector('.player-bar .time').textContent != '00:00'`, 45000)
  log('mylist playing', ok, await js(`return document.querySelector('.player-bar .name')?.textContent`))
  await js(`document.querySelector('.page').scrollTop = 0`)
  await sleep(700)
  await shot('14-locate-button')
  await click('.locate-btn')
  await sleep(1200)
  await shot('15-located')

  // 切到别的页面，再点播放栏的「来源」回到歌单并定位
  await clickText('.nav-item', '排行榜')
  await waitFor(`document.querySelectorAll('.song-row').length > 5`, 20000)
  await sleep(800)
  await shot('16-boards')
  await click('.player-bar .from')
  await sleep(1500)
  await shot('17-back-located')
  log('located row visible', await js(`const r = document.querySelector('.song-row.playing'); return r ? r.getBoundingClientRect().top : null`))

  // 播放队列
  await click('.player-bar .right .icon-btn:last-child')
  await sleep(900)
  await shot('18-queue')
  await click('.mask')

  // 模拟听歌记录：让推荐引擎有画像
  const sample = lists.flatMap(l => l.songs).slice(0, 40)
  for (const s of sample) { api['stats.record'](s, 'play'); api['stats.record'](s, 'done') }
  const t0 = Date.now()
  const daily = await api['rec.daily'](true)
  log('daily', daily.songs.length, 'cold', daily.cold, 'ms', Date.now() - t0, daily.songs.slice(0, 8).map(s => `${s.name}-${s.singer} (${s._reason})`))
  await clickText('.nav-item', '每日推荐')
  await waitFor(`document.querySelectorAll('.song-row').length > 5`, 30000)
  await sleep(1200)
  await shot('19-daily')

  // 相似电台
  const radio = await api['rec.radio']([sample[0]], [], 10)
  log('radio for', sample[0].name, '=>', radio.map(s => `${s.name}-${s.singer}`))
  const disc = await api['rec.discover']()
  log('discover', disc.hasProfile, disc.topArtists, disc.forYouLists.map(l => l.name).slice(0, 5))

  // 歌单广场
  await clickText('.nav-item', '歌单广场')
  await waitFor(`document.querySelectorAll('.list-card').length > 5`, 20000)
  await sleep(1500)
  await shot('20-songlists')
  await clickText('.chip', '更多分类')
  await sleep(500)
  await shot('21-songlists-tags')
  await click('.list-card')
  await waitFor(`document.querySelectorAll('.song-row').length > 3`, 25000)
  await sleep(1200)
  await shot('22-listdetail')

  // 桌面歌词
  api['lyric.toggle'](true)
  await sleep(2500)
  const lw = getLyricWin()
  if (lw) {
    const img = await lw.webContents.capturePage()
    fs.writeFileSync(path.join(process.env.VEYA_E2E_OUT, '23-desktop-lyric.png'), img.toPNG())
    log('lyric win bounds', lw.getBounds())
  }
  api['lyric.toggle'](false)

  // 深色主题
  await clickText('.nav-item', '发现')
  await sleep(600)
  await js(`document.documentElement.dataset.theme = 'dark'`)
  await sleep(600)
  await shot('24-dark-discover')
  await click('.cover-btn')
  await sleep(1500)
  await shot('25-dark-now')
  await js(`document.documentElement.dataset.theme = 'light'`)
  log('toasts', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`))
}
