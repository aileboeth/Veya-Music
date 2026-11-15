// 歌词动效巡检：播放页的逐字歌词 + 桌面歌词（单行 / 双行交错 / 跳动 / 位置）
// 用法：$env:VEYA_E2E_SOURCES='音源文件夹'; powershell -File tools\run-e2e.ps1 -Steps tools\e2e\lyric-fx.cjs -Fresh
const fs = require('fs')
const path = require('path')

module.exports = async({ api, importSourceFiles, js, shot, waitFor, clickText, sleep, log, win, getLyricWin }) => {
  win().setSize(1280, 860)
  const dir = process.env.VEYA_E2E_SOURCES
  importSourceFiles(fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)))

  await clickText('.nav-item', '排行榜')
  await waitFor(`document.querySelectorAll('.song-row').length > 3`, 30000)
  await js(`document.querySelectorAll('.song-row')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  log('playing', await waitFor(`document.querySelector('.song-row.playing .eq:not(.paused)')`, 40000), await js(`return document.querySelector('.song-row.playing .name')?.textContent`))

  // 播放页
  await js(`document.querySelector('.cover-btn').click()`)
  log('line on', await waitFor(`document.querySelector('.now .line.on')`, 90000))
  await sleep(1500)
  const state = () => js(`
    const on = document.querySelector('.now .line.on')
    const us = [...on.querySelectorAll('.u')]
    return { text: on.querySelector('.txt').textContent, units: us.length, filled: us.filter(u => parseFloat(u.style.getPropertyValue('--p')) >= 1).length, partial: us.filter(u => { const p = parseFloat(u.style.getPropertyValue('--p')); return p > 0 && p < 1 }).length, raised: us.filter(u => u.style.transform).length, blurNext: on.nextElementSibling?.style.filter ?? '', gaps: document.querySelectorAll('.now .gap').length }
  `)
  log('now-playing a', await state())
  await sleep(700)
  log('now-playing b', await state())
  await shot('80-now-lyric')

  // 桌面歌词
  api['lyric.toggle'](true)
  await sleep(3000)
  const lw = getLyricWin()
  const ljs = code => lw.webContents.executeJavaScript(`(async () => { ${code} })()`, true)
  await ljs(`document.body.style.background = 'linear-gradient(120deg, #2b3350, #51406e)'`)
  const lshot = async name => {
    fs.writeFileSync(path.join(process.env.VEYA_E2E_OUT, name + '.png'), (await lw.webContents.capturePage()).toPNG())
    log('shot', name)
  }
  const lstate = () => ljs(`
    const us = [...document.querySelectorAll('.row.main .u')]
    return { rows: document.querySelectorAll('.row.main').length, sub: document.querySelector('.row.sub')?.textContent ?? '', text: [...document.querySelectorAll('.row.main')].map(r => r.textContent.trim()), units: us.length, filled: us.filter(u => parseFloat(u.style.getPropertyValue('--p')) >= 1).length, moving: us.filter(u => u.style.transform).length, dots: !!document.querySelector('.dots') }
  `)
  // 等间奏过去、真正唱起来
  for (let i = 0; i < 120; i++) {
    const s = await lstate()
    if (s.dots) { if (i == 0) { log('interlude dots', s); await lshot('81a-desktop-dots') } }
    else if (s.units > 3 && s.filled >= 1) break
    await sleep(500)
  }
  log('desktop single a', await lstate())
  await sleep(600)
  log('desktop single b', await lstate())
  await lshot('81-desktop-single')

  await api['lyric.setConf']({ mode: 'double' })
  await sleep(1200)
  log('desktop double', await lstate())
  await lshot('82-desktop-double')

  await api['lyric.setConf']({ mode: 'single', effect: 'bounce', align: 'left', color: 'gold' })
  await sleep(1200)
  log('desktop bounce', await lstate(), await ljs(`return [...document.querySelectorAll('.row.main .u')].map(u => u.style.transform).filter(Boolean).slice(0, 3)`))
  await lshot('83-desktop-bounce-left')

  // 暂停后填色应该停住
  await ljs(`0`)
  api['lyric.command']('toggle')
  await sleep(900)
  const p1 = await lstate()
  await sleep(900)
  const p2 = await lstate()
  log('paused frozen', p1.filled == p2.filled, p1.filled, p2.filled)
  api['lyric.command']('toggle')

  for (const where of ['top', 'middle', 'bottom']) {
    api['lyric.place'](where)
    await sleep(300)
    log('place', where, lw.getBounds())
  }
  await api['lyric.setConf']({ effect: 'fill', align: 'center', color: 'aurora' })

  // 设置页
  await js(`document.querySelector('.now header .icon-btn').click()`)
  await clickText('.nav-item', '设置')
  await sleep(600)
  await js(`[...document.querySelectorAll('h2')].find(h => h.textContent == '桌面歌词').scrollIntoView()`)
  await sleep(400)
  await shot('84-settings-lyric')
  api['lyric.toggle'](false)
}
