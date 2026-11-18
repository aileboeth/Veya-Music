# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | **日本語** | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music は Windows と Android 向けのマルチプラットフォーム音楽プレーヤーで、おすすめはすべて自分の再生履歴から作られます。酷我（Kuwo）、酷狗（Kugou）、QQ 音楽、網易雲音楽（NetEase Cloud Music）、咪咕（Migu）をまとめて検索・閲覧でき、曲は LX Music 互換のカスタム音源スクリプトで再生します。小さな自前サーバー Veya Sync を用意すれば、PC とスマホを同期し、再生中の曲をもう一方の端末に引き継げます。

> 現在、アプリの画面は中国語のみです。

## 機能

- **5 つのプラットフォームを一度に検索**：Kuwo、Kugou、QQ 音楽、NetEase Cloud Music、Migu の曲、プレイリスト、プレイリスト広場、ランキング。歌詞は翻訳付き。
- **音源スクリプト**：LX Music のカスタム音源スクリプト（`.js`）を読み込み、複数を同時に有効にできます。ワンクリックの速度テストで順位を付け、再生時は速くて安定したものを優先。すべて失敗したときは別のプラットフォームの同じ曲を試します。
- **違う曲の防止**：スクリプトが返した音声の長さが曲と合わない場合（別の曲や 30 秒の試聴）、自動的に次のスクリプトへ切り替えます。
- **ログイン不要のおすすめ**（すべて端末内の再生履歴から）：
  - 毎日のおすすめ：1 日 30 曲、それぞれに理由付き。「興味なし」にした曲は出なくなり、似た曲やそのアーティストも順位が下がります。
  - 類似曲ラジオ：どの曲からでも始めて、ずっと再生し続けます。
  - 自動続き再生：順番再生でリストの最後まで来ると、似た曲が続きます。
  - 発見ページ：あなたへのおすすめ曲、おすすめプレイリスト、ランキング、人気プレイリスト。
