// 导入预览 + 歌单删歌巡检：读取歌单 → 预览里去掉几首 → 保存 → 单首删除 / 批量删除 → 同步更新不把删掉的加回来
module.exports = async({ api, js, shot, sleep, log, win, waitFor }) => {
  win().setSize(1280, 900)
  const sample = (await api['songlist.lists']('wy', null, null, 1)).list[0]
  const share = `分享歌单: ${sample.name} https://music.163.com/playlist?id=${String(sample.id).replace(/^id_/, '')}&userid=1 (来自@网易云音乐)`
  const count = () => js(`return document.querySelectorAll('.song-list .song-row').length + '|' + (document.querySelector('.song-list .count')?.textContent ?? '')`)
  const saved = () => js(`return (await window.veya?.invoke?.('data.load', 'lists', []))`).catch(() => null)
  const listState = async() => {
    const all = await api['data.load']('lists', [])
    const l = all.find(x => x.sourceListId)
    return l ? `songs ${l.songs.length}, removed ${(l.removed ?? []).length}` : 'no list'
  }

  // 1. 读取 → 预览
  await js(`document.querySelector('.lists-head .icon-btn').click()`)
  await sleep(400)
  await js(`const t = document.querySelector('textarea.area'); t.value = ${JSON.stringify(share)}; t.dispatchEvent(new Event('input'))`)
  await sleep(200)
  await js(`[...document.querySelectorAll('.modal .btn.primary')].find(b => b.textContent.trim() == '读取歌单').click()`)
  log('preview shown', await waitFor(`document.querySelector('.modal.wide')`, 60000))
  await sleep(500)
  log('preview', await js(`return document.querySelector('.modal.wide .count').textContent + ' | name=' + document.querySelector('.name-input').value + ' | rows=' + document.querySelectorAll('.modal.wide .item').length`))
  // 去掉第 2、3 首
  await js(`const items = document.querySelectorAll('.modal.wide .item'); items[1].click(); items[2].click()`)
  await sleep(300)
  const dropped = await js(`return [...document.querySelectorAll('.modal.wide .item.off .n')].map(e => e.textContent)`)
  log('unchecked', dropped, '|', await js(`return document.querySelector('.modal.wide .count').textContent + ' | ' + document.querySelector('.modal.wide .btn.primary').textContent`))
  await shot('70-import-preview')
  // 查找
  await js(`const f = document.querySelector('.modal.wide .find'); f.value = ${JSON.stringify('zzzz不存在')}; f.dispatchEvent(new Event('input'))`)
  await sleep(200)
  log('filter none', await js(`return document.querySelector('.modal.wide .none')?.textContent`))
  await js(`const f = document.querySelector('.modal.wide .find'); f.value = ''; f.dispatchEvent(new Event('input'))`)
  await sleep(200)
  // 2. 保存
  await js(`document.querySelector('.modal.wide .btn.primary').click()`)
  await sleep(1500)
  log('after save', await count(), '| toast', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`), '|', await listState())
  log('dropped still in list?', await js(`const names = [...document.querySelectorAll('.song-list .name')].map(e => e.textContent); return ${JSON.stringify(dropped)}.filter(n => names.slice(0, 5).includes(n))`))

  // 3. 单首删除（行上的垃圾桶按钮）
  const firstName = await js(`return document.querySelector('.song-list .song-row .name').textContent`)
  await js(`document.querySelector('.song-list .song-row .actions .del').click()`)
  await sleep(500)
  log('delete one', firstName, '=>', await js(`return document.querySelector('.song-list .song-row .name').textContent != ${JSON.stringify(firstName)}`), await count(), '|', await listState())

  // 4. 批量管理
  await js(`[...document.querySelectorAll('.song-list .toolbar .btn')].find(b => b.textContent.includes('批量管理')).click()`)
  await sleep(300)
  await js(`const rows = document.querySelectorAll('.song-list .song-row'); rows[0].click(); rows[1].click(); rows[3].click()`)
  await sleep(300)
  await shot('71-list-manage')
  log('manage', await js(`return [...document.querySelectorAll('.song-list .toolbar .btn')].map(b => b.textContent.trim())`))
  await js(`[...document.querySelectorAll('.song-list .toolbar .btn')].find(b => b.textContent.includes('删除所选')).click()`)
  await sleep(400)
  await js(`[...document.querySelectorAll('.modal .btn')].find(b => b.textContent.trim() == '删除').click()`)
  await sleep(600)
  log('after batch delete', await count(), '|', await listState())

  // 5. 同步更新：没有真正新增的歌 → 不弹预览，删掉的也不回来
  await js(`[...document.querySelectorAll('.hero-btns .btn')].find(b => b.textContent.includes('同步更新')).click()`)
  await waitFor(`document.querySelector('.toast')`, 15000)
  log('after sync', await count(), '| toast', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`), '| preview?', await js(`return !!document.querySelector('.modal.wide')`), '|', await listState())
  await shot('72-list-after-sync')

  // 5b.「…」→ 找回删掉的歌：进同步预览，默认都不勾，勾两首再保存
  await js(`[...document.querySelectorAll('.hero-btns .btn')].find(b => b.title == '更多').click()`)
  await sleep(400)
  await js(`const els = [...document.querySelectorAll('button, .item, li, div')].filter(e => e.textContent.trim().startsWith('找回删掉的歌')); els[els.length - 1].click()`)
  log('sync preview shown', await waitFor(`document.querySelector('.modal.wide')`, 30000))
  await sleep(500)
  log('sync preview', await js(`return document.querySelector('.modal.wide h3').textContent + ' | ' + document.querySelector('.modal.wide .sum').textContent.replace(/\\s+/g, ' ').trim().slice(0, 70) + ' | ' + document.querySelector('.modal.wide .count').textContent + ' | back btn ' + [...document.querySelectorAll('.modal.wide .btn')].some(b => b.textContent.trim() == '返回')`))
  await js(`const items = document.querySelectorAll('.modal.wide .item'); items[0].click(); items[1].click()`)
  await sleep(300)
  await shot('74-sync-preview')
  await js(`document.querySelector('.modal.wide .btn.primary').click()`)
  await sleep(1200)
  log('after restore 2', await count(), '| toast', await js(`return [...document.querySelectorAll('.toast')].map(t => t.textContent)`), '|', await listState())

  // 6. 再导入一次同一个歌单：没有新增（删掉的默认不勾 → 进预览且全未勾）
  await js(`document.querySelector('.lists-head .icon-btn').click()`)
  await sleep(400)
  await js(`const t = document.querySelector('textarea.area'); t.value = ${JSON.stringify(share)}; t.dispatchEvent(new Event('input'))`)
  await sleep(200)
  await js(`[...document.querySelectorAll('.modal .btn.primary')].find(b => b.textContent.trim() == '读取歌单').click()`)
  await waitFor(`document.querySelector('.modal.wide')`, 60000)
  await sleep(400)
  log('re-import preview', await js(`return document.querySelector('.modal.wide .sum')?.textContent.replace(/\\s+/g, ' ').trim().slice(0, 60) + ' | ' + document.querySelector('.modal.wide .count').textContent + ' | disabled=' + document.querySelector('.modal.wide .btn.primary').disabled`))
  await shot('73-reimport-preview')
}
