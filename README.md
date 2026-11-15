# Veya Music

带智能推荐的多平台音乐播放器（Windows 桌面版）。兼容 LX Music 的自定义音源脚本。

## 功能

- **多平台**：酷我 / 酷狗 / QQ / 网易 / 咪咕 聚合搜索、歌单广场、排行榜、歌词（含翻译）
- **音源**：导入 LX 自定义音源脚本（.js），可同时启用多个，按顺序自动兜底；全部失败时自动换到其他平台的同一首歌
- **定位正在播放**：列表里高亮当前歌曲；歌曲不在视野内时出现「正在播放」定位按钮；播放栏显示「来自哪个列表」，点一下回到原列表并定位；侧边栏用圆点标出正在播放的歌单
- **推荐**（全部基于本机听歌记录，不需要登录）
  - 每日推荐：每天 30 首，带推荐理由，可标记「不喜欢」
  - 相似歌曲电台：从任意一首歌出发无限播放
  - 播完自动续播：顺序播放到列表末尾后自动接上相似歌曲
  - 发现页：猜你喜欢、为你推荐的歌单、排行榜、热门歌单
- **我的歌单**：收藏在线歌单并可同步更新；从 LX Music 一键迁移「我的列表」
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

## 目录

- `src/main` 主进程：`userApi.ts` 音源脚本运行、`music.ts` 在线数据与播放链接、`recommend.ts` 推荐引擎、`download.ts`、`lxImport.ts`
- `src/main/lx` 来自 lx-music-desktop 的 musicSdk（Apache-2.0，见 `NOTICE`）
- `src/preload` 预加载脚本（`userApi.js` 是音源脚本的受控运行环境）
- `src/renderer` 界面（Vue 3）

## 说明

本软件不提供任何音频内容，播放链接完全来自用户自行导入的音源脚本。
