# Veya Music

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | **한국어** | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Русский](README.ru.md) | [Português (Brasil)](README.pt-BR.md)

Veya Music은 Windows와 Android용 멀티 플랫폼 음악 플레이어로, 추천은 모두 내 청취 기록으로 만들어집니다. Kuwo(酷我), Kugou(酷狗), QQ Music, NetEase Cloud Music(网易云音乐), Migu(咪咕)를 한곳에서 검색하고 둘러볼 수 있으며, 곡은 LX Music과 호환되는 사용자 지정 음원 스크립트로 재생합니다. 작은 자체 호스팅 서버 Veya Sync를 두면 컴퓨터와 휴대폰을 동기화하고, 재생 중인 곡을 다른 기기로 이어서 재생할 수 있습니다.

> 현재 앱 화면은 중국어로만 제공됩니다.

## 기능

- **다섯 플랫폼 통합 검색**: Kuwo, Kugou, QQ Music, NetEase Cloud Music, Migu의 곡, 플레이리스트, 플레이리스트 광장, 차트. 가사는 번역 포함.
- **음원 스크립트**: LX Music 사용자 지정 음원 스크립트(`.js`)를 가져와 여러 개를 동시에 켤 수 있습니다. 한 번의 클릭으로 속도를 측정해 순위를 매기고, 재생할 때는 빠르고 안정적인 것을 우선 사용합니다. 모두 실패하면 다른 플랫폼의 같은 곡을 시도합니다.
- **엉뚱한 곡 방지**: 스크립트가 돌려준 오디오 길이가 곡과 맞지 않으면(다른 곡이나 30초 미리 듣기) 자동으로 다음 스크립트를 시도합니다.
- **로그인 없는 추천**(모두 기기 안의 청취 기록 기반):
  - 오늘의 추천: 하루 30곡, 곡마다 추천 이유 표시. "관심 없음"으로 표시한 곡은 다시 나오지 않고, 비슷한 곡과 그 아티스트도 순위가 낮아집니다.
  - 비슷한 곡 라디오: 아무 곡에서나 시작해 계속 재생합니다.
  - 자동 이어 재생: 순서대로 재생 모드에서 목록이 끝나면 비슷한 곡이 이어집니다.
  - 발견 페이지: 좋아할 만한 곡, 추천 플레이리스트, 차트, 인기 플레이리스트.
