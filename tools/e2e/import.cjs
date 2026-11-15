// 歌单导入巡检：五个平台的分享链接、汽水音乐、文本歌单
module.exports = async({ api, js, shot, sleep, log, win }) => {
  win().setSize(1280, 900)
  const lists = () => js(`return [...document.querySelectorAll('.lists .nav-item')].map(b => b.textContent.trim())`)
  const fill = async(text) => {
    await js(`document.querySelector('.lists-head .icon-btn').click()`)
    await sleep(400)
    await js(`const t = document.querySelector('textarea.area'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input'))`)
    await sleep(200)
  }
  const waitClosed = async(max = 150) => {
    for (let i = 0; i < max; i++) {
      await sleep(1000)
      if (!await js(`return !!document.querySelector('textarea.area')`)) return true
    }
    return false
  }
  const clickImport = () => js(`[...document.querySelectorAll('.modal .btn.primary')].find(b => b.textContent.trim() == '导入').click()`)

  // 各平台取一个真实的公开歌单，拼成 App 分享出来的样子
  const first = async(src) => (await api['songlist.lists'](src, null, null, 1)).list[0]
  const samples = {}
  for (const src of ['wy', 'tx', 'kg', 'kw', 'mg']) {
    try { samples[src] = await first(src) } catch (e) { log(src, 'sample ERR', e.message) }
  }
  const num = id => String(id).replace(/^id_/, '').replace(/^digest-\d+__/, '')
  const shares = {
    wy: s => `分享歌单: ${s.name} https://music.163.com/playlist?id=${num(s.id)}&userid=1 (来自@网易云音乐)`,
    tx: s => `${s.name} https://i.y.qq.com/n2/m/share/details/taoge.html?hosteuin=oK&id=${num(s.id)}&appversion=130 @QQ音乐`,
    kg: s => `我分享了歌单《${s.name}》https://www.kugou.com/yy/special/single/${num(s.id)}.html`,
    kw: s => `${s.name} https://m.kuwo.cn/newh5app/playlist_detail/${num(s.id)}?from=share，快来听听吧`,
    mg: s => `咪咕音乐歌单 https://music.migu.cn/v3/music/playlist/${num(s.id)}`,
  }

  // 1. 网易云：走界面
  await fill(shares.wy(samples.wy))
  await shot('60-import-dialog')
  await clickImport()
  log('wy via UI closed', await waitClosed(60), 'lists', await lists(), 'toasts', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`))
  await sleep(800)
  await shot('61-import-wy')

  // 2. 其余平台：直接调接口
  for (const src of ['tx', 'kg', 'kw', 'mg']) {
    if (!samples[src]) continue
    const t0 = Date.now()
    try {
      const r = await api['import.playlist'](shares[src](samples[src]))
      log(src, 'OK', r.platformName, `「${r.name}」`, r.songs.length, '/', r.total, 'id', r.sourceListId, `${Date.now() - t0}ms`)
    } catch (e) { log(src, 'ERR', e.message) }
  }

  // 3. 识别不了的情况
  for (const bad of ['https://example.com/playlist/1', '123456', '']) {
    try { await api['import.playlist'](bad); log('bad', bad, 'unexpected OK') } catch (e) { log('bad', JSON.stringify(bad), '=>', e.message) }
  }

  // 4. 汽水音乐
  for (const url of (process.env.VEYA_E2E_QISHUI || 'https://music.douyin.com/qishui/share/playlist?playlist_id=7267071266878717952').split('|')) {
    const t0 = Date.now()
    try {
      const r = await api['import.playlist'](`我在汽水音乐分享了歌单 ${url} 快来听`)
      log('qs OK', `「${r.name}」`, r.songs.length, '/', r.total, `${Date.now() - t0}ms`, 'sources', JSON.stringify(r.songs.reduce((m, s) => (m[s.source] = (m[s.source] || 0) + 1, m), {})))
      log('qs sample', r.songs.slice(0, 6).map(s => `${s.name}-${s.singer}[${s.source} ${s.interval}]`).join(' | '))
      log('qs missing', r.missing.join(' | '))
    } catch (e) { log('qs ERR', e.message) }
  }

  // 5. 文本歌单：走界面，其中一首是找不到的
  await fill(['1. 晴天 - 周杰伦', '2、光辉岁月 - Beyond', '陈奕迅 - 十年', '稻香', 'zzqqxxkk不存在的歌 - 没有这个人'].join('\n'))
  await clickImport()
  await sleep(1500)
  await shot('62-import-progress')
  log('text via UI closed', await waitClosed(120), 'lists', await lists())
  await sleep(600)
  log('alert', await js(`return document.querySelector('.modal h3')?.textContent + ' || ' + (document.querySelector('.modal .msg')?.textContent ?? '').slice(0, 200)`))
  log('rows', await js(`return [...document.querySelectorAll('.song-row, .row.song, tr.song')].slice(0, 6).map(r => r.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60))`))
  await shot('63-import-text')
}
