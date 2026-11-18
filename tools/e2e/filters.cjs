// 歌单广场 / 搜索歌单的排序筛选、我的歌单里歌曲排序、桌面歌词透明度设置（截图到 .e2e/out）
module.exports = async({ api, js, shot, sleep, clickText, log, waitFor, win }) => {
  const check = (ok, msg) => log(ok ? 'PASS' : 'FAIL', msg)
  win().setSize(1240, 860)
  await js(`window.__veya.settings.proxy = { ...window.__veya.settings.proxy, mode: 'direct' }; return 1`)
  const counts = () => js(`return [...document.querySelectorAll('.list-card')].map(c => {
    const t = c.querySelector('.count')?.textContent.trim() ?? ''
    const m = /([\\d.]+)\\s*(万|亿)?/.exec(t); const n = m ? parseFloat(m[1]) * (m[2] == '亿' ? 1e8 : m[2] == '万' ? 1e4 : 1) : 0
    const f = c.querySelector('.fav')?.textContent.trim() ?? ''
    const fm = /([\\d.]+)\\s*(万|亿)?/.exec(f); const fn = fm ? parseFloat(fm[1]) * (fm[2] == '亿' ? 1e8 : fm[2] == '万' ? 1e4 : 1) : 0
    return [n, fn] })`)
  const desc = arr => arr.every((v, i) => !i || arr[i - 1] >= v)

  // ---- 歌单广场（网易云：播放量和收藏量都有）----
  await clickText('.nav-item', '歌单广场')
  await waitFor(`document.querySelectorAll('.list-card').length > 10`, 30000)
  await clickText('.list-filter .tabs button', '播放最多')
  await sleep(600)
  let c = await counts()
  check(c.length > 10 && desc(c.map(x => x[0])), `广场按播放量从高到低（${c.length} 个，前 5：${c.slice(0, 5).map(x => x[0]).join(', ')}）`)
  await clickText('.list-filter .chip', '10万+')
  await sleep(4000)
  c = await counts()
  check(c.length > 0 && c.every(x => x[0] >= 1e5), `只看 10 万+：${c.length} 个，最少 ${Math.min(...c.map(x => x[0]))}`)
  await shot('filter-square-play')
  await clickText('.list-filter .tabs button', '收藏最多')
  await sleep(600)
  c = await counts()
  check(desc(c.map(x => x[1])), `按收藏量从高到低（前 5：${c.slice(0, 5).map(x => x[1]).join(', ')}）`)
  await shot('filter-square-collect')
  await clickText('.list-filter .chip', '不限')
  await clickText('.list-filter .tabs button', '默认')

  // ---- 搜索歌单 ----
  await js(`window.__veya.go ? window.__veya.go('search', { text: '周杰伦' }) : null; return 1`)
  const hasGo = await js(`return !!window.__veya.go`)
  if (!hasGo) {
    await js(`const i = document.querySelector('.search input, input[placeholder*="搜索"]'); i.value = '周杰伦'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1`)
  }
  await sleep(1500)
  await clickText('.tabs button', '歌单')
  await waitFor(`document.querySelectorAll('.list-card').length > 5`, 30000)
  await clickText('.list-filter .tabs button', '播放最多')
  await sleep(600)
  c = await counts()
  check(c.length > 5 && desc(c.map(x => x[0])), `搜索歌单按播放量（${c.length} 个，前 5：${c.slice(0, 5).map(x => x[0]).join(', ')}）`)
  await shot('filter-search')

  // ---- 我的歌单：按「听得最多」排 ----
  const mk = i => ({ id: 'kw_sort' + i, name: ['晴天', '稻香', '七里香', '夜曲'][i], singer: '周杰伦', source: 'kw', songmid: 'sort' + i, interval: ['04:29', '03:43', '04:59', '03:46'][i], albumName: '', types: [], _types: {} })
  await js(`const L = window.__veya.lists; const mk = ${mk.toString()}; L.createList('排序测试', [mk(0), mk(1), mk(2), mk(3)]); return 1`)
  for (let n = 0; n < 3; n++) api['stats.record'](mk(2), 'play')
  api['stats.record'](mk(1), 'play')
  await sleep(500)
  await clickText('.nav-item, .side-list a, .my-list, a', '排序测试')
  await waitFor(`document.querySelectorAll('.song-row').length == 4`, 10000)
  await clickText('.song-list .toolbar button', '默认顺序')
  await sleep(300)
  await js(`const el = [...document.querySelectorAll('*')].filter(e => e.children.length == 0 && e.textContent.trim().endsWith('我听得最多')).pop(); (el.closest('button, li, .item, [class*=item]') ?? el).click(); return 1`)
  await sleep(500)
  const names = await js(`return [...document.querySelectorAll('.song-row .name')].map(e => e.textContent.trim())`)
  check(names[0] == '七里香' && names[1] == '稻香', `我听得最多：${names.join(' / ')}`)
  await shot('mylist-sort')
  await clickText('.song-list .toolbar .tabs button', '没听过')
  await sleep(300)
  const fresh = await js(`return [...document.querySelectorAll('.song-row .name')].map(e => e.textContent.trim())`)
  check(fresh.length == 2 && !fresh.includes('七里香'), `没听过：${fresh.join(' / ')}`)
  await clickText('.song-list .toolbar .tabs button', '全部')
  await js(`window.__veya.settings.myListSort = 'default'; return 1`)

  // ---- 设置：桌面歌词的两个滑块 ----
  await clickText('.nav-item', '设置')
  await sleep(800)
  await js(`const h = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('桌面歌词')); h.scrollIntoView(); return 1`)
  await sleep(400)
  const sliders = await js(`return document.querySelectorAll('.set-slider').length`)
  check(sliders == 2, `设置里有文字透明度和底板两个滑块（${sliders}）`)
  await api['lyric.setConf']({ textAlpha: 0.6, bgAlpha: 0.5 })
  await sleep(500)
  const conf = await api['lyric.conf']()
  check(conf.textAlpha == 0.6 && conf.bgAlpha == 0.5, `保存了透明度设置 ${JSON.stringify({ t: conf.textAlpha, b: conf.bgAlpha })}`)
  await shot('settings-lyric-alpha')
}
