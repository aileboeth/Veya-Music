// 检验「每日推荐能不能放」：对每日推荐的前 N 首走正式的取链接流程，再让渲染进程的 <audio> 真的加载一下
// 用法：先把真实数据目录复制到 .e2e\userdata，再 powershell -File tools\run-e2e.ps1 -Steps tools\e2e\play-daily.cjs
module.exports = async({ api, store, js, log }) => {
  const songs = store.load('daily', { songs: [] }).songs.slice(0, Number(process.env.VEYA_DIAG_N || 10))
  const quality = store.load('settings', {}).quality ?? '128k'
  let ok = 0
  for (const song of songs) {
    const t0 = Date.now()
    try {
      const info = await api['music.url'](song, quality, { allowSwitch: true })
      const ms = Date.now() - t0
      const r = await js(`return await new Promise(res => {
        const a = new Audio(); a.muted = true
        const done = v => { a.removeAttribute('src'); a.load(); res(v) }
        a.addEventListener('loadedmetadata', () => done('可播放 时长 ' + Math.round(a.duration) + 's'))
        a.addEventListener('error', () => done('加载失败 code ' + (a.error && a.error.code)))
        setTimeout(() => done('超时'), 12000)
        a.src = ${JSON.stringify(info.url)}
      })`)
      if (r.startsWith('可播放')) ok++
      log(`${song.source} ${song.name} (${song.interval}) => ${info.scriptName}${info.switched ? ' [换源 ' + info.song.source + ']' : ''} ${ms}ms => ${r}`)
    } catch (err) {
      log(`${song.source} ${song.name} => 取链接失败 ${err.message} ${JSON.stringify(err.details || []).slice(0, 300)}`)
    }
  }
  log(`RESULT ${ok}/${songs.length}`)
}
