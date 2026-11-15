// 冒烟：导入音源 → 发现页 → 搜索 → 播放 → 播放页
const path = require('path')
const fs = require('fs')

module.exports = async({ api, importSourceFiles, js, shot, waitFor, click, clickText, sleep, log, win }) => {
  win().setSize(1280, 820)
  await shot('01-first-run')

  // 导入音源文件夹（绕过文件对话框，直接调用主进程的导入逻辑）
  const dir = process.env.VEYA_E2E_SOURCES // 存放音源脚本的文件夹
  if (!api['source.list']().length) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
    log('import', importSourceFiles(files))
  }
  await sleep(1000)
  log('sources', api['source.list']().map(s => `${s.name} [${s.status}] ${s.message}`))

  await waitFor(`document.querySelectorAll('.list-card').length > 3`, 25000)
  await sleep(2500)
  await shot('02-discover')
  await js(`document.querySelector('.page').scrollTop = 700`)
  await sleep(800)
  await shot('03-discover-2')

  // 搜索
  await js(`const i = document.querySelector('.search input'); i.focus(); i.value = '周杰伦'; i.dispatchEvent(new Event('input')); `)
  await sleep(900)
  await shot('04-search-tips')
  await js(`document.querySelector('.search input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))`)
  await waitFor(`document.querySelectorAll('.song-row').length > 5`, 20000)
  await sleep(1500)
  await shot('05-search')

  // 播放第一首
  await js(`document.querySelector('.song-row').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  const ok = await waitFor(`document.querySelector('.player-bar .time') && document.querySelector('.player-bar .time').textContent != '00:00'`, 45000)
  log('playing', ok)
  await sleep(2500)
  await shot('06-playing')
  log('sources after play', api['source.list']().map(s => `${s.name} [${s.status}] ${s.message}`))
  await click('.cover-btn')
  await sleep(2500)
  await shot('07-now-playing')
  await click('.now header .icon-btn')
  await sleep(500)
  log('toasts', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`))
}
