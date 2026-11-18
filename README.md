# Veya Music

**English** | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music is a multi-platform music player for Windows and Android with recommendations built from your own listening history. It searches and browses Kuwo, Kugou, QQ Music, NetEase Cloud Music and Migu in one place, and plays songs through LX Music–compatible custom source scripts. A small self-hosted server, Veya Sync, keeps your computer and phone in sync and lets you hand playback from one to the other.

> The app interface is currently available in Chinese only.

## Features

- **One search for five platforms**: songs, playlists, playlist plaza and charts from Kuwo, Kugou, QQ Music, NetEase Cloud Music and Migu, with lyrics and translations.
- **Source scripts**: import LX Music custom source scripts (`.js`) and enable several at once. A one-click speed test ranks them, playback prefers the fast and reliable ones, and when every script fails the same song is tried on another platform.
- **Wrong-song guard**: if a script returns audio whose length doesn't match the song (a different track or a 30-second preview), the next script is tried automatically.
- **Recommendations without an account**, all from your local history:
  - Daily picks: 30 songs a day, each with a reason; songs you mark "not interested" stop appearing, and similar songs and that artist are ranked lower.
  - Similar-song radio that starts from any song and keeps going.
  - Auto-continue: when a list ends in sequential mode, similar songs follow.
  - Discover page: songs you may like, recommended playlists, charts and popular playlists.
