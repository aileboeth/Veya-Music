cp /data/debian/root/veya/app-debug.apk /data/local/tmp/veya.apk
pm install -r -g /data/local/tmp/veya.apk
rm /data/local/tmp/veya.apk
appops set com.aileboeth.veyamusic.debug SYSTEM_ALERT_WINDOW allow
dumpsys deviceidle whitelist +com.aileboeth.veyamusic.debug >/dev/null
echo installed
