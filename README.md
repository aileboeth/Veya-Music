# Veya Music

带智能推荐的多平台音乐播放器，有 Windows 电脑版和安卓手机版。兼容 LX Music 的自定义音源脚本。

## 功能

- **多平台**：酷我 / 酷狗 / QQ / 网易 / 咪咕 聚合搜索、歌单广场、排行榜、歌词（含翻译）
- **音源**：导入 LX 自定义音源脚本（.js），可同时启用多个；一键测速，播放时自动优先用又快又稳的音源；全部失败时自动换到其他平台的同一首歌
- **播错歌保护**：音源返回的音频时长与歌曲信息对不上（给错歌、试听片段）时自动换下一个音源
- **网络**：跟随系统代理 / 全部直连 / 固定代理端口
- **定位正在播放**：列表里高亮当前歌曲；歌曲不在视野内时出现「正在播放」定位按钮；播放栏显示「来自哪个列表」，点一下回到原列表并定位；侧边栏用圆点标出正在播放的歌单
- **推荐**（全部基于本机听歌记录，不需要登录）
  - 每日推荐：每天 30 首，带推荐理由；点「不喜欢」后不再推荐，相似的歌和该歌手也会降权
  - 相似歌曲电台：从任意一首歌出发无限播放
  - 播完自动续播：顺序播放到列表末尾后自动接上相似歌曲
  - 发现页：猜你喜欢、为你推荐的歌单、排行榜、热门歌单
- **我的歌单**：收藏在线歌单并可同步更新；从 LX Music 一键迁移「我的列表」
- **导入歌单**：粘贴网易云音乐 / QQ 音乐 / 酷狗 / 酷我 / 咪咕 / 汽水音乐的歌单分享链接，自动识别平台并导入；其他 App 可以粘贴「歌名 - 歌手」文本，逐首匹配
- **桌面歌词**、**歌曲下载**（含 .lrc，下载过的歌没网也能放）、**定时关闭**、浅色 / 深色主题、托盘、媒体键
- **多设备同步和联动**（需要在自己的服务器上装 [Veya Sync](docs/SYNC.md)，一行命令）：同步歌单、听歌记录和推荐、音源脚本、部分设置；电脑 ⇄ 手机**接力播放**、**推歌**、**一起听**

## 安卓手机版

和电脑版同一套界面和功能，另外有：后台播放、锁屏 / 通知栏 / 耳机按键控制、**悬浮歌词**、锁屏和车载蓝牙显示歌词、下载到手机的「音乐/Veya Music」文件夹、扫码连接同步服务器、应用内更新。

