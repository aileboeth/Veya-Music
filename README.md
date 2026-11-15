# Veya Music

带智能推荐的多平台音乐播放器（Windows 桌面版）。兼容 LX Music 的自定义音源脚本。

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
- **桌面歌词**、**歌曲下载**（含 .lrc）、浅色 / 深色主题、托盘、媒体键

## 开发

```powershell
npm install
node node_modules\electron\install.js   # npm 12 默认不执行安装脚本，需要手动下载 Electron
npm run dev        # 开发模式
npm run build      # 构建到 out/
npm run dist       # 打包安装程序到 dist/
node tools\make-icons.cjs   # 重新生成图标
```

自动化巡检（使用独立的数据目录 `.e2e/`，不影响正式数据）：

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
```

## 发布新版本

1. 改 `package.json` 的 `version`，在 `src/renderer/src/changelog.json` 最前面加上这一版的更新内容（客户端升级后会显示）
2. `npm run dist`（没有对应版本的更新日志会报错）
3. 在 GitHub 新建 Release，标签 `v版本号`，把 `dist\release-notes.md` 的内容粘贴到描述里（客户端在「重启更新」前显示），上传 `dist\` 里的 `Veya-Music-Setup-版本号.exe`、`.exe.blockmap`、`latest.yml`

## 目录

- `src/main` 主进程：`userApi.ts` 音源脚本运行、`music.ts` 在线数据、播放链接、选源与测速、`net.ts` 代理、`updater.ts` 自动更新、`recommend.ts` 推荐引擎、`download.ts`、`lxImport.ts`
- `src/main/listImport.ts` 其他音乐 App 的歌单导入（识别分享链接、汽水音乐、文本歌单匹配）
- `sources/` 从网上收集的可用音源脚本（第三方，说明见 [sources/README.md](sources/README.md)）
- `src/main/lx` 来自 lx-music-desktop 的 musicSdk（Apache-2.0，见 `NOTICE`）
- `src/preload` 预加载脚本（`userApi.js` 是音源脚本的受控运行环境）
- `src/renderer` 界面（Vue 3）

## 说明

本软件不提供任何音频内容，播放链接完全来自用户自行导入的音源脚本。

[`sources/`](sources/) 里附带了一些实测可用的音源脚本，它们都是从网上公开渠道收集来的第三方脚本，版权归各自的作者所有，仅供学习交流，详见 [sources/README.md](sources/README.md)。
