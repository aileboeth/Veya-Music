// 0.1.2 巡检：音源测速（直连 vs 固定端口）、自动选源、时长校验换源、不喜欢、设置页截图
const path = require('path')
const fs = require('fs')

module.exports = async({ api, userApi, music, store, importSourceFiles, js, shot, waitFor, click, clickText, sleep, log, win }) => {
  win().setSize(1280, 860)
  const dir = process.env.VEYA_E2E_SOURCES
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
  log('import', importSourceFiles(files).ok.length)

  const fmt = list => list.map(s => `${s.name}: ` + (s.speed ? Object.entries(s.speed).map(([k, c]) => c.ok ? `${k} ${c.ms}ms ${c.kbps}KB/s` : `${k} X(${c.err})`).join(' | ') : '-')).join('\n')

  // 1. 测速（默认：跟随系统）
  let t0 = Date.now()
  let list = await api['source.speedTest']()
  log(`--- speed test [system] ${Date.now() - t0}ms\n` + fmt(list))

  // 2. 选源顺序：酷我的歌应当先用最快的可用脚本
  const kwSong = (await api['board.detail']('kw__16')).list[3]
  let info = await api['music.url'](kwSong, '128k', { refresh: true })
  log('auto pick for kw:', info.scriptName, info.quality)
  await api['data.save']('settings', { ...api['data.load']('settings', {}), sourceOrder: 'manual' })
  const errors = []
  info = await api['music.url'](kwSong, '128k', { refresh: true }).catch(e => ({ scriptName: 'ERR ' + e.message }))
  log('manual pick for kw:', info.scriptName)
  await api['data.save']('settings', { ...api['data.load']('settings', {}), sourceOrder: 'auto' })

  // 3. 设置页截图
  await clickText('.nav-item', '设置')
  await sleep(1500)
  await shot('20-settings-speed')
  await clickText('.tabs button', '固定端口')
  await sleep(600)
  await js(`document.querySelector('.page').scrollTop = 620`)
  await sleep(500)
  await shot('21-settings-network')

  // 4. 固定端口 + 全部网络：再测一次对比
  if (process.env.VEYA_E2E_PROXY_PORT) {
    await js(`const i = document.querySelector('.input.port'); i.value = '${process.env.VEYA_E2E_PROXY_PORT}'; i.dispatchEvent(new Event('input'))`)
    await clickText('.btn', '应用')
    await sleep(300)
    await clickText('.item', '只有检查更新走代理').catch(() => {})
    await js(`[...document.querySelectorAll('.item')].find(e => e.textContent.includes('只有检查更新走代理')).querySelector('.switch').click()`)
    await sleep(1500)
    log('proxy setting', api['data.load']('settings', {}).proxy)
    t0 = Date.now()
    list = await api['source.speedTest']()
    log(`--- speed test [proxy all] ${Date.now() - t0}ms\n` + fmt(list))
    await clickText('.tabs button', '跟随系统')
    await sleep(1200)
    log('proxy setting', api['data.load']('settings', {}).proxy.mode)
  }

  // 5. 时长校验：把歌曲信息的时长改成差 60 秒，应当触发换源，最后退回并提示
  await api['source.speedTest']()
  const fake = { ...kwSong, interval: '09:59' }
  const hot = (await api['board.detail']('tx__26')).list.slice(0, 8).map(s => ({ ...s, _rec: 1, _reason: '近期热门' }))
  const d = new Date(Date.now() - 4 * 3600_000)
  store.save('daily', { date: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, songs: [{ ...fake, _rec: 1, _reason: '时长校验测试' }, ...hot], cold: true })
  log('mismatch test song', kwSong.name, kwSong.interval)
  await clickText('.nav-item', '每日推荐')
  await waitFor(`document.querySelectorAll('.song-row').length > 5`, 40000)
  await sleep(500)
  await shot('22-daily')
  // 悬停第一行看「不喜欢」按钮
  const before = await js(`return document.querySelectorAll('.song-row').length`)
  const firstName = await js(`return document.querySelector('.song-row .name').textContent`)
  await js(`document.querySelector('.song-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  const seen = new Set()
  for (let i = 0; i < 80; i++) {
    for (const t of await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`)) seen.add(t)
    if (i > 8 && await js(`return document.querySelector('.player-bar .time').textContent != '00:00'`)) break
    await sleep(500)
  }
  await sleep(1500)
  await shot('23-daily-playing')
  log('toasts while playing', [...seen])
  log('playing info', await js(`return document.querySelector('.player-bar .quality').title + ' | ' + [...document.querySelectorAll('.player-bar .time')].map(e => e.textContent).join('/')`))
  log('badUrls', Object.keys(store.load('badUrls', {})).length)
  log('player bar dislike btn', await js(`return !!document.querySelector('.player-bar [title^="不喜欢"]')`))
  await click('.player-bar [title^="不喜欢"]')
  await sleep(2500)
  const after = await js(`return document.querySelectorAll('.song-row').length`)
  const nowName = await js(`return document.querySelector('.player-bar .name').textContent`)
  log(`dislike: rows ${before} -> ${after}, was "${firstName}", now playing "${nowName}"`)
  log('dislikes file', Object.values(api['data.load']('dislikes', {}).songs ?? {}).map(s => s.name))
  await shot('24-after-dislike')

  // 6. 更新日志对话框
  await clickText('.nav-item', '设置')
  await sleep(500)
  await js(`document.querySelector('.page').scrollTop = 99999`)
  await sleep(400)
  await clickText('.btn', '更新日志')
  await sleep(600)
  await shot('25-changelog')
  await clickText('.modal .btn', '确定')
}
