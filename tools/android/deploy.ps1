# 打包调试版并装到测试手机（CC9e，ssh phone）上打开：powershell -File tools\android\deploy.ps1 [-NoBuild]
param([switch]$NoBuild)
# 不能用 Stop：npm / gradle 往 stderr 写提示，PowerShell 5.1 会当成错误中断
$ErrorActionPreference = 'Continue'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not $NoBuild) {
  Push-Location $root
  try {
    npm run build:android 2>&1 | Select-String 'rror|built in' | ForEach-Object { $_.Line }
    Push-Location android
    $env:JAVA_HOME = 'D:\JDK\jdk25'
    .\gradlew.bat :app:assembleDebug --no-daemon --console=plain -q 2>&1 | Select-String 'error|FAIL' | ForEach-Object { $_.Line }
    Pop-Location
  } finally { Pop-Location }
}
scp -q (Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk') phone:/root/veya/
ssh phone "chroot /proc/1/root /system/bin/sh /data/debian/root/veya/install.sh >/dev/null; chroot /proc/1/root /system/bin/sh /data/debian/root/veya/open.sh"
'deployed'