- **지금 재생 중인 곡 찾기**: 목록에서 현재 곡을 강조하고, "재생 중" 버튼으로 바로 돌아갈 수 있으며, 플레이어 바에 어느 목록에서 재생했는지 표시합니다.
- **내 플레이리스트**: 온라인 플레이리스트를 저장하고 나중에 새로 고칠 수 있습니다. 내 재생 횟수, 최근 재생, 제목, 아티스트, 길이로 정렬하거나 들은 곡/안 들은 곡만 볼 수 있습니다. 플레이리스트 광장과 플레이리스트 검색은 재생 수와 즐겨찾기 수로 정렬·필터링할 수 있습니다.
- **플레이리스트 가져오기**: NetEase Cloud Music, QQ Music, Kugou, Kuwo, Migu, Soda Music(汽水音乐)의 공유 링크를 붙여 넣기만 하면 됩니다. 다른 앱은 "제목 - 아티스트" 형식의 텍스트를 붙여 넣으면 한 곡씩 매칭합니다. LX Music의 "내 목록"도 한 번에 옮길 수 있습니다.
- **데스크톱 가사**(글자 단위 강조, 글자 투명도와 배경 띠 조절), **다운로드**(`.lrc` 포함, 오프라인 재생 가능), **취침 타이머**, 라이트/다크 테마, 트레이 아이콘, 미디어 키.
- **프록시**: 시스템 프록시 따르기 / 모두 직접 연결 / 고정 프록시 포트.
- **기기 간 동기화와 연동**(내 [Veya Sync](#veya-sync-자체-호스팅-동기화-서버) 서버 필요): 플레이리스트, 청취 기록과 추천, 음원 스크립트, 일부 설정을 동기화. 다른 기기에서 **이어 재생**, 다른 기기로 **곡 보내기**, 두 기기에서 **함께 듣기**.

## Android 앱

데스크톱 버전과 같은 화면과 기능에 더해: 백그라운드 재생, 잠금 화면·알림·이어폰 버튼 조작(알림에 "좋아요"와 "가사" 버튼), 다른 앱 위에 떠 있는 **플로팅 가사**, 잠금 화면과 차량 블루투스에 현재 가사 줄 표시, 휴대폰의 `Music/Veya Music` 폴더로 다운로드, QR 코드로 동기화 서버 페어링, 앱 내 업데이트.

## 다운로드

[Releases](https://github.com/aileboeth/Veya-Music/releases/latest)에서 최신 버전을 받으세요:

| 플랫폼 | 파일 | 요구 사항 |
|---|---|---|
| Windows | `Veya-Music-Setup-<버전>.exe` | Windows 10 / 11, 64비트 |
| Android | `Veya-Music-<버전>.apk` | Android 10 이상 |

Windows 설치 프로그램은 자체 서명 인증서로 서명되어 있어 처음 설치할 때 Windows SmartScreen 경고가 나올 수 있습니다. **추가 정보 → 실행**을 선택하세요. 두 버전 모두 스스로 업데이트를 확인하고, 업데이트 후 바뀐 내용을 보여 줍니다.

## 시작하기

Veya Music에는 오디오도 음원 스크립트도 들어 있지 않습니다. 곡을 재생하려면:

1. LX Music 사용자 지정 음원 스크립트(`.js`)를 하나 이상 준비합니다. [`sources/`](sources/) 폴더에 공개된 곳에서 모아 테스트한 서드파티 스크립트가 있으며, 결과는 [sources/README.md](sources/README.md)(중국어)에 있습니다.
2. 앱에서 **설정 → 음원 관리**를 열고 스크립트 파일을 가져옵니다(데스크톱 버전은 폴더 전체를 가져올 수 있습니다).
3. **속도 측정**을 클릭합니다. 이후 재생은 가장 빠르게 작동하는 음원을 우선 사용하고, 실패한 음원은 한 번에 끌 수 있습니다.

## Veya Sync (자체 호스팅 동기화 서버)

동기화, 이어 재생, 곡 보내기, 함께 듣기는 모두 Veya Sync를 거칩니다. 내 Linux 서버(x86_64 또는 ARM)에서 실행되는 작은 프로그램 하나(약 7 MB, 메모리 약 10 MB)이며, 데이터는 내 서버에만 저장됩니다.

**설치**(root로 실행):

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

서버에서 GitHub에 접속할 수 없다면(예: 중국 본토) 미러를 사용하세요:

```bash
curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash
```

설치가 끝나면 QR 코드와 `veya1.`로 시작하는 페어링 코드가 표시됩니다. 컴퓨터에서는 **설정 → 동기화 및 멀티 기기**에 코드를 붙여 넣고, 휴대폰에서는 **내 정보 → 멀티 기기 동기화**에서 QR 코드를 스캔합니다. 클라우드 서버라면 업체의 보안 그룹에서 **TCP 7650**도 허용하세요.

**기타 명령**: `veya-sync info`는 페어링 코드를 다시 표시하고, `veya-sync update`는 업데이트하며(데이터와 페어링 코드 유지), `veya-sync reset-key`는 키를 교체합니다.

**완전히 제거**(프로그램, 서비스, 자동 시작, `veya-sync` 명령, 설치 시 추가한 방화벽 규칙, `veya-sync` 시스템 사용자, 모든 데이터):

```bash
veya-sync uninstall --purge --yes
```

`--purge`가 없으면 프로그램만 제거되고, 데이터는 다시 설치할 때를 위해 `/opt/veya-sync`에 남습니다. `veya-sync` 명령이 이미 없다면:

```bash
curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash -s -- uninstall --purge --yes
```

내 도메인으로 Nginx / 1Panel 뒤에서 실행하는 방법, root가 아닌 설치 등 다른 옵션은 [docs/SYNC.md](docs/SYNC.md)(중국어)에 있습니다.

## 소스에서 빌드

데스크톱(Node.js와 npm):

```powershell
npm install
node node_modules\electron\install.js   # npm 12는 설치 스크립트를 건너뛰므로 Electron을 직접 내려받기
npm run dev        # 개발 모드
npm run build      # out/에 빌드
npm run dist       # dist/에 설치 프로그램 생성
```

Android(JDK 17 이상과 Android SDK, SDK 경로는 `android/local.properties`에 지정):

```powershell
npm run build:android                      # 화면을 android/app/src/main/assets/www에 묶기
cd android; .\gradlew.bat :app:assembleDebug
```

동기화 서버(Go): `cd server; go test ./...`, Linux 바이너리는 `server/build.ps1`로 빌드합니다.

자동 점검은 별도의 데이터 폴더 `.e2e/`를 사용하므로 실제 데이터에 영향을 주지 않습니다:

```powershell
npm run build
powershell -File tools\run-e2e.ps1 -Steps tools\e2e\features.cjs -Fresh
powershell -File tools\e2e\sync-run.ps1   # 로컬에서 Veya Sync를 띄우고 두 데이터 폴더를 동기화
node tools\test-sync-util.mjs; node tools\test-android-shims.mjs
```

**릴리스**: `package.json`의 `version`(데스크톱, Android, 서버 공용)을 올리고 `src/renderer/src/changelog.json` 맨 앞에 이번 버전의 변경 사항을 추가합니다. `powershell -File tools\release.ps1`을 실행하면 모든 파일이 `dist\release-<버전>\`에 만들어집니다. GitHub에서 `v<버전>` 태그로 릴리스를 만들고, 설명에 `release-notes.md`를 붙여 넣은 뒤 나머지 파일을 올립니다.

## 프로젝트 구조

- `src/main`: Electron 메인 프로세스(음원 스크립트 실행, 온라인 데이터, 음원 선택과 속도 측정, 프록시, 자동 업데이트, 추천 엔진, 다운로드, LX Music 가져오기, 플레이리스트 가져오기)
- `src/main/lx`: lx-music-desktop의 musicSdk(Apache-2.0, `NOTICE` 참고)
- `src/main/sync`: 동기화 엔진. `src/renderer/src/remote.ts`: 이어 재생, 곡 보내기, 함께 듣기
- `src/preload`: 프리로드 스크립트(`userApi.js`는 음원 스크립트용 제한된 실행 환경)
- `src/renderer`: 화면(Vue 3), 데스크톱과 Android 공용. `MobileApp.vue`는 휴대폰용 껍데기
- `src/android`: Android의 "메인 프로세스". WebView 안에서 `src/main`을 재사용(`shims/`가 Node / Electron API를 대신하고, 음원 스크립트는 Web Worker에서 실행)
- `android/`: Android 네이티브 부분(Kotlin): WebView 호스트, ExoPlayer 백그라운드 재생, 플로팅 가사, 다운로드, 네트워크
- `server/`: Veya Sync 서버(Go)와 한 줄 설치 스크립트
- `sources/`: 공개된 곳에서 모은 서드파티 음원 스크립트

## 라이선스와 감사의 말

Veya Music은 [Apache License 2.0](LICENSE)으로 공개됩니다. 작성자: aile([@aileboeth](https://github.com/aileboeth)).

검색, 플레이리스트, 차트, 가사 인터페이스와 사용자 지정 음원 스크립트 실행 환경은 [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)(Apache-2.0)에서 왔습니다. [NOTICE](NOTICE)를 참고하세요. 원작자와 음원 스크립트 작성자들께 감사드립니다.

## 면책 조항

1. Veya Music은 개인이 개발한 오픈 소스 소프트웨어로, 학습과 기술 교류 목적으로만 제공됩니다. 어떠한 상업적 목적으로도 사용하지 마세요.
2. 이 소프트웨어는 어떠한 오디오 파일도 제공·저장·업로드하지 않습니다. 검색 결과, 플레이리스트, 차트, 가사 등의 데이터는 각 음악 플랫폼의 공개 웹 인터페이스에서 가져오며, 재생과 다운로드 링크는 전적으로 사용자가 직접 가져온 서드파티 음원 스크립트가 얻습니다. 이러한 인터페이스와 음원은 모두 인터넷에서 온 것으로 작성자와 무관하며, 작성자는 그 가용성·정확성·합법성을 보장하지 않습니다.
3. 음악 저작물의 저작권은 각 플랫폼과 권리자에게 있습니다. 이 소프트웨어로 얻은 음악은 24시간 이내에 삭제하세요. 마음에 드는 곡은 정식 플랫폼에서 듣거나 구매해 아티스트를 응원해 주세요.
4. 이 소프트웨어 사용으로 생기는 모든 결과(저작권 분쟁, 계정이나 데이터 손실 등을 포함하되 이에 한정되지 않음)는 사용자가 책임지며, 작성자는 어떠한 책임도 지지 않습니다.
5. 거주 지역의 법령이 이런 종류의 소프트웨어를 허용하지 않는다면 즉시 사용을 중지하고 제거하세요. 이 소프트웨어가 자신의 권리를 침해한다고 생각하는 권리자는 [Issues](https://github.com/aileboeth/Veya-Music/issues)로 작성자에게 연락해 주시면 신속히 처리하겠습니다.

이 소프트웨어를 사용하면 위의 모든 내용을 읽고 동의한 것으로 간주합니다. 데스크톱과 Android 버전 모두 처음 실행할 때 이 안내를 표시하며, 이후에는 **설정 → 정보**에서 다시 볼 수 있습니다.

[`sources/`](sources/)의 스크립트는 공개된 곳에서 모은 서드파티 스크립트입니다. 저작권은 각 작성자에게 있으며 학습과 교류 목적으로만 제공됩니다. 스크립트 작성자는 Issues를 통해 삭제를 요청할 수 있습니다.