- **Find what's playing**: the current song is highlighted, a "now playing" button scrolls back to it, and the player bar shows which list it came from.
- **Your playlists**: collect online playlists and refresh them later; sort a playlist by your play count, recently played, title, artist or length, or show only songs you have or haven't played. Playlist plaza and playlist search can sort and filter by play count and favorites.
- **Import playlists** from a share link of NetEase Cloud Music, QQ Music, Kugou, Kuwo, Migu or Soda Music (Qishui); for other apps, paste "title - artist" lines and each song is matched. Migrate "My lists" from LX Music in one click.
- **Desktop lyrics** with word-by-word highlighting, adjustable text opacity and backing band; **downloads** (with `.lrc`, playable offline); **sleep timer**; light and dark themes; tray icon; media keys.
- **Proxy**: follow the system proxy, connect directly, or use a fixed proxy port.
- **Sync and handoff between devices** with your own [Veya Sync](#veya-sync-self-hosted-sync-server) server: playlists, history and recommendations, source scripts and some settings; continue the current song on another device, send a song to another device, or listen together in sync.

## Android app

The same interface and features as the desktop version, plus: background playback; lock screen, notification and headset controls (with like and lyrics buttons in the notification); **floating lyrics** over other apps; the current lyric line on the lock screen and car Bluetooth displays; downloads into the phone's `Music/Veya Music` folder; QR-code pairing with the sync server; in-app updates.

## Download

Get the latest version from [Releases](https://github.com/aileboeth/Veya-Music/releases/latest):

| Platform | File | Requirements |
|---|---|---|
| Windows | `Veya-Music-Setup-<version>.exe` | Windows 10 / 11, 64-bit |
| Android | `Veya-Music-<version>.apk` | Android 10 or later |

The Windows installer is signed with a self-signed certificate, so Windows SmartScreen may warn on first install: choose **More info → Run anyway**. Both versions check for updates by themselves and show what changed after updating.

## Getting started

Veya Music contains no audio and no source scripts. To play songs:

1. Get one or more LX Music custom source scripts (`.js`). The [`sources/`](sources/) folder holds third-party scripts collected from public channels and tested; see [sources/README.md](sources/README.md) (Chinese) for the results.
2. In the app open **Settings → Source management** and import the script files (the desktop version can import a whole folder).
3. Click **Speed test**. Playback then prefers the fastest working scripts, and failed scripts can be disabled in one click.

## Veya Sync (self-hosted sync server)

Sync, handoff, sending songs and listening together all go through Veya Sync, a single small program (about 7 MB, around 10 MB of memory) that runs on your own Linux server (x86_64 or ARM). Your data stays on your server.

**Install** (run as root):

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

If the server cannot reach GitHub (for example inside mainland China), use the mirror:

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

When it finishes it shows a QR code and a pairing code starting with `veya1.`. On the computer paste the code in **Settings → Sync & devices**; on the phone scan the QR code in **Me → Multi-device sync**. On a cloud server, also allow **TCP 7650** in the provider's security group.

**Other commands**: `veya-sync info` shows the pairing code again, `veya-sync update` updates (data and pairing code are kept), `veya-sync reset-key` replaces the key.

**Uninstall** everything (program, service, autostart, the `veya-sync` command, firewall rules it added, the `veya-sync` system user and all data):

```bash
veya-sync uninstall --purge --yes
```

Without `--purge` only the program is removed and the data stays in `/opt/veya-sync` for a later reinstall. If the `veya-sync` command is already gone:

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

Running behind Nginx / 1Panel with your own domain, non-root installs and other options are described in [docs/SYNC.md](docs/SYNC.md) (Chinese).

## Building from source

Desktop (Node.js and npm):

```powershell
npm install
node node_modules\electron\install.js   # npm 12 skips install scripts, so download Electron manually
npm run dev        # development mode
npm run build      # build into out/
npm run dist       # build the installer into dist/
```

Android (JDK 17+ and the Android SDK, with the SDK path in `android/local.properties`):

```powershell
npm run build:android                      # bundle the interface into android/app/src/main/assets/www
cd android; .\gradlew.bat :app:assembleDebug
```

Sync server (Go): `cd server; go test ./...`, and `server/build.ps1` builds the Linux binaries.

Automated checks use a separate data folder `.e2e/` and don't touch your real data:

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # starts a local Veya Sync and syncs two data folders
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**Releasing**: bump `version` in `package.json` (shared by desktop, Android and the server) and add an entry at the top of `src/renderer/src/changelog.json`; run `powershell -File tools\release.ps1`, which puts everything into `dist\release-<version>\`; create a GitHub release tagged `v<version>`, paste `release-notes.md` as the description and upload the other files.

## Project layout

- `src/main`: Electron main process (source script runtime, online data, source selection and speed test, proxy, updater, recommendation engine, downloads, LX Music import, playlist import)
- `src/main/lx`: the musicSdk from lx-music-desktop (Apache-2.0, see `NOTICE`)
- `src/main/sync`: sync engine; `src/renderer/src/remote.ts`: handoff, send song, listen together
- `src/preload`: preload scripts (`userApi.js` is the sandboxed runtime for source scripts)
- `src/renderer`: the interface (Vue 3), shared by desktop and Android; `MobileApp.vue` is the phone shell
- `src/android`: the Android "main process", reusing `src/main` inside a WebView (`shims/` replace Node / Electron APIs; source scripts run in a Web Worker)
- `android/`: native Android part (Kotlin): WebView host, ExoPlayer background playback, floating lyrics, downloads, networking
- `server/`: Veya Sync server (Go) and its one-line install script
- `sources/`: third-party source scripts collected from public channels

## License and credits

Veya Music is released under the [Apache License 2.0](LICENSE). Author: aile ([@aileboeth](https://github.com/aileboeth)).

The search, playlist, chart and lyric interfaces and the custom source script runtime come from [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) (Apache-2.0); see [NOTICE](NOTICE). Thanks to its author, and to the authors of the source scripts.

## Disclaimer

1. Veya Music is open-source software developed by an individual, for learning and technical exchange only. Do not use it for any commercial purpose.
2. This software does not provide, store or upload any audio files. Search results, playlists, charts, lyrics and similar data come from the public web interfaces of the music platforms; play and download links are obtained entirely by third-party source scripts that you import yourself. These interfaces and sources all come from the internet and have nothing to do with the author, who makes no guarantee about their availability, accuracy or legality.
3. Copyright in the music belongs to the platforms and the rights holders. Please delete music obtained through this software within 24 hours; listen to or buy the songs you like on licensed platforms and support the artists.
4. You bear all consequences of using this software (including but not limited to copyright disputes and loss of accounts or data); the author accepts no liability.
5. If the laws of your region do not allow software of this kind, stop using it and uninstall it. Rights holders who believe this software infringes their rights can contact the author through [Issues](https://github.com/aileboeth/Veya-Music/issues), and it will be handled promptly.

By using this software you confirm that you have read and agree to all of the above. Both the desktop and Android versions show this notice on first launch, and you can read it again under **Settings → About**.

The scripts in [`sources/`](sources/) are third-party scripts collected from public channels. Their copyright belongs to their authors, they are provided for learning and exchange only, and the author of a script can ask for its removal through Issues.