- **再生中の曲を見つける**：リストで現在の曲を強調表示し、「再生中」ボタンでその位置に戻れます。プレーヤーバーにはどのリストから再生したかを表示。
- **マイプレイリスト**：オンラインのプレイリストを保存して後から更新できます。自分の再生回数、最近再生、曲名、アーティスト、長さで並べ替えたり、再生した曲／未再生の曲だけを表示したりできます。プレイリスト広場とプレイリスト検索は再生数・お気に入り数で並べ替え・絞り込みが可能。
- **プレイリストの取り込み**：NetEase Cloud Music、QQ 音楽、Kugou、Kuwo、Migu、汽水音楽（Soda Music）の共有リンクを貼るだけ。その他のアプリは「曲名 - アーティスト」形式のテキストを貼ると 1 曲ずつ照合します。LX Music の「マイリスト」もワンクリックで移行できます。
- **デスクトップ歌詞**（1 文字ずつの色付け、文字の透明度と背景帯を調整可能）、**ダウンロード**（`.lrc` 付き、オフライン再生可）、**スリープタイマー**、ライト／ダークテーマ、タスクトレイ、メディアキー。
- **プロキシ**：システムのプロキシに従う／すべて直接接続／固定のプロキシポート。
- **端末間の同期と連携**（自分の [Veya Sync](#veya-sync自前の同期サーバー) サーバーが必要）：プレイリスト、再生履歴とおすすめ、音源スクリプト、一部の設定を同期。再生の**引き継ぎ**、別の端末への**曲の送信**、2 台で**一緒に聴く**。

## Android 版

PC 版と同じ画面と機能に加えて：バックグラウンド再生、ロック画面・通知・ヘッドセットでの操作（通知には「いいね」と「歌詞」ボタン付き）、他のアプリの上に表示する**フローティング歌詞**、ロック画面と車の Bluetooth に現在の歌詞行を表示、スマホの `Music/Veya Music` フォルダーへのダウンロード、QR コードで同期サーバーとペアリング、アプリ内アップデート。

## ダウンロード

[Releases](https://github.com/aileboeth/Veya-Music/releases/latest) から最新版を入手してください：

| プラットフォーム | ファイル | 動作環境 |
|---|---|---|
| Windows | `Veya-Music-Setup-<バージョン>.exe` | Windows 10 / 11（64 ビット） |
| Android | `Veya-Music-<バージョン>.apk` | Android 10 以降 |

Windows のインストーラーは自己署名証明書で署名されているため、初回インストール時に Windows SmartScreen の警告が出ることがあります。**詳細情報 → 実行** を選んでください。どちらの版も自動で更新を確認し、更新後には変更内容を表示します。

## はじめに

Veya Music には音声も音源スクリプトも含まれていません。曲を再生するには：

1. LX Music のカスタム音源スクリプト（`.js`）を 1 つ以上用意します。[`sources/`](sources/) フォルダーには公開されている場所から集めて動作確認したサードパーティ製スクリプトがあります。結果は [sources/README.md](sources/README.md)（中国語）を参照してください。
2. アプリで **設定 → 音源の管理** を開き、スクリプトファイルを読み込みます（PC 版はフォルダーごと読み込めます）。
3. **速度テスト** をクリックします。以降は最も速い動作中の音源が優先され、失敗した音源はワンクリックで無効にできます。

## Veya Sync（自前の同期サーバー）

同期、再生の引き継ぎ、曲の送信、一緒に聴く機能はすべて Veya Sync を通ります。自分の Linux サーバー（x86_64 または ARM）で動く小さなプログラム 1 つだけ（約 7 MB、メモリ約 10 MB）で、データは自分のサーバーにだけ保存されます。

**インストール**（root で実行）：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

サーバーから GitHub に接続できない場合（中国本土など）はミラーを使います：

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

完了すると QR コードと `veya1.` で始まるペアリングコードが表示されます。PC では **設定 → 同期とマルチデバイス** にコードを貼り付け、スマホでは **マイ → マルチデバイス同期** で QR コードを読み取ります。クラウドサーバーの場合は、事業者のセキュリティグループで **TCP 7650** も許可してください。

**その他のコマンド**：`veya-sync info` でペアリングコードを再表示、`veya-sync update` で更新（データとペアリングコードはそのまま）、`veya-sync reset-key` でキーを変更。

**完全にアンインストール**（プログラム、サービス、自動起動、`veya-sync` コマンド、インストール時に追加したファイアウォール規則、システムユーザー `veya-sync`、すべてのデータ）：

```bash
veya-sync uninstall --purge --yes
```

`--purge` を付けない場合はプログラムだけが削除され、データは再インストール用に `/opt/veya-sync` に残ります。`veya-sync` コマンドがもう無い場合：

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

独自ドメインで Nginx / 1Panel の後ろに置く方法、root 以外でのインストール、その他のオプションは [docs/SYNC.md](docs/SYNC.md)（中国語）にあります。

## ソースからのビルド

PC 版（Node.js と npm）：

```powershell
npm install
node node_modules\electron\install.js   # npm 12 はインストールスクリプトを実行しないため、Electron を手動でダウンロード
npm run dev        # 開発モード
npm run build      # out/ にビルド
npm run dist       # dist/ にインストーラーを作成
```

Android 版（JDK 17 以上と Android SDK。SDK のパスは `android/local.properties` に記述）：

```powershell
npm run build:android                      # 画面を android/app/src/main/assets/www にまとめる
cd android; .\gradlew.bat :app:assembleDebug
```

同期サーバー（Go）：`cd server; go test ./...`、Linux 用バイナリは `server/build.ps1` でビルドします。

自動チェックは別のデータフォルダー `.e2e/` を使うため、普段のデータには影響しません：

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # ローカルで Veya Sync を起動し、2 つのデータフォルダーを同期
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**リリース手順**：`package.json` の `version`（PC 版・Android 版・サーバー共通）を上げ、`src/renderer/src/changelog.json` の先頭にこの版の変更点を追加します。`powershell -File tools\release.ps1` を実行するとすべてが `dist\release-<バージョン>\` に出力されます。GitHub で `v<バージョン>` タグのリリースを作成し、説明に `release-notes.md` を貼り付けて、残りのファイルをアップロードします。

## ディレクトリ構成

- `src/main`：Electron のメインプロセス（音源スクリプトの実行、オンラインデータ、音源の選択と速度テスト、プロキシ、自動更新、おすすめエンジン、ダウンロード、LX Music からの移行、プレイリストの取り込み）
- `src/main/lx`：lx-music-desktop の musicSdk（Apache-2.0、`NOTICE` を参照）
- `src/main/sync`：同期エンジン。`src/renderer/src/remote.ts`：引き継ぎ、曲の送信、一緒に聴く
- `src/preload`：プリロードスクリプト（`userApi.js` は音源スクリプト用の制限付き実行環境）
- `src/renderer`：画面（Vue 3）、PC 版と Android 版で共通。`MobileApp.vue` はスマホ用の外枠
- `src/android`：Android 版の「メインプロセス」。WebView 内で `src/main` を再利用（`shims/` が Node / Electron の API を置き換え、音源スクリプトは Web Worker で実行）
- `android/`：Android のネイティブ部分（Kotlin）：WebView ホスト、ExoPlayer によるバックグラウンド再生、フローティング歌詞、ダウンロード、ネットワーク
- `server/`：Veya Sync サーバー（Go）とワンライナーのインストールスクリプト
- `sources/`：公開されている場所から集めたサードパーティ製音源スクリプト

## ライセンスと謝辞

Veya Music は [Apache License 2.0](LICENSE) で公開されています。作者：aile（[@aileboeth](https://github.com/aileboeth)）。

検索、プレイリスト、ランキング、歌詞のインターフェースとカスタム音源スクリプトの実行環境は [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)（Apache-2.0）に由来します。[NOTICE](NOTICE) を参照してください。原作者と、音源スクリプトの作者の皆さんに感謝します。

## 免責事項

1. Veya Music は個人が開発したオープンソースソフトウェアで、学習と技術交流のためだけのものです。商用目的には使用しないでください。
2. 本ソフトウェアは音声ファイルを一切提供・保存・アップロードしません。検索結果、プレイリスト、ランキング、歌詞などのデータは各音楽プラットフォームの公開されたウェブインターフェースから取得しており、再生・ダウンロード用のリンクはすべて利用者自身が読み込んだサードパーティ製音源スクリプトが取得します。これらのインターフェースと音源はすべてインターネット由来で作者とは無関係であり、作者はその可用性・正確性・合法性を保証しません。
3. 楽曲の著作権は各プラットフォームおよび権利者に帰属します。本ソフトウェアで取得した音楽は 24 時間以内に削除してください。気に入った曲は正規のプラットフォームで聴くか購入し、アーティストを応援してください。
4. 本ソフトウェアの使用によって生じたすべての結果（著作権をめぐる紛争、アカウントやデータの損失などを含みますがこれらに限りません）は利用者が負うものとし、作者は一切の責任を負いません。
5. お住まいの地域の法令でこの種のソフトウェアが認められていない場合は、直ちに使用を中止しアンインストールしてください。本ソフトウェアが権利を侵害していると考える権利者は、[Issues](https://github.com/aileboeth/Veya-Music/issues) から作者に連絡してください。速やかに対応します。

本ソフトウェアを使用することで、上記のすべてを読み同意したものとみなされます。PC 版・Android 版とも初回起動時にこの声明を表示し、その後は **設定 → このアプリについて** で再度確認できます。

[`sources/`](sources/) のスクリプトは公開されている場所から集めたサードパーティ製です。著作権は各作者に帰属し、学習と交流のためだけに提供しています。スクリプトの作者は Issues から削除を依頼できます。
