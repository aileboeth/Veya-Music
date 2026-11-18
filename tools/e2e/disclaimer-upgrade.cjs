// 升级用户（lastVersion 旧、没同意过）：先显示免责声明，同意后再显示「已更新到 …」
// 先跑一次 disclaimer.cjs，再把 .e2e\userdata\VeyaData\settings.json 里的 lastVersion 改成旧版本、disclaimerAccepted 改成 false
// （应用运行时改不了：退出前它会再保存一次设置），然后不加 -Fresh 运行本脚本（需要 VEYA_E2E_DISCLAIMER=1）
module.exports = async({ js, shot, sleep, log, clickText }) => {
  const title = () => js(`return document.querySelector('.modal h3')?.textContent ?? ''`)
  log('1st modal', await title())
  await shot('u1-disclaimer')
  await clickText('.modal .btn.primary', '我已阅读并同意')
  await sleep(700)
  log('2nd modal', await title())
  await shot('u2-whats-new')
  await clickText('.modal .btn.primary', '确定')
  await sleep(300)
  const s = (await js(`return (await window.veya.invoke('data.load', 'settings', {})).data`))
  log('saved', s.disclaimerAccepted, s.lastVersion)
}
