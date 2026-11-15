# 开发用：以独立的数据目录启动应用并执行一个步骤脚本
# 用法：powershell -File tools\run-e2e.ps1 -Steps tools\e2e\smoke.cjs [-Fresh]
param([Parameter(Mandatory = $true)][string]$Steps, [switch]$Fresh)
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $root '.e2e\userdata'
$out = Join-Path $root '.e2e\out'
if ($Fresh -and (Test-Path $data)) { Remove-Item $data -Recurse -Force }
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$env:VEYA_USER_DATA = $data
$env:VEYA_DEV_SCRIPT = Join-Path $root 'tools\e2e.cjs'
$env:VEYA_E2E_STEPS = (Resolve-Path $Steps).Path
$env:VEYA_E2E_OUT = $out
$p = Start-Process -FilePath (Join-Path $root 'node_modules\electron\dist\electron.exe') -ArgumentList "`"$root`"" -PassThru
if (-not $p.WaitForExit(240000)) { $p.Kill(); 'TIMEOUT' }
Get-Content (Join-Path $out 'log.txt') -Encoding UTF8
