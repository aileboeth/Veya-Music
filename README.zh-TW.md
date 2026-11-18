# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | **繁體中文** | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music 是一款多平台音樂播放器，有 Windows 電腦版和 Android 手機版，推薦完全根據你自己的聽歌紀錄產生。它把酷我、酷狗、QQ 音樂、網易雲音樂、咪咕放在一起搜尋和瀏覽，透過相容 LX Music 的自訂音源腳本播放。再裝一個很小的自架伺服器 Veya Sync，電腦和手機就能互相同步，還能把正在播放的歌接力到另一台裝置上。

> 目前軟體介面只有簡體中文。

## 功能

- **五個平台一起搜**：酷我、酷狗、QQ 音樂、網易雲音樂、咪咕的歌曲、歌單、歌單廣場和排行榜，歌詞附翻譯。
- **音源腳本**：匯入 LX Music 自訂音源腳本（`.js`），可以同時啟用多個。一鍵測速替它們排序，播放時優先使用又快又穩的；全部失敗時自動換到其他平台的同一首歌。
- **播錯歌保護**：音源傳回的音訊長度和歌曲對不上（給錯歌、30 秒試聽片段）時，自動換下一個音源。
- **不用登入的推薦**，全部根據本機的聽歌紀錄：
  - 每日推薦：每天 30 首，附推薦理由；按「不喜歡」之後不再推薦，相似的歌和該歌手也會降低權重。
  - 相似歌曲電台：從任何一首歌出發，一直播下去。
  - 播完自動續播：循序播放到清單結尾後，自動接上風格相近的歌。
  - 發現頁：猜你喜歡、為你推薦的歌單、排行榜、熱門歌單。
