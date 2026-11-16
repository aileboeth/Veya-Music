logcat -d -t ${2:-2000} | grep -E 'VeyaJS|AndroidRuntime|veyamusic|ExoPlayer|chromium' | tail -n ${1:-80}
