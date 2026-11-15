// 升级后首次启动的「更新内容」弹窗 + 网络设置截图（运行前把测试数据里的 lastVersion 改成旧版本）
module.exports = async({ js, shot, sleep, log, clickText }) => {
  await sleep(800)
  log('modal title', await js(`return document.querySelector('.modal h3')?.textContent ?? ''`))
  await shot('30-whats-new')
  await clickText('.modal .btn', '确定')
  await clickText('.nav-item', '设置')
  await sleep(600)
  await clickText('.tabs button', '固定端口')
  await sleep(400)
  await js(`[...document.querySelectorAll('h2')].find(h => h.textContent == '网络').scrollIntoView()`)
  await sleep(500)
  await shot('31-network')
  await clickText('.tabs button', '跟随系统')
  await sleep(300)
  log('lastVersion', await js(`return (await window.veya.invoke('data.load', 'settings', {})).data.lastVersion`))
}
