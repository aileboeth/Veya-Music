// 免责声明：第一次启动弹出 → 同意后记下 → 设置页可以再看；升级用户先看声明再看更新内容
// 用法：$env:VEYA_E2E_DISCLAIMER='1'; powershell -File tools\run-e2e.ps1 -Steps tools\e2e\disclaimer.cjs -Fresh
// 第二次不加 -Fresh 再跑：应该不再弹出（log 里 first modal 为空）
module.exports = async({ js, shot, sleep, log, clickText, waitFor }) => {
  const title = () => js(`return document.querySelector('.modal h3')?.textContent ?? ''`)
  const saved = () => js(`return (await window.veya.invoke('data.load', 'settings', {})).data`)
  log('first modal', await title())
  log('ok button', await js(`return document.querySelector('.modal .btn.primary')?.textContent ?? ''`))
  log('has cancel', await js(`return !!document.querySelector('.modal .btn:not(.primary)')`))
  await shot('d1-first-launch')
  if (await title() == '免责声明') {
    await clickText('.modal .btn.primary', '我已阅读并同意')
    await sleep(600)
    log('after accept modal', await title())
    log('accepted saved', (await saved()).disclaimerAccepted)
  }

  // 设置页：按钮和底部的链接
  await clickText('.nav-item', '设置')
  await sleep(600)
  await js(`[...document.querySelectorAll('h2')].find(h => h.textContent == '关于与更新').scrollIntoView()`)
  await sleep(400)
  await shot('d2-about')
  await clickText('.btn.small', '免责声明')
  await sleep(500)
  log('settings button modal', await title(), '/', await js(`return document.querySelector('.modal .btn.primary')?.textContent ?? ''`))
  await shot('d3-from-settings')
  await clickText('.modal .btn.primary', '我知道了')
  await sleep(400)
  await clickText('.about a', '查看完整的免责声明')
  await sleep(400)
  log('about link modal', await title())
  await clickText('.modal .btn.primary', '我知道了')
  await sleep(300)
}
