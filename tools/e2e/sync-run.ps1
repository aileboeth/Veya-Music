# 同步端到端测试：本地起一个 Veya Sync 服务器，两个数据目录轮流 / 同时运行 tools/e2e/sync.cjs
# 先 npm run build 和 powershell -File server\build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$exe = Join-Path $root 'dist\sync\veya-sync-windows-amd64.exe'
$base = Join-Path $root '.e2e\sync'
if (Test-Path $base) { Remove-Item $base -Recurse -Force }
New-Item -ItemType Directory -Force $base | Out-Null
$cfg = Join-Path $base 'server\config.json'
& $exe init -c $cfg --port 17651 --url https://127.0.0.1:17651 | Out-Null
$code = (& $exe info -c $cfg --no-qr | Where-Object { $_ -match '^veya1\.' } | Select-Object -First 1)
$server = Start-Process -FilePath $exe -ArgumentList "serve -c `"$cfg`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $base 'server.log') -RedirectStandardError (Join-Path $base 'server.err')
Start-Sleep 1

$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
function Start-Phase($phase, $who) {
  $env:VEYA_USER_DATA = Join-Path $base "data-$who"
  $env:VEYA_DEV_SCRIPT = Join-Path $root 'tools\e2e.cjs'
  $env:VEYA_E2E_STEPS = Join-Path $root 'tools\e2e\sync.cjs'
  $env:VEYA_E2E_OUT = Join-Path $base "out-$phase"
  $env:VEYA_E2E_PHASE = $phase
  $env:VEYA_E2E_PAIR = $code
  $env:NO_PROXY = '127.0.0.1,localhost'
  Start-Process -FilePath $electron -ArgumentList "`"$root`"" -PassThru
}
function Show($phase) {
  "---- $phase ----"
  Get-Content (Join-Path $base "out-$phase\log.txt") -Encoding UTF8 -ErrorAction SilentlyContinue
}
try {
  foreach ($ph in @(@('A1', 'A'), @('B1', 'B'), @('A2', 'A'))) {
    $p = Start-Phase $ph[0] $ph[1]
    if (-not $p.WaitForExit(120000)) { $p.Kill(); "TIMEOUT $($ph[0])" }
    Show $ph[0]
  }
  $a = Start-Phase 'A3' 'A'
  Start-Sleep 2
  $b = Start-Phase 'B2' 'B'
  foreach ($p in @($a, $b)) { if (-not $p.WaitForExit(120000)) { $p.Kill(); 'TIMEOUT realtime' } }
  Show 'A3'
  Show 'B2'
  foreach ($ph in @(@('UI', 'A'), @('UI0', 'C'))) {
    $p = Start-Phase $ph[0] $ph[1]
    if (-not $p.WaitForExit(120000)) { $p.Kill(); "TIMEOUT $($ph[0])" }
    Show $ph[0]
  }
} finally {
  if (-not $server.HasExited) { $server.Kill() }
  "---- server ----"
  Get-Content (Join-Path $base 'server.log') -ErrorAction SilentlyContinue
  Get-Content (Join-Path $base 'server.err') -ErrorAction SilentlyContinue
}
