# Veya Music

[English](README.md) | **简体中文** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music 是一个多平台音乐播放器，有 Windows 电脑版和安卓手机版，推荐完全根据你自己的听歌记录生成。它把酷我、酷狗、QQ 音乐、网易云音乐、咪咕放在一起搜索和浏览，通过兼容 LX Music 的自定义音源脚本播放。再装一个很小的自部署服务器 Veya Sync，电脑和手机就能互相同步，还能把正在放的歌接力到另一台设备上。

## 功能

- **五个平台一起搜**：酷我、酷狗、QQ 音乐、网易云音乐、咪咕的歌曲、歌单、歌单广场和排行榜，歌词带翻译。
- **音源脚本**：导入 LX Music 自定义音源脚本（`.js`），可以同时启用多个。一键测速给它们排序，播放时优先用又快又稳的；全部失败时自动换到其他平台的同一首歌。
- **播错歌保护**：音源返回的音频时长和歌曲对不上（给错歌、30 秒试听片段）时，自动换下一个音源。
- **不用登录的推荐**，全部基于本机的听歌记录：
  - 每日推荐：每天 30 首，带推荐理由；点「不喜欢」以后不再推荐，相似的歌和这个歌手也会降权。
  - 相似歌曲电台：从任意一首歌出发，一直放下去。
  - 播完自动续播：顺序播放到列表末尾后，自动接上风格相近的歌。
  - 发现页：猜你喜欢、为你推荐的歌单、排行榜、热门歌单。
