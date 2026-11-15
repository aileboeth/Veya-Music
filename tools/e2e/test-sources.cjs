// 批量检验一个文件夹里的音源脚本：逐个导入 → 测速 → 输出每个脚本在各平台的结果
// 用法：$env:VEYA_E2E_SOURCES='文件夹'; powershell -File tools\run-e2e.ps1 -Steps tools\e2e\test-sources.cjs -Fresh
const path = require('path')
const fs = require('fs')

module.exports = async({ api, importSourceFiles, log }) => {
  const dir = process.env.VEYA_E2E_SOURCES
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f))
  const r = importSourceFiles(files)
  log(`imported ${r.ok.length}, failed ${JSON.stringify(r.failed)}`)
  const list = await api['source.speedTest']()
  for (const s of list) {
    const cells = s.speed ? Object.entries(s.speed).map(([k, c]) => c.ok ? `${k} ${c.ms}ms` : `${k} X`).join(' | ') : '-'
    const okCount = s.speed ? Object.values(s.speed).filter(c => c.ok).length : 0
    const err = s.speed ? [...new Set(Object.values(s.speed).filter(c => !c.ok).map(c => c.err))].join(' / ').slice(0, 160) : ''
    log(`[${okCount}/5] ${s.name} ${s.version} => ${cells}${err ? '  ERR: ' + err : ''}${s.updateAlert ? '  UPDATE: ' + s.updateAlert.log.replace(/\s+/g, ' ').slice(0, 100) + ' ' + (s.updateAlert.updateUrl ?? '') : ''}`)
  }
}
