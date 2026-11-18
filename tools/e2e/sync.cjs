// 同步端到端测试：两个独立的数据目录（电脑 A / 电脑 B）连同一个本地 Veya Sync 服务器
// 由 tools/e2e/sync-run.ps1 按阶段启动：A1 → B1 → A2 →（A3 + B2 同时运行）
module.exports = async({ api, userApi, store, js, log, sleep, waitFor, shot, clickText, win }) => {
  const phase = process.env.VEYA_E2E_PHASE
  const code = process.env.VEYA_E2E_PAIR
  const fail = msg => { throw new Error(msg) }
  const check = (ok, msg) => { log(ok ? 'PASS' : 'FAIL', msg); if (!ok) fail(msg) }
  const mk = i => ({ id: 'kw_' + i, name: '测试歌曲' + i, singer: '歌手' + (i % 2), source: 'kw', songmid: String(i), interval: '03:0' + (i % 10), albumName: '', types: [], _types: {} })
  const R = code => js(code)
  const state = () => api['sync.state']()
  const waitSynced = async(after, timeout = 30000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
      const s = state()
      if (!s.syncing && s.lastSync > after && !s.pending) return s
      await sleep(300)
    }
    log('state at timeout', JSON.stringify({ ...state(), devices: undefined }))
    fail('sync timeout')
  }
  const listSongs = name => R(`const l = window.__veya.lists.lists.find(l => l.name == ${JSON.stringify(name)}); return l ? l.songs.map(s => s.id) : null`)
  const directProxy = async() => {
    await R(`window.__veya.settings.proxy = { ...window.__veya.settings.proxy, mode: 'direct' }; return 1`)
    await sleep(800)
  }

  if (phase == 'A1') {
    await directProxy()
    const listId = await R(`
      const L = window.__veya.lists
      const mk = ${mk.toString()}
      const l = L.createList('同步测试', [mk(1), mk(2), mk(3)])
      L.addSongs('love', [mk(7), mk(8)], true)
      window.__veya.settings.quality = 'flac'
      return l.id`)
    log('list', listId)
    api['stats.record'](mk(1), 'play')
    api['stats.record'](mk(1), 'done')
    api['rec.dislike'](mk(9))
    userApi.importScript('/*\n * @name 同步测试音源\n * @version 1.0.0\n */\n' + 'globalThis.lx && lx.send(lx.EVENT_NAMES.inited, { sources: {} }) // ' + 'x'.repeat(60), 'sync-test.js')
    await sleep(1500)
    const t = Date.now()
    const st = await api['sync.pair'](code, '电脑A')
    check(st.paired && st.enabled, 'A paired')
    const s = await waitSynced(t)
    check(!s.error, 'A first sync without error: ' + s.error)
  }

  if (phase == 'B1') {
    await directProxy()
    const t = Date.now()
    await api['sync.pair'](code, '电脑B')
    await waitSynced(t)
    await sleep(1500)
    check(JSON.stringify(await listSongs('同步测试')) == JSON.stringify(['kw_1', 'kw_2', 'kw_3']), 'B got list in order: ' + JSON.stringify(await listSongs('同步测试')))
    const love = await listSongs('我喜欢')
    check(JSON.stringify(love) == JSON.stringify(['kw_7', 'kw_8']), 'B got love list: ' + JSON.stringify(love))
    check(await R(`return window.__veya.settings.quality`) == 'flac', 'B got synced setting quality=flac')
    check(await R(`return window.__veya.settings.proxy.mode`) == 'direct', 'B kept its own proxy setting')
    check(api['stats.recent']().some(s => s.id == 'kw_1'), 'B sees A listening history in recent')
    check(!!store.load('dislikes', {}).songs?.kw_9, 'B got dislike')
    check(userApi.getList().some(m => m.name == '同步测试音源'), 'B got source script')
    // B 自己也听一首：两台都有听歌统计（以前两台会互相把对方的统计当成「删掉了」，来回互删停不下来）
    api['stats.record'](mk(2), 'play')
    // B 修改：删一首、顶部加一首、改名、「我喜欢」加一首
    const t2 = Date.now()
    await R(`
      const L = window.__veya.lists
      const mk = ${mk.toString()}
      const l = L.lists.find(l => l.name == '同步测试')
      L.removeSongs(l.id, ['kw_2'])
      L.addSongs(l.id, [mk(4)], true)
      l.name = '同步测试改'
      L.addSongs('love', [mk(5)], true)
      return 1`)
    await sleep(2500)
    await waitSynced(t2)
    check(state().pending == 0, 'B pushed changes')
  }

  if (phase == 'A2') {
    const t = Date.now()
    await sleep(1000)
    await api['sync.now']()
    await waitSynced(t)
    await sleep(800)
    const songs = await listSongs('同步测试改')
    check(JSON.stringify(songs) == JSON.stringify(['kw_4', 'kw_1', 'kw_3']), 'A got B edits (rename, delete, add on top): ' + JSON.stringify(songs))
    check(JSON.stringify(await listSongs('我喜欢')) == JSON.stringify(['kw_5', 'kw_7', 'kw_8']), 'A got B love')
    check(api['stats.recent']().some(s => s.id == 'kw_2'), 'A sees B listening history')
    check(api['stats.recent']().some(s => s.id == 'kw_1'), 'A kept own listening history')
    // A 删掉整个歌单
    const t2 = Date.now()
    await R(`const L = window.__veya.lists; const l = L.lists.find(l => l.name == '同步测试改'); L.removeList(l.id); return 1`)
    await sleep(2500)
    await waitSynced(t2)
  }

  if (phase == 'A3' || phase == 'B2') {
    const me = phase == 'A3' ? '电脑A' : '电脑B'
    const other = phase == 'A3' ? '电脑B' : '电脑A'
    await R(`window.__got = []; window.veya.on('sync:cmd', m => window.__got.push(m)); window.veya.on('sync:np', (d, s) => window.__got.push({ type: 'np', device: d, state: s })); return 1`)
    const t0 = Date.now()
    let peer = null
    while (Date.now() - t0 < 30000 && !peer) {
      peer = state().devices.find(d => d.name == other && d.online)
      if (!peer) await sleep(300)
    }
    check(!!peer, `${me} sees ${other} online`)
    if (phase == 'B2') {
      const t = Date.now()
      await api['sync.now']()
      await waitSynced(t)
      check((await listSongs('同步测试改')) == null, 'B: list deleted on A is gone')
    }
    await sleep(1500)
    api['sync.np']({ song: mk(phase == 'A3' ? 1 : 2), time: 42.5, playing: true, from: me })
    api['sync.cmd'](peer.id, 'hello', { from: me })
    const ok = await waitFor(`window.__got.some(m => m.type == 'cmd' && m.cmd == 'hello') && window.__got.some(m => m.type == 'np' && m.state.time == 42.5)`, 20000)
    check(ok, `${me} received np + cmd from ${other}`)
    const clock = api['sync.clock']()
    check(Math.abs(clock.now - Date.now()) < 2000, 'server clock offset sane: ' + JSON.stringify(clock))
    // 两台都在线、都没有新改动时不应该一直在同步
    await sleep(3000)
    const seen = new Set()
    const t1 = Date.now()
    while (Date.now() - t1 < 8000) {
      const s = state()
      seen.add(s.lastSync)
      await sleep(200)
    }
    check(seen.size <= 1, `${me}: idle while both online, no sync loop (rounds seen: ${seen.size})`)
    const recent = api['stats.recent']().map(s => s.id)
    check(recent.includes('kw_1') && recent.includes('kw_2'), `${me}: both devices' listening history kept: ${JSON.stringify(recent)}`)
    await sleep(3000) // 让对方也收完
  }

  if (phase == 'HEAL') {
    // 模拟 0.1.11 的旧设备：把电脑A 自己的听歌统计记录写成「删除」。A 应该保留本地数据，并把记录推回服务器
    const p = JSON.parse(Buffer.from(code.slice(6).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    const https = require('https')
    const raw = (method, path, device, body) => new Promise((resolve, reject) => {
      const u = new URL(p.u + path)
      const req = https.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, rejectUnauthorized: false,
        headers: { Authorization: `Bearer ${p.k}`, 'X-Veya-Device': device, 'Content-Type': 'application/json' } }, res => {
        let s = ''
        res.on('data', d => { s += d })
        res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(s) }) } catch { resolve({ status: res.statusCode, json: null }) } })
      })
      req.on('error', reject)
      if (body) req.write(JSON.stringify(body))
      req.end()
    })
    const me = state().deviceId
    const key = `T/${encodeURIComponent(me)}/kw_1`
    const st = await raw('GET', '/api/state', 'android-oldphone')
    const t0 = Date.now()
    const r = await raw('POST', '/api/push', 'android-oldphone', { store: st.json.store, records: [{ k: key, v: null, t: Date.now() + 500 }] })
    check(r.status == 200, 'forged tombstone accepted by server: ' + r.status)
    let back = null
    while (Date.now() - t0 < 20000) {
      await sleep(500)
      const all = await raw('GET', '/api/pull?since=0', 'checker')
      const rec = (all.json?.records ?? []).find(x => x.k == key)
      if (rec && rec.v && rec.d == me) { back = rec; break }
    }
    check(!!back, 'A pushed its own stat back after a foreign delete')
    check(api['stats.recent']().some(s => s.id == 'kw_1'), 'A kept kw_1 locally')
    const n0 = state().lastSync
    await sleep(4000)
    check(state().lastSync == n0 || !state().syncing, 'A settled after restore')
  }

  if (phase == 'UI' || phase == 'UI0') {
    win().setSize(1180, 860)
    await clickText('.nav-item', '设置')
    await sleep(800)
    await js(`const h = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('同步')); h.scrollIntoView(); return 1`)
    await sleep(600)
    if (phase == 'UI') {
      await clickText('button', '显示二维码')
      await sleep(600)
      await js(`const h = [...document.querySelectorAll('h2')].find(h => h.textContent.includes('同步')); h.scrollIntoView(); return 1`)
      await sleep(300)
    }
    await shot(phase == 'UI' ? 'sync-paired' : 'sync-unpaired')
    await js(`document.querySelector('.view .page, .view > div')?.scrollBy?.(0, 520); [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 50 && getComputedStyle(e).overflowY == 'auto').forEach(e => e.scrollBy(0, 520)); return 1`)
    await sleep(400)
    await shot(phase == 'UI' ? 'sync-paired-2' : 'sync-unpaired-2')
  }
}