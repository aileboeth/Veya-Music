// 0.1.3 巡检：批量导入（旧版本不覆盖新版本）、检查音源更新、一键更新、测速、停用失效音源
const path = require('path')
const fs = require('fs')

module.exports = async({ api, importSourceFiles, js, shot, clickText, sleep, log, win }) => {
  win().setSize(1280, 900)
  const dir = process.env.VEYA_E2E_SOURCES
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
  const r = importSourceFiles(files)
  log(`imported ${r.ok.length}; skipped: ${JSON.stringify(r.failed)}`)
  log('xinghai version', api['source.list']().find(s => s.name == '星海音乐源')?.version)

  await api['source.checkUpdates']()
  const alerts = api['source.list']().filter(s => s.updateAlert)
  log('alerts', alerts.map(s => `${s.name} ${s.version}: ${s.updateAlert.log.replace(/\s+/g, ' ').slice(0, 60)} -> ${s.updateAlert.updateUrl}`))
  for (const s of alerts) {
    const res = await api['source.update'](s.id).catch(e => ({ error: e.message }))
    log('update', s.name, JSON.stringify(res), '=> now', api['source.list']().find(x => x.name == s.name)?.version)
  }

  const list = await api['source.speedTest']()
  for (const s of list) {
    const okCount = s.speed ? Object.values(s.speed).filter(c => c.ok).length : 0
    log(`[${okCount}/${s.speed ? Object.keys(s.speed).length : 0}] ${s.name} ${s.version} => ` + (s.speed ? Object.entries(s.speed).map(([k, c]) => c.ok ? `${k} ${c.ms}ms` : `${k} X`).join(' | ') : '-'))
  }
  await clickText('.nav-item', '设置')
  await sleep(1200)
  await shot('50-sources')
  await js(`document.querySelector('.page').scrollTop = 900`)
  await sleep(500)
  await shot('51-sources-2')
  await js(`document.querySelector('.page').scrollTop = 0`)
  log('dead button', await js(`return [...document.querySelectorAll('.btn')].find(b => b.textContent.includes('失效音源'))?.textContent ?? ''`))
  await clickText('.btn', '失效音源')
  await sleep(1500)
  log('enabled after', api['source.list']().filter(s => s.enabled).length, '/', api['source.list']().length, 'toasts', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`))
}
