// 桌面歌词：文字透明度 + 底板，三种组合各截一张（.e2e/out/lyric-*.png）
module.exports = async({ api, getLyricWin, shot, sleep, log }) => {
  await api['lyric.toggle'](true)
  await sleep(1500)
  for (const [name, conf] of [['lyric-default', { textAlpha: 1, bgAlpha: 0 }], ['lyric-band', { textAlpha: 1, bgAlpha: 0.55 }], ['lyric-faint', { textAlpha: 0.45, bgAlpha: 0.3 }]]) {
    await api['lyric.setConf'](conf)
    await sleep(700)
    const w = getLyricWin()
    if (!w) { log('FAIL no lyric window'); return }
    await shot(name, w)
  }
  await api['lyric.setConf']({ textAlpha: 1, bgAlpha: 0 })
  log('PASS lyric shots')
}
