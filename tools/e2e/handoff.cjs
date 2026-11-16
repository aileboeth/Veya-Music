// 电脑 ⇄ 手机联动测试（电脑这一侧）：配对 → 播放 → 等手机接力 / 推歌 / 邀请一起听，期间每 3 秒记录一次状态
module.exports = async({ api, js, log, sleep }) => {
  const code = process.env.VEYA_E2E_PAIR
  await js(`window.__veya.settings.proxy = { ...window.__veya.settings.proxy, mode: 'direct' }; return 1`)
  await sleep(800)
  if (!api['sync.state']().paired) await api['sync.pair'](code, '测试电脑')
  for (let i = 0; i < 40 && !api['sync.state']().online; i++) await sleep(500)
  log('paired', JSON.stringify({ online: api['sync.state']().online, devices: api['sync.state']().devices.map(d => d.name + (d.online ? '+' : '-')) }))
  if (!process.env.VEYA_E2E_NOPLAY) {
    const r = await api['search.music']('tx', '七里香 周杰伦', 1, 5)
    await js(`window.__veya.playerApi.playList(${JSON.stringify(r.list)}, 0, { type: 'search', name: '电脑搜索：七里香' }); return 1`)
  }
  // 自动接受「一起听」邀请
  const t0 = Date.now()
  while (Date.now() - t0 < Number(process.env.VEYA_E2E_SECONDS || 150) * 1000) {
    await sleep(3000)
    const st = await js(`const p = window.__veya.player; const ok = [...document.querySelectorAll('.modal .btn.primary')].find(b => b.textContent.includes('一起听')); if (ok) ok.click(); return JSON.stringify({ song: p.song?.name, playing: p.playing, t: Math.round(p.time * 10) / 10, following: window.__veya.remote.remote.following ? 'yes' : '', accepted: !!ok, epoch: Math.round(window.__veya.remote.serverNow() - window.__veya.playerApi.getTime() * 1000) })`)
    log(new Date().toISOString().slice(11, 19), st)
  }
}