- **定位正在播放**：列表里高亮当前歌曲，「正在播放」按钮一点就滚回去；播放栏显示这首歌来自哪个列表。
- **我的歌单**：收藏在线歌单，以后可以同步更新；可以按我听的次数、最近听过、歌名、歌手、时长排序，也可以只看听过 / 没听过的歌。歌单广场和搜索歌单可以按播放量、收藏量排序和筛选。
- **导入歌单**：粘贴网易云音乐、QQ 音乐、酷狗、酷我、咪咕、汽水音乐的歌单分享链接即可；其他 App 可以粘贴「歌名 - 歌手」文本，逐首匹配。从 LX Music 一键迁移「我的列表」。
- **桌面歌词**（逐字填色，文字透明度和底板可调）、**歌曲下载**（含 `.lrc`，下载过的歌没网也能放）、**定时关闭**、浅色 / 深色主题、托盘、媒体键。
- **网络**：跟随系统代理 / 全部直连 / 固定代理端口。
- **多设备同步和联动**（需要自己的 [Veya Sync](#veya-sync自部署同步服务器) 服务器）：同步歌单、听歌记录和推荐、音源脚本、部分设置；**接力播放**、**推歌**到另一台设备、两台**一起听**。

## 安卓手机版

和电脑版同一套界面和功能，另外有：后台播放；锁屏、通知栏、耳机按键控制（通知栏卡片上有「喜欢」和「词」按钮）；浮在其他应用上面的**悬浮歌词**；锁屏和车载蓝牙显示当前这句歌词；下载到手机的「音乐/Veya Music」文件夹；扫码连接同步服务器；应用内更新。

## 下载

在 [Releases](https://github.com/aileboeth/Veya-Music/releases/latest) 下载最新版：

| 平台 | 文件 | 要求 |
|---|---|---|
| Windows | `Veya-Music-Setup-版本号.exe` | Windows 10 / 11，64 位 |
| 安卓 | `Veya-Music-版本号.apk` | Android 10 及以上 |

电脑版安装程序用的是自签名证书，第一次安装时 Windows SmartScreen 可能会拦一下：点「更多信息 → 仍要运行」即可。两个版本都会自己检查更新，更新后会显示这次改了什么。

## 开始使用

Veya Music 本身不带任何音频，也不带音源脚本。要放歌：

1. 准备一个或几个 LX Music 自定义音源脚本（`.js`）。[`sources/`](sources/) 文件夹里有从公开渠道收集、实测过的第三方脚本，测试结果见 [sources/README.md](sources/README.md)。
2. 在软件里打开「设置 → 音源管理」导入脚本文件（电脑版可以直接导入整个文件夹）。
3. 点「测速」。之后播放会优先用最快的可用音源，全部失败的音源可以一键停用。

## Veya Sync（自部署同步服务器）

同步、接力播放、推歌、一起听都要靠 Veya Sync。它只是一个小程序（约 7 MB，运行时占 10 MB 左右内存），装在你自己的 Linux 服务器上（x86_64 / ARM 都行），数据只存在你自己的服务器上。

**安装**（用 root 运行）：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

国内服务器连不上 GitHub 时用加速地址：

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

装完会显示二维码和 `veya1.` 开头的配对码。电脑在「设置 → 同步与多设备」里粘贴配对码，手机在「我的 → 多设备同步」里扫码。云服务器记得在控制台的安全组里放行 **TCP 7650**。

**其他命令**：`veya-sync info` 再次显示配对码，`veya-sync update` 更新（数据和配对码不变），`veya-sync reset-key` 更换密钥。

**彻底卸载**（程序、服务、开机自启、`veya-sync` 命令、安装时加的防火墙规则、系统用户 `veya-sync` 和所有数据）：

```bash
veya-sync uninstall --purge --yes
```

不加 `--purge` 只卸载程序，数据留在 `/opt/veya-sync`，重新安装后可以接着用。`veya-sync` 命令已经不在了的话：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

放在 Nginx / 1Panel 反向代理后面用自己的域名、没有 root 权限时安装等更多用法，见 [docs/SYNC.md](docs/SYNC.md)。

## 从源码构建

电脑版（需要 Node.js 和 npm）：

```powershell
npm install
node node_modules\electron\install.js   # npm 12 默认不执行安装脚本，需要手动下载 Electron
npm run dev        # 开发模式
npm run build      # 构建到 out/
npm run dist       # 打包安装程序到 dist/
```

手机版（需要 JDK 17+ 和 Android SDK，SDK 路径写在 `android/local.properties`）：

```powershell
npm run build:android                      # 把界面打包进 android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

同步服务器（Go）：`cd server; go test ./...`，`server/build.ps1` 编译 Linux 版程序。

自动化巡检使用独立的数据目录 `.e2e/`，不影响正式数据：

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # 本地起一个 Veya Sync，两个数据目录互相同步
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**发布新版本**：改 `package.json` 的 `version`（电脑版、手机版、同步服务器共用），在 `src/renderer/src/changelog.json` 最前面加上这一版的更新内容；运行 `powershell -File tools\release.ps1`，所有文件都会放进 `dist\release-版本号\`；在 GitHub 新建 Release，标签 `v版本号`，描述粘贴 `release-notes.md`，上传其余文件。

## 目录

- `src/main`：Electron 主进程（音源脚本运行、在线数据、选源与测速、代理、自动更新、推荐引擎、下载、LX Music 迁移、歌单导入）
- `src/main/lx`：来自 lx-music-desktop 的 musicSdk（Apache-2.0，见 `NOTICE`）
- `src/main/sync`：同步引擎；`src/renderer/src/remote.ts`：接力、推歌、一起听
- `src/preload`：预加载脚本（`userApi.js` 是音源脚本的受控运行环境）
- `src/renderer`：界面（Vue 3），电脑版和手机版共用；`MobileApp.vue` 是手机版的外壳
- `src/android`：手机版的「主进程」，在 WebView 里复用 `src/main`（`shims/` 替代 Node / Electron 接口，音源脚本跑在 Web Worker 里）
- `android/`：安卓原生部分（Kotlin）：WebView 宿主、ExoPlayer 后台播放、悬浮歌词、下载、网络
- `server/`：Veya Sync 同步服务器（Go）和一键安装脚本
- `sources/`：从公开渠道收集的第三方音源脚本

## 开源协议和致谢

Veya Music 以 [Apache License 2.0](LICENSE) 开源。作者：aile（[@aileboeth](https://github.com/aileboeth)）。

各平台的搜索、歌单、榜单、歌词接口和自定义音源脚本的运行环境来自 [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)（Apache-2.0），见 [NOTICE](NOTICE)。感谢原作者，也感谢各位音源脚本的作者。

## 免责声明

1. Veya Music 是个人开发的开源软件，仅供学习和技术交流使用，请勿用于任何商业用途。
2. 本软件不提供、不存储、不上传任何音频文件。歌曲搜索、歌单、榜单、歌词等数据来自各音乐平台公开的网络接口；播放和下载链接全部由用户自行导入的第三方音源脚本获取。这些接口和音源均来自网络，与本软件作者无关，作者不保证它们的可用性、准确性与合法性。
3. 音乐作品的版权归各平台及其权利人所有。通过本软件获取的音乐资源请在 24 小时内删除；喜欢的歌曲请到正版平台收听或购买，支持正版。
4. 使用本软件产生的一切后果（包括但不限于版权纠纷、账号或数据损失）由使用者自行承担，作者不承担任何责任。
5. 如果你所在地区的法律法规不允许使用此类软件，请立即停止使用并卸载。权利人如认为本软件侵犯了自身权益，请通过 [Issues](https://github.com/aileboeth/Veya-Music/issues) 联系作者，作者会及时处理。

使用本软件，即表示你已阅读并同意以上全部内容。电脑版和手机版第一次打开时都会显示这份声明，之后可以在「设置 → 关于」里再次查看。

[`sources/`](sources/) 里的脚本都是从公开渠道收集来的第三方脚本，版权归各自的作者所有，仅供学习交流；脚本作者可以通过 Issues 要求移除。