需要 Android 10 及以上。在 [Releases](https://github.com/aileboeth/Veya-Music/releases) 下载 Veya-Music-版本号.apk 安装。

## 同步服务器 Veya Sync（自部署）

电脑和手机之间的同步、接力播放、推歌、一起听都要靠它。它装在你自己的服务器上（常见 Linux，x86_64 / ARM 都行）。详细说明看 [docs/SYNC.md](docs/SYNC.md)。

**安装**（用 root 运行）：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

国内服务器连不上 GitHub 时用这条：

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

装完会显示二维码和 `veya1.` 开头的配对码。电脑在「设置 → 同步与多设备」里粘贴配对码，手机在「我的 → 多设备同步」里扫码。云服务器记得在控制台的安全组里放行 **TCP 7650**。

**卸载**：

```bash
veya-sync uninstall --purge --yes
```

会删掉程序、服务、开机自启、`veya-sync` 命令、安装时加的防火墙放行规则、系统用户 `veya-sync`，以及所有数据（歌单、配对密钥、证书）。不加 `--purge` 的话只卸载程序，数据留在 `/opt/veya-sync`，重新安装后可以接着用。

如果 `veya-sync` 命令已经不在了，也可以这样彻底卸载：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

其他命令：`veya-sync info` 再次显示配对码，`veya-sync update` 更新（数据和配对码不变），`veya-sync reset-key` 更换密钥。

## 开发

```powershell
npm install
node node_modules\electron\install.js   # npm 12 默认不执行安装脚本，需要手动下载 Electron
npm run dev        # 开发模式
npm run build      # 构建到 out/
npm run dist       # 打包安装程序到 dist/
node tools\make-icons.cjs   # 重新生成图标
```

手机版（需要 JDK 17+ 和 Android SDK，SDK 路径写在 `android/local.properties`）：

```powershell
npm run build:android                      # 把界面打包进 android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

自动化巡检（使用独立的数据目录 `.e2e/`，不影响正式数据）：

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # 同步：本地起一个 Veya Sync，两个数据目录互相同步、接力
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
cd server; go test ./...
```

## 发布新版本

1. 改 `package.json` 的 `version`（电脑版、手机版、同步服务器共用这个版本号），在 `src/renderer/src/changelog.json` 最前面加上这一版的更新内容（客户端升级后会显示）
2. `powershell -File tools\release.ps1`：电脑版安装包、手机版 APK（签名文件在仓库外）、同步服务器全部打包到 `dist\release-版本号\`
3. 在 GitHub 新建 Release，标签 `v版本号`，把 `release-notes.md` 的内容粘贴到描述里，上传文件夹里其余所有文件（电脑版、手机版的自动更新和服务器的一键安装都从最新的 Release 下载）

## 目录

- `src/main` 主进程：`userApi.ts` 音源脚本运行、`music.ts` 在线数据、播放链接、选源与测速、`net.ts` 代理、`updater.ts` 自动更新、`recommend.ts` 推荐引擎、`download.ts`、`lxImport.ts`
- `src/main/listImport.ts` 其他音乐 App 的歌单导入（识别分享链接、汽水音乐、文本歌单匹配）
- `sources/` 从网上收集的可用音源脚本（第三方，说明见 [sources/README.md](sources/README.md)）
- `src/main/lx` 来自 lx-music-desktop 的 musicSdk（Apache-2.0，见 `NOTICE`）
- `src/preload` 预加载脚本（`userApi.js` 是音源脚本的受控运行环境）
- `src/renderer` 界面（Vue 3）；`MobileApp.vue` 是手机版的外壳，页面两端共用
- `src/main/sync` 同步引擎；`src/renderer/src/remote.ts` 设备联动（接力、推歌、一起听）
- `src/android` 手机版的「主进程」：在 WebView 里复用 `src/main` 的模块（`shims/` 替代 Node / Electron 接口），音源脚本跑在 Web Worker 里
- `android/` 安卓原生部分（Kotlin）：WebView 宿主、ExoPlayer 后台播放、悬浮歌词、下载、网络
- `server/` Veya Sync 同步服务器（Go）和一键安装脚本

## 免责声明

1. Veya Music 是个人开发的开源软件，仅供学习和技术交流使用，请勿用于任何商业用途。
2. 本软件不提供、不存储、不上传任何音频文件。歌曲搜索、歌单、榜单、歌词等数据来自各音乐平台公开的网络接口；播放和下载链接全部由用户自行导入的第三方音源脚本获取。这些接口和音源均来自网络，与本软件作者无关，作者不保证它们的可用性、准确性与合法性。
3. 音乐作品的版权归各平台及其权利人所有。通过本软件获取的音乐资源请在 24 小时内删除；喜欢的歌曲请到正版平台收听或购买，支持正版。
4. 使用本软件产生的一切后果（包括但不限于版权纠纷、账号或数据损失）由使用者自行承担，作者不承担任何责任。
5. 如果你所在地区的法律法规不允许使用此类软件，请立即停止使用并卸载。权利人如认为本软件侵犯了自身权益，请通过 [Issues](https://github.com/aileboeth/Veya-Music/issues) 联系作者，作者会及时处理。

使用本软件，即表示你已阅读并同意以上全部内容。电脑版和手机版第一次打开时都会显示这份声明，之后可以在「设置 → 关于与更新 → 免责声明」里再次查看。

[`sources/`](sources/) 里附带了一些实测可用的音源脚本，它们都是从网上公开渠道收集来的第三方脚本，版权归各自的作者所有，仅供学习交流，详见 [sources/README.md](sources/README.md)。
