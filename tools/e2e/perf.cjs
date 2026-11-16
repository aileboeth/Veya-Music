// 性能巡检：播放页（封面居中 + 环形律动）的歌词跟随、各进程的内存和 CPU
// 用法：$env:VEYA_E2E_SOURCES='音源文件夹'; powershell -File tools\run-e2e.ps1 -Steps tools\e2e\perf.cjs -Fresh
const fs = require('fs')
const path = require('path')

module.exports = async({ app, importSourceFiles, js, shot, waitFor, clickText, sleep, log, win }) => {
  const t0 = Date.now()
  win().setSize(1280, 860)
  const dir = process.env.VEYA_E2E_SOURCES
  importSourceFiles(fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)))

  const metrics = async name => {
    app.getAppMetrics()
    await sleep(3000)
    const list = app.getAppMetrics()
    const by = {}
    let total = 0
    let cpu = 0
    for (const m of list) {
      const mb = (m.memory.privateBytes ?? m.memory.workingSetSize) / 1024
      const key = m.type == 'Utility' ? (m.serviceName || m.name || 'Utility') : m.type
      by[key] ??= { n: 0, mb: 0, cpu: 0 }
      by[key].n++
      by[key].mb = Math.round(by[key].mb + mb)
      by[key].cpu = Math.round((by[key].cpu + m.cpu.percentCPUUsage) * 10) / 10
      total += mb
      cpu += m.cpu.percentCPUUsage
    }
    log(`[${name}] +${Math.round((Date.now() - t0) / 1000)}s 进程 ${list.length} 个，内存合计 ${Math.round(total)} MB，CPU ${cpu.toFixed(1)}%`, by)
  }
  /** 正在唱的那一句在歌词框里的位置（0 = 顶，1 = 底） */
  const follow = () => js(`
    const box = document.querySelector('.now .lyric'), on = document.querySelector('.now .line.on')
    if (!box || !on) return null
    const b = box.getBoundingClientRect(), r = on.getBoundingClientRect()
    return { pos: +((r.top + r.height / 2 - b.top) / b.height).toFixed(2), boxH: Math.round(b.height), text: on.querySelector('.txt').textContent, layers: document.querySelectorAll('.now .line[style*="blur"]').length, lines: document.querySelectorAll('.now .line').length }
  `)

  await metrics('刚启动')
  await clickText('.nav-item', '排行榜')
  await waitFor(`document.querySelectorAll('.song-row').length > 3`, 30000)
  await js(`document.querySelectorAll('.song-row')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
  log('playing', await waitFor(`document.querySelector('.song-row.playing .eq:not(.paused)')`, 40000))
  await sleep(3000)
  await metrics('播放中，主界面')

  await js(`document.querySelector('.cover-btn').click()`)
  log('line on', await waitFor(`document.querySelector('.now .line.on')`, 90000))
  await sleep(2500)
  log('side', await js(`return [...document.querySelectorAll('.now header .pill')].map(b => b.textContent).join(' / ')`), await follow())
  await metrics('播放页 封面在左')
  await shot('p1-side')

  await js(`document.querySelectorAll('.now header .pill')[0].click()`)
  await sleep(2500)
  log('center', await js(`return [...document.querySelectorAll('.now header .pill')].map(b => b.textContent).join(' / ')`), await follow())
  await shot('p2-center')
  // 等下一句唱起来，看有没有跟着滚
  const cur = (await follow())?.text
  await waitFor(`document.querySelector('.now .line.on .txt')?.textContent != ${JSON.stringify(cur)}`, 30000)
  await sleep(1500)
  log('center next line', await follow())
  await metrics('播放页 封面居中')

  // 等启动后的「音源更新检查」跑完（20 秒时开始，会把所有音源都启动一遍）
  while (Date.now() - t0 < 50_000) await sleep(1000)
  await metrics('音源更新检查之后')
  while (Date.now() - t0 < 80_000) await sleep(1000)
  await metrics('再过 30 秒')
  await shot('p3-end')

  // 窗口收到托盘：律动和动画应该停下来
  win().hide()
  await sleep(2000)
  await metrics('窗口隐藏到托盘')
}
