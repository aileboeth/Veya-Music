# 发布版冒烟测试（安卓侧运行）：安装 /root/veya/rel.apk，打开，看有没有崩溃、播放服务有没有连上
cp /data/debian/root/veya/rel.apk /data/local/tmp/rel.apk
pm install -r /data/local/tmp/rel.apk
rm /data/local/tmp/rel.apk
logcat -c
input keyevent KEYCODE_WAKEUP
settings put system screen_off_timeout 600000
wm dismiss-keyguard
am start -n com.aileboeth.veyamusic/.MainActivity >/dev/null
sleep 12
logcat -d | grep -E 'AndroidRuntime|FATAL|com.aileboeth.veyamusic' | grep -v Mixed | tail -n 8
echo sessions: $(dumpsys media_session | grep -c 'com.aileboeth.veyamusic/')
screencap -p /data/debian/root/veya/r1.png
