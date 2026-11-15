// 冒烟测试：打包 LX musicSdk 并实际请求各平台接口
const path = require('path')
const root = path.join(__dirname, '..')
const out = path.join(root, 'out', 'sdk-test.cjs')
async function bundle() {
  const { rolldown } = require('rolldown')
  const b = await rolldown({ input: path.join(root, 'src/main/lx/utils/musicSdk/index.js'), platform: 'node', external: ['needle', 'tunnel', 'crypto-js'], logLevel: 'silent' })
  await b.write({ file: out, format: 'cjs', exports: 'named' })
}
const t = (p, ms = 20000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))])
;(async () => {
  await bundle()
  const log = console.log
  console.log = () => {}
  const sdk = require(out).default
  const what = process.argv[2] || 'search'
  for (const s of ['kw', 'kg', 'tx', 'wy', 'mg']) {
    try {
      if (what == 'search') {
        const r = await t(sdk[s].musicSearch.search('周杰伦 晴天', 1, 5))
        log(s, 'search', r.list.length, 'total', r.total, JSON.stringify(r.list[0]).slice(0, 400))
      } else if (what == 'board') {
        const b = await t(sdk[s].leaderboard.getBoards())
        const l = await t(sdk[s].leaderboard.getList(b.list[0].id.split('__')[1], 1))
        log(s, 'boards', b.list.length, JSON.stringify(b.list[0]), 'songs', l.list.length, l.list[0] && l.list[0].name)
      } else if (what == 'list') {
        const tags = await t(sdk[s].songList.getTags())
        const sort = sdk[s].songList.sortList
        const l = await t(sdk[s].songList.getList(sort[0].id, '', 1))
        log(s, 'tags', tags.tags.length, 'hot', tags.hotTag.length, 'sort', JSON.stringify(sort), 'lists', l.list.length, JSON.stringify(l.list[0]).slice(0, 300))
        const d = await t(sdk[s].songList.getListDetail(l.list[0].id, 1))
        log(s, 'detail', d.list.length, 'total', d.total, JSON.stringify(d.info).slice(0, 200))
        const sr = await t(sdk[s].songList.search('周杰伦', 1, 5))
        log(s, 'listSearch', sr.list.length, JSON.stringify(sr.list[0]).slice(0, 200))
      } else if (what == 'lyric') {
        const r = await t(sdk[s].musicSearch.search('周杰伦 晴天', 1, 5))
        const m = r.list[0]
        const lr = sdk[s].getLyric(m)
        const ly = await t(lr.promise || lr)
        log(s, 'lyric', Object.keys(ly), (ly.lyric || '').slice(0, 80).replace(/\n/g, '|'))
        const pr = sdk[s].getPic(m)
        const pic = await t(pr.promise || pr).catch(e => 'ERR ' + e.message)
        log(s, 'pic', pic, 'img', m.img)
        const hs = await t(sdk[s].hotSearch.getList()).catch(e => ({ list: ['ERR ' + e.message] }))
        log(s, 'hot', hs.list.slice(0, 3))
        const tip = await t(sdk[s].tipSearch.search('周杰')).catch(e => ['ERR ' + e.message])
        log(s, 'tip', tip.slice(0, 3))
      }
    } catch (e) { log(s, what, 'ERR', e.message) }
  }
  process.exit(0)
})()
