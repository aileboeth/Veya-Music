# 打包一个版本的全部发布文件到 dist\release-<版本号>\（版本号来自 package.json）：
#   电脑版：Veya-Music-Setup-x.y.z.exe、.exe.blockmap、latest.yml、release-notes.md
#   手机版：Veya-Music-x.y.z.apk、veya-android.json（应用内更新读它）
#   同步服务器：veya-sync-linux-amd64 / arm64 / armv7、veya-sync-install.sh、veya-sync-SHA256SUMS.txt
# 用法：powershell -File tools\release.ps1 [-SkipDesktop] [-SkipAndroid] [-SkipSync]
param([switch]$SkipDesktop, [switch]$SkipAndroid, [switch]$SkipSync)
# 不能用 Stop：npm / gradle 往 stderr 写提示，PowerShell 5.1 会当成错误中断
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$ver = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$out = Join-Path $root "dist\release-$ver"
New-Item -ItemType Directory -Force $out | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
Push-Location $root
try {
  if (-not $SkipDesktop) {
    Write-Host "== 电脑版 $ver"
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
    npm run dist 2>&1 | Select-String 'error|signed|SIGNED|release notes' | ForEach-Object { $_.Line }
    foreach ($f in "Veya-Music-Setup-$ver.exe", "Veya-Music-Setup-$ver.exe.blockmap", 'latest.yml', 'release-notes.md') {
      if (-not (Test-Path "dist\$f")) { throw "缺少 dist\$f" }
      Copy-Item "dist\$f" $out -Force
    }
  }

  if (-not $SkipAndroid) {
    Write-Host "== 手机版 $ver"
    if (-not (Test-Path 'D:\Claude\music\keys\android-keystore.properties')) { throw '缺少安卓发布签名（D:\Claude\music\keys\android-keystore.properties）' }
    npm run build:android 2>&1 | Select-String 'rror|built in' | ForEach-Object { $_.Line }
    Push-Location android
    $env:JAVA_HOME = 'D:\JDK\jdk25'
    .\gradlew.bat :app:assembleRelease --no-daemon --console=plain -q 2>&1 | Select-String 'error|FAIL' | ForEach-Object { $_.Line }
    Pop-Location
    $apk = "Veya-Music-$ver.apk"
    Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' (Join-Path $out $apk) -Force
    $item = Get-Item (Join-Path $out $apk)
    $sha = (Get-FileHash $item.FullName -Algorithm SHA256).Hash.ToLower()
    $p = $ver.Split('.') | ForEach-Object { [int]$_ }
    $json = [ordered]@{ version = $ver; versionCode = $p[0] * 10000 + $p[1] * 100 + $p[2]; apk = $apk; sha256 = $sha; size = $item.Length; minSdk = 29 } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $out 'veya-android.json'), $json, $utf8)
  }

  if (-not $SkipSync) {
    Write-Host "== 同步服务器 $ver"
    $tmp = Join-Path $root 'dist\sync'
    powershell -NoProfile -File server\build.ps1 -Version $ver -Out $tmp | Out-Null
    foreach ($f in 'veya-sync-linux-amd64', 'veya-sync-linux-arm64', 'veya-sync-linux-armv7', 'veya-sync-install.sh', 'veya-sync-SHA256SUMS.txt') {
      Copy-Item (Join-Path $tmp $f) $out -Force
    }
  }
} finally { Pop-Location }

Write-Host ''
Write-Host "dist\release-$ver ："
Get-ChildItem $out | ForEach-Object { Write-Host ('  {0,-36} {1,12:N0}' -f $_.Name, $_.Length) }
Write-Host ''
Write-Host "GitHub Release：标签 v$ver（不要勾选 draft / pre-release），描述粘贴 release-notes.md，上传这个文件夹里除 release-notes.md 以外的所有文件。"
