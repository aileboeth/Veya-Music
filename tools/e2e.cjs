// 开发用端到端测试驱动：由主进程在 VEYA_DEV_SCRIPT 指定时加载
// 用法见 tools/run-e2e.ps1；步骤脚本通过 VEYA_E2E_STEPS 指定
const fs = require('fs')
const path = require('path')

module.exports = async({ app, api, userApi, music, store, importSourceFiles, getMainWin, getLyricWin }) => {
  const outDir = process.env.VEYA_E2E_OUT
  fs.mkdirSync(outDir, { recursive: true })
  const logFile = path.join(outDir, 'log.txt')
  fs.writeFileSync(logFile, '')
  const log = (...args) => fs.appendFileSync(logFile, args.map(a => typeof a == 'string' ? a : JSON.stringify(a)).join(' ') + '\n')
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const win = () => getMainWin()
  const js = code => win().webContents.executeJavaScript(`(async () => { ${code} })()`, true)
  const shot = async(name, w = win()) => {
    const img = await w.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG())
    log('shot', name)
  }
  const waitFor = async(code, timeout = 20000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (await js(`return !!(${code})`).catch(() => false)) return true
      await sleep(250)
    }
    log('waitFor timeout:', code)
    return false
  }
  const click = sel => js(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true`)
  const clickText = (sel, text) => js(`const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true`)

  win().webContents.on('console-message', (e) => { if (e.level == 'error' || e.level == 3) log('[renderer error]', e.message) })
  process.on('uncaughtException', err => log('[main uncaught]', err.stack))
  process.on('unhandledRejection', err => log('[main unhandled]', String(err && err.stack || err)))

  try {
    await waitFor(`document.querySelector('.sidebar')`)
    await sleep(800)
    const steps = require(process.env.VEYA_E2E_STEPS)
    await steps({ app, api, userApi, music, store, importSourceFiles, win, getLyricWin, js, shot, waitFor, click, clickText, sleep, log })
    log('DONE')
  } catch (err) {
    log('FAILED', err.stack || String(err))
  }
  app.exit(0)
}
