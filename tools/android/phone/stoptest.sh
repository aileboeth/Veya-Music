# 模拟「通知被划掉」：Media3 收到的是同一个停止命令。播放中应该继续播放、通知还在；暂停时才真的停
st() { dumpsys media_session | grep -m1 -o 'state=PlaybackState {state=[0-9]*' | grep -o '[0-9]*$'; }
notif() { dumpsys notification | grep -c 'pkg=com.aileboeth.veyamusic.debug'; }
echo "before: state=$(st) notif=$(notif)"
cmd media_session dispatch stop
sleep 2
echo "after stop while playing: state=$(st) notif=$(notif)  (3 = still playing)"
cmd media_session dispatch pause
sleep 1
cmd media_session dispatch stop
sleep 2
echo "after stop while paused: state=$(st) notif=$(notif)  (1 = stopped)"
