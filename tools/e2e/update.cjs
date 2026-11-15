// 自动更新自测：本地 HTTP 服务器提供一个更高版本的安装包，验证「检查 → 下载 → SHA512 校验 → 提示重启」
// 准备：npx electron-builder --win --publish never -c.extraMetadata.version=9.9.9 -c.directories.output=.e2e/dist-next
// 运行：$env:VEYA_UPDATE_URL='http://127.0.0.1:47615/'; powershell -File tools\run-e2e.ps1 -Steps tools\e2e\update.cjs
const http = require('http')
const fs = require('fs')
const path = require('path')

module.exports = async({ api, js, shot, sleep, log, clickText, win }) => {
  win().setSize(1280, 820)
  const dir = path.join(__dirname, '..', '..', '.e2e', 'dist-next')
  const requests = []
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '')
    const file = path.join(dir, path.basename(name))
    requests.push(`${req.method} ${name}${req.headers.range ? ' [range]' : ''}`)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'Content-Length': fs.statSync(file).size })
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(47615, '127.0.0.1', resolve))

  log('before', api['update.state']())
  await clickText('.nav-item', '设置')
  await sleep(500)
  await js(`document.querySelector('.page').scrollTop = 99999`)
  await sleep(300)
  await shot('40-update-idle')
  await clickText('.btn', '检查更新')
  const t0 = Date.now()
  let last = ''
  while (Date.now() - t0 < 180000) {
    const s = api['update.state']()
    if (s.status != last) { last = s.status; log('state', s.status, s.version, s.percent, s.message) }
    if (s.status == 'downloaded' || s.status == 'error' || s.status == 'none') break
    await sleep(500)
  }
  log('final', api['update.state'](), 'seconds', Math.round((Date.now() - t0) / 1000))
  log('requests', [...new Set(requests)])
  await sleep(800)
  await shot('41-update-downloaded')
  await clickText('.update-btn', '重启更新')
  await sleep(600)
  await shot('42-update-confirm')
  await clickText('.modal .btn', '取消')
  server.close()
}
