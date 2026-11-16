# 测试手机截图，保存到会话的临时目录：powershell -File tools\android\shot.ps1 名字 [等待秒数]
param([Parameter(Mandatory = $true)][string]$Name, [int]$Wait = 1)
$out = if ($env:VEYA_SHOT_DIR) { $env:VEYA_SHOT_DIR } else { Join-Path $env:TEMP 'veya-shots' }
New-Item -ItemType Directory -Force $out | Out-Null
ssh phone "chroot /proc/1/root /system/bin/sh /data/debian/root/veya/shot.sh $Name $Wait"
scp -q "phone:/root/veya/$Name.png" (Join-Path $out "$Name.png")
Join-Path $out "$Name.png"
