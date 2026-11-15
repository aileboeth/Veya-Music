// 生成应用图标：白色圆角底 + 青→蓝→紫渐变发光波形
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const pngToIco = require('png-to-ico')

const root = path.join(__dirname, '..')
const WAVE = 'M236 512 C 274 512, 288 432, 326 432 C 366 432, 368 598, 402 598 C 440 598, 440 318, 482 318 C 528 318, 520 712, 566 712 C 608 712, 606 418, 650 418 C 690 418, 700 512, 738 512 L 788 512'

const svg = ({ plate = true, stroke = 46 } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#eef2f8"/>
    </linearGradient>
    <linearGradient id="wave" gradientUnits="userSpaceOnUse" x1="236" y1="0" x2="788" y2="0">
      <stop offset="0" stop-color="#12f1e4"/>
      <stop offset="0.3" stop-color="#18b6ff"/>
      <stop offset="0.62" stop-color="#2a62ff"/>
      <stop offset="0.82" stop-color="#6a3dfc"/>
      <stop offset="1" stop-color="#a23bf6"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="22"/>
      <feOffset dy="14"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  ${plate ? '<rect x="92" y="84" width="840" height="840" rx="196" fill="url(#plate)" filter="url(#shadow)"/><rect x="93.500" y="85.500" width="837" height="837" rx="194.500" fill="none" stroke="#ffffff" stroke-width="3"/>' : ''}
  <path d="${WAVE}" fill="none" stroke="url(#wave)" stroke-width="${stroke + 16}" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.62"/>
  <path d="${WAVE}" fill="none" stroke="url(#wave)" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

;(async () => {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
  fs.mkdirSync(path.join(root, 'src/renderer/src/assets'), { recursive: true })
  const full = Buffer.from(svg())
  fs.writeFileSync(path.join(root, 'build/icon.svg'), full)
  // 应用内使用的无底板波形标志
  fs.writeFileSync(path.join(root, 'src/renderer/src/assets/logo.svg'), svg({ plate: false, stroke: 54 }))

  await sharp(full).resize(512, 512).png().toFile(path.join(root, 'resources/icon.png'))
  await sharp(full).resize(1024, 1024).png().toFile(path.join(root, 'build/icon.png'))
  // 小尺寸图标把线条加粗，保证托盘里看得清
  const small = Buffer.from(svg({ stroke: 66 }))
  await sharp(small).resize(32, 32).png().toFile(path.join(root, 'resources/tray.png'))
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const bufs = await Promise.all(sizes.map(s => sharp(s <= 48 ? small : full).resize(s, s).png().toBuffer()))
  const ico = await (pngToIco.default ?? pngToIco)(bufs)
  fs.writeFileSync(path.join(root, 'build/icon.ico'), ico)
  console.log('icons ok')
})().catch(err => { console.error(err); process.exit(1) })
