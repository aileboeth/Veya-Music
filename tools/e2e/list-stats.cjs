// 歌单的播放量 / 收藏量字段：各平台歌单广场和搜索歌单各取一页，看 play_num / collect_num 有没有
module.exports = async({ api, log }) => {
  const sources = ['kw', 'kg', 'tx', 'wy', 'mg']
  for (const s of sources) {
    for (const [what, call] of [['广场', () => api['songlist.lists'](s, null, null, 1)], ['搜索', () => api['songlist.search'](s, '周杰伦', 1)]]) {
      try {
        const r = await call()
        const list = r.list ?? []
        const play = list.filter(l => l.play_num > 0).length
        const collect = list.filter(l => l.collect_num > 0).length
        const sample = list.slice(0, 2).map(l => `${l.name?.slice(0, 10)} 播放=${l.play_count}/${l.play_num ?? '-'} 收藏=${l.collect_num ?? '-'}`).join(' | ')
        log(`${s} ${what}: ${list.length} 个, 有播放数 ${play}, 有收藏数 ${collect}  ${sample}`)
      } catch (err) {
        log(`${s} ${what}: 出错 ${err.message}`)
      }
    }
  }
}
