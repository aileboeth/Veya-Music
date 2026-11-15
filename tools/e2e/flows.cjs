// 流程：播完自动续播、相似电台、下载（沿用上一次巡检留下的数据目录）
const fs = require('fs')
const path = require('path')

module.exports = async({ api, js, shot, waitFor, click, clickText, sleep, log, win }) => {
  win().setSize(1280, 820)
  const dlDir = path.join(process.env.VEYA_E2E_OUT, 'dl')
  const state = () => js(`return { name: document.querySelector('.player-bar .name')?.textContent, time: document.querySelector('.player-bar .time')?.textContent, from: document.querySelector('.player-bar .from')?.textContent.trim(), toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) }`)

  // 1. 单曲列表 + 顺序播放 → 快进到结尾 → 应自动续播相似歌曲
  await clickText('.lists .nav-item', '试听列表')
  await waitFor(`document.querySelectorAll('.song-row').length == 1`)
  await js(`document.querySelector('.song-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  log('play single', await waitFor(`document.querySelector('.player-bar .time').textContent != '00:00'`, 45000), await state())
  // 拖动进度条到末尾前 3 秒
  await js(`const bar = document.querySelector('.progress .slider'); const r = bar.getBoundingClientRect(); const x = r.left + r.width * 0.992, y = r.top + r.height / 2;
    for (const type of ['pointerdown', 'pointerup']) bar.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true }))`)
  const before = (await state()).name
  const changed = await waitFor(`document.querySelector('.player-bar .name')?.textContent != ${JSON.stringify(before)}`, 60000)
  await sleep(1500)
  log('auto continue', changed, await state())
  await click('.player-bar .right .icon-btn:last-child')
  await sleep(800)
  await shot('30-auto-continue-queue')
  await click('.mask')

  // 2. 相似歌曲电台（右键菜单）
  await js(`document.querySelector('.song-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 400 }))`)
  await sleep(400)
  await shot('31-context-menu')
  await clickText('.menu .item', '相似歌曲电台')
  await waitFor(`document.querySelector('.player-bar .from')?.textContent.includes('相似电台')`, 15000)
  await sleep(6000)
  log('radio', await state(), 'queue', await js(`return document.querySelector('.player-bar') && window.__veyaQueueLen`))
  await click('.player-bar .right .icon-btn:last-child')
  await sleep(800)
  await shot('32-radio-queue')
  await click('.mask')

  // 3. 下载
  const settings = api['data.load']('settings', {})
  api['data.save']('settings', { ...settings, downloadDir: dlDir })
  const songs = api['lx.readDb']()[1].songs.slice(0, 2)
  api['dl.add'](songs, '128k')
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    const tasks = api['dl.list']()
    if (tasks.every(t => t.status == 'done' || t.status == 'error')) break
    await sleep(1000)
  }
  log('downloads', api['dl.list']().map(t => `${t.song.name} ${t.status} ${t.quality} ${t.total} ${t.message}`))
  log('files', fs.existsSync(dlDir) ? fs.readdirSync(dlDir).map(f => `${f} ${fs.statSync(path.join(dlDir, f)).size}`) : 'no dir')
  await clickText('.nav-item', '下载')
  await sleep(800)
  await shot('33-downloads')
  api['data.save']('settings', settings)
}
