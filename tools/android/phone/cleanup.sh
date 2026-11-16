# 测试结束：关掉应用、临时同步服务器、调试转发，恢复息屏时间（在 Debian 里运行：bash /root/veya/cleanup.sh）
chroot /proc/1/root /system/bin/sh /data/debian/root/veya/stop.sh
chroot /proc/1/root /system/bin/sh /data/debian/root/veya/sleep.sh
for p in $(pgrep -f '[v]eya-sync serve') $(pgrep -f '[r]oot/veya/devfwd'); do kill $p; done
sleep 1
echo left: $(pgrep -fc '[v]eya-sync serve|[r]oot/veya/devfwd')
echo screen_off_timeout: $(chroot /proc/1/root /system/bin/sh -c 'settings get system screen_off_timeout')
