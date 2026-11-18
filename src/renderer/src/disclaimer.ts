// 免责声明：第一次启动时弹出一次（电脑版和手机版共用），设置 → 关于里随时可以再看
import { settings } from './settings'
import { alertDialog } from './ui'

export const DISCLAIMER_TITLE = '免责声明'

export const DISCLAIMER_TEXT = [
  '1. Veya Music 是个人开发的开源软件，仅供学习和技术交流使用，请勿用于任何商业用途。',
  '2. 本软件不提供、不存储、不上传任何音频文件。歌曲搜索、歌单、榜单、歌词等数据来自各音乐平台公开的网络接口；播放和下载链接全部由你自行导入的第三方音源脚本获取。这些接口和音源均来自网络，与本软件作者无关，作者不保证它们的可用性、准确性与合法性。',
  '3. 音乐作品的版权归各平台及其权利人所有。通过本软件获取的音乐资源请在 24 小时内删除；喜欢的歌曲请到正版平台收听或购买，支持正版。',
  '4. 使用本软件产生的一切后果（包括但不限于版权纠纷、账号或数据损失）由使用者自行承担，作者不承担任何责任。',
  '5. 如果你所在地区的法律法规不允许使用此类软件，请立即停止使用并卸载。权利人如认为本软件侵犯了自身权益，请在 GitHub 上联系作者，作者会及时处理。',
  '继续使用本软件，即表示你已阅读并同意以上全部内容。',
].join('\n\n')

/** 设置页「免责声明」按钮 */
export const showDisclaimer = () => alertDialog(DISCLAIMER_TITLE, DISCLAIMER_TEXT, { okText: '我知道了' })

/** 启动时：还没同意过就弹出来；点按钮同意才记下，点外面关掉的话下次启动还会再显示 */
export const ensureDisclaimer = async() => {
  if (settings.disclaimerAccepted) return
  const ok = await alertDialog(DISCLAIMER_TITLE, DISCLAIMER_TEXT, { okText: '我已阅读并同意' })
  if (ok) settings.disclaimerAccepted = true
}
