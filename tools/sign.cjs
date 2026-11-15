// electron-builder 的自定义签名钩子：用本机证书库里的「Veya Music」代码签名证书给 exe 签名
// 证书只存在发布者的电脑上（Cert:\CurrentUser\My）；找不到证书时跳过签名，其他人照样可以构建
const { execFileSync } = require('child_process')

const SUBJECT = process.env.VEYA_SIGN_SUBJECT || 'CN=Veya Music, O=aileboeth'
const TIMESTAMP = process.env.VEYA_SIGN_TIMESTAMP || 'http://timestamp.digicert.com'

const SCRIPT = `
$ErrorActionPreference = 'Stop'
$cert = Get-ChildItem Cert:\\CurrentUser\\My -CodeSigningCert | Where-Object { $_.Subject -eq $env:VEYA_SIGN_SUBJECT -and $_.NotAfter -gt (Get-Date) } | Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) { Write-Output 'NOCERT'; exit 0 }
$sig = $null
try { $sig = Set-AuthenticodeSignature -FilePath $env:VEYA_SIGN_FILE -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $env:VEYA_SIGN_TIMESTAMP } catch { $sig = $null }
if (-not $sig -or -not $sig.SignerCertificate) {
  # 时间戳服务器连不上时，退回到不带时间戳的签名
  $sig = Set-AuthenticodeSignature -FilePath $env:VEYA_SIGN_FILE -Certificate $cert -HashAlgorithm SHA256
  Write-Output 'NOTIMESTAMP'
}
if (-not $sig.SignerCertificate) { throw "sign failed: $($sig.StatusMessage)" }
Write-Output ('SIGNED ' + $sig.SignerCertificate.Thumbprint)
`

let warned = false
exports.default = async function sign(configuration) {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT], {
    env: { ...process.env, VEYA_SIGN_FILE: configuration.path, VEYA_SIGN_SUBJECT: SUBJECT, VEYA_SIGN_TIMESTAMP: TIMESTAMP },
    encoding: 'utf8',
  })
  if (out.includes('NOCERT')) {
    if (!warned) console.warn(`  • [sign] 证书库里没有 "${SUBJECT}"，跳过签名`)
    warned = true
    return
  }
  if (out.includes('NOTIMESTAMP')) console.warn(`  • [sign] 时间戳服务器不可用，已签名但不带时间戳: ${configuration.path}`)
  if (!out.includes('SIGNED')) throw new Error('签名失败: ' + out)
}