- **定位正在播放**：清單裡標示目前的歌曲，「正在播放」按鈕一按就捲回去；播放列顯示這首歌來自哪個清單。
- **我的歌單**：收藏線上歌單，之後可以同步更新；可依我聽的次數、最近聽過、歌名、歌手、長度排序，也可以只看聽過 / 沒聽過的歌。歌單廣場和搜尋歌單可依播放量、收藏量排序和篩選。
- **匯入歌單**：貼上網易雲音樂、QQ 音樂、酷狗、酷我、咪咕、汽水音樂的歌單分享連結即可；其他 App 可以貼上「歌名 - 歌手」文字，逐首比對。從 LX Music 一鍵遷移「我的列表」。
- **桌面歌詞**（逐字填色，文字透明度和底板可調）、**歌曲下載**（含 `.lrc`，下載過的歌沒網路也能播）、**定時關閉**、淺色 / 深色主題、系統匣、媒體鍵。
- **網路**：跟隨系統代理 / 全部直連 / 固定代理連接埠。
- **多裝置同步和連動**（需要自己的 [Veya Sync](#veya-sync自架同步伺服器) 伺服器）：同步歌單、聽歌紀錄和推薦、音源腳本、部分設定；**接力播放**、把歌**推送**到另一台裝置、兩台**一起聽**。

## Android 手機版

和電腦版同一套介面和功能，另外還有：背景播放；鎖定畫面、通知列、耳機按鍵控制（通知卡片上有「喜歡」和「詞」按鈕）；浮在其他 App 上面的**懸浮歌詞**；鎖定畫面和車用藍牙顯示目前這句歌詞；下載到手機的「Music/Veya Music」資料夾；掃描 QR 碼連線同步伺服器；App 內更新。

## 下載

到 [Releases](https://github.com/aileboeth/Veya-Music/releases/latest) 下載最新版：

| 平台 | 檔案 | 需求 |
|---|---|---|
| Windows | `Veya-Music-Setup-版本號.exe` | Windows 10 / 11，64 位元 |
| Android | `Veya-Music-版本號.apk` | Android 10 以上 |

電腦版安裝程式使用自簽憑證，第一次安裝時 Windows SmartScreen 可能會攔下：按「其他資訊 → 仍要執行」即可。兩個版本都會自動檢查更新，更新後會顯示這次改了什麼。

## 開始使用

Veya Music 本身不含任何音訊，也不含音源腳本。要播歌：

1. 準備一個或幾個 LX Music 自訂音源腳本（`.js`）。[`sources/`](sources/) 資料夾裡有從公開管道收集、實測過的第三方腳本，測試結果見 [sources/README.md](sources/README.md)（簡體中文）。
2. 在軟體裡打開「設定 → 音源管理」匯入腳本檔案（電腦版可以直接匯入整個資料夾）。
3. 按「測速」。之後播放會優先使用最快的可用音源，全部失敗的音源可以一鍵停用。

## Veya Sync（自架同步伺服器）

同步、接力播放、推送歌曲、一起聽都要靠 Veya Sync。它只是一個小程式（約 7 MB，執行時佔用約 10 MB 記憶體），裝在你自己的 Linux 伺服器上（x86_64 / ARM 都可以），資料只存在你自己的伺服器上。

**安裝**（以 root 執行）：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

伺服器連不上 GitHub 時（例如在中國大陸）使用加速位址：

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

裝好後會顯示 QR 碼和以 `veya1.` 開頭的配對碼。電腦在「設定 → 同步與多裝置」貼上配對碼，手機在「我的 → 多裝置同步」掃描 QR 碼。雲端伺服器記得在控制台的安全群組放行 **TCP 7650**。

**其他指令**：`veya-sync info` 再次顯示配對碼，`veya-sync update` 更新（資料和配對碼不變），`veya-sync reset-key` 更換金鑰。

**完整解除安裝**（程式、服務、開機自動啟動、`veya-sync` 指令、安裝時加入的防火牆規則、系統使用者 `veya-sync` 和所有資料）：

```bash
veya-sync uninstall --purge --yes
```

不加 `--purge` 只移除程式，資料保留在 `/opt/veya-sync`，重新安裝後可以繼續使用。如果 `veya-sync` 指令已經不在了：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

放在 Nginx / 1Panel 反向代理後面使用自己的網域、沒有 root 權限時安裝等更多用法，見 [docs/SYNC.md](docs/SYNC.md)（簡體中文）。

## 從原始碼建置

電腦版（需要 Node.js 和 npm）：

```powershell
npm install
node node_modules\electron\install.js   # npm 12 預設不執行安裝腳本，需要手動下載 Electron
npm run dev        # 開發模式
npm run build      # 建置到 out/
npm run dist       # 打包安裝程式到 dist/
```

手機版（需要 JDK 17+ 和 Android SDK，SDK 路徑寫在 `android/local.properties`）：

```powershell
npm run build:android                      # 把介面打包進 android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

同步伺服器（Go）：`cd server; go test ./...`，`server/build.ps1` 編譯 Linux 版程式。

自動化檢查使用獨立的資料目錄 `.e2e/`，不影響正式資料：

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # 在本機啟動一個 Veya Sync，讓兩個資料目錄互相同步
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**發布新版本**：修改 `package.json` 的 `version`（電腦版、手機版、同步伺服器共用），在 `src/renderer/src/changelog.json` 最前面加上這一版的更新內容；執行 `powershell -File tools\release.ps1`，所有檔案都會放進 `dist\release-版本號\`；在 GitHub 建立 Release，標籤 `v版本號`，說明貼上 `release-notes.md`，上傳其餘檔案。

## 目錄

- `src/main`：Electron 主程序（音源腳本執行、線上資料、選源與測速、代理、自動更新、推薦引擎、下載、LX Music 遷移、歌單匯入）
- `src/main/lx`：來自 lx-music-desktop 的 musicSdk（Apache-2.0，見 `NOTICE`）
- `src/main/sync`：同步引擎；`src/renderer/src/remote.ts`：接力、推送歌曲、一起聽
- `src/preload`：預載腳本（`userApi.js` 是音源腳本的受控執行環境）
- `src/renderer`：介面（Vue 3），電腦版和手機版共用；`MobileApp.vue` 是手機版的外殼
- `src/android`：手機版的「主程序」，在 WebView 裡重用 `src/main`（`shims/` 取代 Node / Electron 介面，音源腳本在 Web Worker 中執行）
- `android/`：Android 原生部分（Kotlin）：WebView 宿主、ExoPlayer 背景播放、懸浮歌詞、下載、網路
- `server/`：Veya Sync 同步伺服器（Go）和一鍵安裝腳本
- `sources/`：從公開管道收集的第三方音源腳本

## 授權與致謝

Veya Music 以 [Apache License 2.0](LICENSE) 開源。作者：aile（[@aileboeth](https://github.com/aileboeth)）。

各平台的搜尋、歌單、排行榜、歌詞介面和自訂音源腳本的執行環境來自 [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)（Apache-2.0），見 [NOTICE](NOTICE)。感謝原作者，也感謝各位音源腳本的作者。

## 免責聲明

1. Veya Music 是個人開發的開源軟體，僅供學習和技術交流使用，請勿用於任何商業用途。
2. 本軟體不提供、不儲存、不上傳任何音訊檔案。歌曲搜尋、歌單、排行榜、歌詞等資料來自各音樂平台公開的網路介面；播放和下載連結全部由使用者自行匯入的第三方音源腳本取得。這些介面和音源均來自網路，與本軟體作者無關，作者不保證它們的可用性、準確性與合法性。
3. 音樂作品的版權歸各平台及其權利人所有。透過本軟體取得的音樂資源請在 24 小時內刪除；喜歡的歌曲請到正版平台收聽或購買，支持正版。
4. 使用本軟體產生的一切後果（包括但不限於版權糾紛、帳號或資料損失）由使用者自行承擔，作者不承擔任何責任。
5. 如果你所在地區的法律法規不允許使用此類軟體，請立即停止使用並解除安裝。權利人如認為本軟體侵犯了自身權益，請透過 [Issues](https://github.com/aileboeth/Veya-Music/issues) 聯絡作者，作者會儘速處理。

使用本軟體，即表示你已閱讀並同意以上全部內容。電腦版和手機版第一次開啟時都會顯示這份聲明，之後可以在「設定 → 關於」再次查看。

[`sources/`](sources/) 裡的腳本都是從公開管道收集來的第三方腳本，版權歸各自的作者所有，僅供學習交流；腳本作者可以透過 Issues 要求移除。
