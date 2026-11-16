// 生成安卓图标：自适应图标（白色底板 + 渐变波形 + 主题图标用的单色层）和通知栏小图标
// 用法：node tools/make-android-icons.cjs
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res')
const WAVE = 'M236 512 C 274 512, 288 432, 326 432 C 366 432, 368 598, 402 598 C 440 598, 440 318, 482 318 C 528 318, 520 712, 566 712 C 608 712, 606 418, 650 418 C 690 418, 700 512, 738 512 L 788 512'
const DEFS = `<defs>
  <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2f8"/></linearGradient>
  <linearGradient id="wave" gradientUnits="userSpaceOnUse" x1="236" y1="0" x2="788" y2="0">
    <stop offset="0" stop-color="#12f1e4"/><stop offset="0.3" stop-color="#18b6ff"/><stop offset="0.62" stop-color="#2a62ff"/><stop offset="0.82" stop-color="#6a3dfc"/><stop offset="1" stop-color="#a23bf6"/>
  </linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
</defs>`
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${DEFS}${body}</svg>`)
const fg = svg(`<path d="${WAVE}" fill="none" stroke="url(#wave)" stroke-width="62" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.6"/><path d="${WAVE}" fill="none" stroke="url(#wave)" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/>`)
const bg = svg('<rect width="1024" height="1024" fill="url(#plate)"/>')
const mono = svg(`<path d="${WAVE}" fill="none" stroke="#000" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/>`)
// 通知栏图标：白色、无发光，波形放大到撑满
const NOTE_WAVE = 'M40 512 C 100 512, 120 400, 180 400 C 240 400, 250 640, 300 640 C 360 640, 360 240, 420 240 C 490 240, 480 800, 550 800 C 610 800, 610 360, 680 360 C 740 360, 760 512, 820 512 L 984 512'
const note = svg(`<path d="${NOTE_WAVE}" fill="none" stroke="#fff" stroke-width="84" stroke-linecap="round" stroke-linejoin="round"/>`)

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const out = async(buf, size, file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await sharp(buf, { density: 300 }).resize(size, size).png().toFile(file)
}

;(async() => {
  for (const [d, k] of Object.entries(DENS)) {
    await out(fg, Math.round(108 * k), path.join(res, `mipmap-${d}`, 'ic_launcher_foreground.png'))
    await out(bg, Math.round(108 * k), path.join(res, `mipmap-${d}`, 'ic_launcher_background.png'))
    await out(mono, Math.round(108 * k), path.join(res, `mipmap-${d}`, 'ic_launcher_monochrome.png'))
    await out(note, Math.round(24 * k), path.join(res, `drawable-${d}`, 'ic_notify.png'))
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true })
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'), xml)
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), xml)
  console.log('android icons written to', res)
})()
