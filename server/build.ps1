# 编译 Veya Sync：Linux amd64 / arm64 / armv7（发布用）+ Windows amd64（本机测试用）
# 用法: powershell -File server\build.ps1 [-Version 0.1.11] [-Out dist\sync]
param(
  [string]$Version = '',
  [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $Version) { $Version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version }
if (-not $Out) { $Out = Join-Path $root 'dist\sync' }
$go = 'D:\Claude\tools\go\bin\go.exe'
if (-not (Test-Path $go)) { $go = 'go' }
$env:GOPROXY = 'https://goproxy.cn,direct'
$env:CGO_ENABLED = '0'
New-Item -ItemType Directory -Force $Out | Out-Null
Push-Location $PSScriptRoot
try {
  $targets = @(
    @{ os = 'linux'; arch = 'amd64'; arm = ''; name = 'veya-sync-linux-amd64' },
    @{ os = 'linux'; arch = 'arm64'; arm = ''; name = 'veya-sync-linux-arm64' },
    @{ os = 'linux'; arch = 'arm'; arm = '7'; name = 'veya-sync-linux-armv7' },
    @{ os = 'windows'; arch = 'amd64'; arm = ''; name = 'veya-sync-windows-amd64.exe' }
  )
  foreach ($t in $targets) {
    $env:GOOS = $t.os; $env:GOARCH = $t.arch; $env:GOARM = $t.arm
    & $go build -trimpath -ldflags "-s -w -X main.version=$Version" -o (Join-Path $Out $t.name) .
    if ($LASTEXITCODE -ne 0) { throw "build $($t.name) failed" }
  }
} finally {
  Remove-Item Env:GOOS, Env:GOARCH, Env:GOARM -ErrorAction SilentlyContinue
  Pop-Location
}
# 安装脚本必须是 LF 换行
$sh = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'install.sh')).Replace("`r`n", "`n")
[IO.File]::WriteAllText((Join-Path $Out 'veya-sync-install.sh'), $sh, (New-Object Text.UTF8Encoding($false)))
# 校验文件只列 Linux 版本（安装脚本用）
$lines = foreach ($n in 'veya-sync-linux-amd64', 'veya-sync-linux-arm64', 'veya-sync-linux-armv7', 'veya-sync-install.sh') {
  $h = (Get-FileHash -Algorithm SHA256 (Join-Path $Out $n)).Hash.ToLower()
  "$h *$n"
}
[IO.File]::WriteAllText((Join-Path $Out 'veya-sync-SHA256SUMS.txt'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
Get-ChildItem $Out | Select-Object Name, Length | Format-Table -AutoSize
