settings put system screen_off_timeout 600000
input keyevent KEYCODE_WAKEUP
sleep 1
wm dismiss-keyguard
input keyevent 82
