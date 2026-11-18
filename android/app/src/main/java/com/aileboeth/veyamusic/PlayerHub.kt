package com.aileboeth.veyamusic

import android.content.Intent
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import okhttp3.Call
import org.json.JSONObject

/**
 * 唯一的 ExoPlayer。页面（NativeAudio）通过 Bridge.player(op, json) 控制它，状态用 "player" 事件告诉页面。
 * 页面预加载了下一首时放进播放列表第二项，放完自动接上（事件 advanced），不用等后台被限速的页面。
 * 整首歌词也交给这里：悬浮歌词和锁屏歌词在后台自己跟着走。
 */
@OptIn(UnstableApi::class)
object PlayerHub {
    data class Line(val t: Double, val d: Double, val text: String, val trans: String, val words: List<Triple<Double, Double, String>>?)

    private var exo: ExoPlayer? = null
    val player: ExoPlayer get() = exo ?: create()

    private var loadId = 0L
    private var meta = JSONObject()
    private var nextMeta = JSONObject()
    var lines: List<Line> = emptyList()
        private set
    var lineIndex = -1
        private set
    /** 锁屏 / 通知栏 / 车载蓝牙显示歌词（把当前这句放在「歌手」一栏） */
    private var lockLyric = false
    private var sleepAt = 0L
    private var sleepAfterSong = false
    private var pauseAtEnd = false
    var visible = true

    private val ticker = object : Runnable {
        override fun run() {
            val p = exo ?: return
            emit("pos")
            updateLine()
            if (p.isPlaying) VeyaApp.main.postDelayed(this, if (visible) 250 else 1000)
        }
    }

    private fun create(): ExoPlayer {
        val ctx = VeyaApp.instance
        // 每个请求都按当前的代理设置建客户端（改了代理马上生效）
        val factory = Call.Factory { req -> Net.playerClient().newCall(req) }
        val http = OkHttpDataSource.Factory(factory)
            .setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")
        val p = ExoPlayer.Builder(ctx)
            .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(ctx, http)))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        p.addListener(listener)
        exo = p
        return p
    }

    fun refreshNetwork() {}

    private fun emit(type: String, extra: (JSONObject.() -> Unit)? = null) {
        val p = exo ?: return
        val o = JSONObject().put("type", type).put("loadId", loadId).put("pos", p.currentPosition / 1000.0)
        val d = p.duration
        if (d != C.TIME_UNSET && d > 0) o.put("dur", d / 1000.0)
        extra?.invoke(o)
        WebHost.emit("player", o)
    }

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            emit("playing") { put("value", isPlaying) }
            VeyaApp.main.removeCallbacks(ticker)
            if (isPlaying) VeyaApp.main.post(ticker)
            LyricOverlay.onPlaying(isPlaying)
        }

        override fun onPlaybackStateChanged(state: Int) {
            when (state) {
                Player.STATE_BUFFERING -> emit("buffering") { put("value", true) }
                Player.STATE_READY -> {
                    emit("buffering") { put("value", false) }
                    emit("ready")
                }
                Player.STATE_ENDED -> {
                    if (pauseAtEnd) finishSleep()
                    emit("ended")
                }
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            val msg = when (error.errorCode) {
                PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "链接打不开（服务器拒绝）"
                PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED, PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "网络连接失败"
                PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED, PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED, PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED -> "音频格式不支持"
                else -> error.errorCodeName
            }
            emit("error") { put("message", msg) }
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || mediaItem == null) return
            // 预加载的下一首开始了
            if (pauseAtEnd) {
                VeyaApp.main.post { finishSleep() }
            }
            val id = mediaItem.localConfiguration?.tag as? Long ?: return
            loadId = id
            meta = nextMeta
            lines = emptyList()
            lineIndex = -1
            LyricOverlay.setLine(null, null)
            emit("advanced") { put("url", mediaItem.localConfiguration?.uri?.toString()) }
            VeyaApp.main.post {
                val p = exo ?: return@post
                if (p.currentMediaItemIndex > 0) p.removeMediaItems(0, p.currentMediaItemIndex)
            }
        }
    }

    private fun metadata(m: JSONObject, lyric: String? = null): MediaMetadata {
        val b = MediaMetadata.Builder()
            .setTitle(m.optString("title"))
            .setArtist(if (!lyric.isNullOrBlank()) lyric else m.optString("artist"))
            .setAlbumTitle(m.optString("album"))
            .setAlbumArtist(m.optString("artist"))
            .setDisplayTitle(m.optString("title"))
            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
        val art = m.optString("artwork").takeIf { it.startsWith("http") }
        if (art != null) {
            // 封面自己下载好再交给系统：Media3 自带的下载不走应用的代理设置，
            // 拿不到封面时 vivo 等系统会把通知显示成普通通知，锁屏也不出播放器
            val data = Artwork.get(art)
            if (data != null) b.setArtworkData(data, MediaMetadata.PICTURE_TYPE_FRONT_COVER)
            else b.setArtworkUri(Uri.parse(art))
        }
        return b.build()
    }

    /** 封面缓存：最近几首的封面（缩到 512 像素以内的 JPEG） */
    private object Artwork {
        private val cache = object : LinkedHashMap<String, ByteArray>(8, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ByteArray>?) = size > 6
        }
        private val loading = HashSet<String>()

        @Synchronized fun get(url: String): ByteArray? = cache[url]

        /** 后台下载，好了在主线程回调（已经有了就不回调） */
        fun load(url: String, done: () -> Unit) {
            synchronized(this) {
                if (cache.containsKey(url) || !loading.add(url)) return
            }
            VeyaApp.io.execute {
                val bytes = try {
                    val req = okhttp3.Request.Builder().url(url)
                        .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")
                        .build()
                    Net.client("music", true, 20_000).newCall(req).execute().use { r -> if (r.isSuccessful) r.body?.bytes() else null }
                        ?.let { shrink(it) }
                } catch (_: Exception) { null }
                synchronized(this) {
                    loading.remove(url)
                    if (bytes != null) cache[url] = bytes
                }
                if (bytes != null) VeyaApp.main.post(done)
            }
        }

        private fun shrink(raw: ByteArray): ByteArray? {
            val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (bounds.outWidth / (sample * 2) >= 512 && bounds.outHeight / (sample * 2) >= 512) sample *= 2
            val bmp = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.size,
                android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
            val max = maxOf(bmp.width, bmp.height)
            val scaled = if (max > 512) {
                val k = 512f / max
                android.graphics.Bitmap.createScaledBitmap(bmp, (bmp.width * k).toInt().coerceAtLeast(1), (bmp.height * k).toInt().coerceAtLeast(1), true)
            } else bmp
            val out = java.io.ByteArrayOutputStream()
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, out)
            return out.toByteArray()
        }
    }

    /** 当前歌曲 / 预加载的下一首的封面：下载好后更新通知和锁屏 */
    private fun loadArtwork(m: JSONObject) {
        val art = m.optString("artwork").takeIf { it.startsWith("http") } ?: return
        Artwork.load(art) {
            if (meta.optString("artwork") == art) updateCurrentMeta()
        }
    }

    private fun item(url: String, id: Long, m: JSONObject) = MediaItem.Builder()
        .setUri(url)
        .setMediaId("veya-$id")
        .setTag(id)
        .setMediaMetadata(metadata(m))
        .build()

    private fun updateCurrentMeta() {
        val p = exo ?: return
        val cur = p.currentMediaItem ?: return
        val lyric = if (lockLyric) lines.getOrNull(lineIndex)?.text else null
        try {
            p.replaceMediaItem(p.currentMediaItemIndex, cur.buildUpon().setMediaMetadata(metadata(meta, lyric)).build())
        } catch (_: Exception) {}
    }

    fun positionSec(): Double = (exo?.currentPosition ?: 0L) / 1000.0
    fun isPlaying() = exo?.isPlaying == true

    private fun updateLine() {
        if (lines.isEmpty()) return
        val t = positionSec() + 0.2
        var lo = 0
        var hi = lines.size - 1
        var idx = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (lines[mid].t <= t) { idx = mid; lo = mid + 1 } else hi = mid - 1
        }
        if (idx == lineIndex) return
        lineIndex = idx
        LyricOverlay.setLine(lines.getOrNull(idx), lines.getOrNull(idx + 1))
        if (lockLyric) updateCurrentMeta()
    }

    fun command(op: String, json: String?) {
        val a = json?.takeIf { it.startsWith("{") }?.let { runCatching { JSONObject(it) }.getOrNull() }
        val p = player
        when (op) {
            "load" -> {
                a ?: return
                loadId = a.optLong("loadId")
                lineIndex = -1
                p.setMediaItem(item(a.getString("url"), loadId, meta))
                p.playWhenReady = false
                p.prepare()
            }
            "play" -> {
                if (p.mediaItemCount == 0) return
                if (p.playbackState == Player.STATE_IDLE) p.prepare()
                if (p.playbackState == Player.STATE_ENDED) p.seekTo(0)
                p.play()
                PlaybackService.ensure()
            }
            "pause" -> p.pause()
            "seek" -> {
                p.seekTo(((a?.optDouble("pos") ?: 0.0) * 1000).toLong())
                lineIndex = -1
                updateLine()
            }
            "volume" -> p.volume = (a?.optDouble("value", 1.0) ?: 1.0).toFloat()
            "stop" -> {
                p.stop()
                p.clearMediaItems()
                LyricOverlay.setLine(null, null)
            }
            "next" -> {
                val cur = p.currentMediaItemIndex
                if (p.mediaItemCount > cur + 1) p.removeMediaItems(cur + 1, p.mediaItemCount)
                if (a != null && p.mediaItemCount > 0) {
                    nextMeta = a.optJSONObject("meta") ?: JSONObject()
                    p.addMediaItem(item(a.getString("url"), a.optLong("loadId"), nextMeta))
                    loadArtwork(nextMeta)
                }
            }
            "meta" -> {
                meta = a ?: JSONObject()
                updateCurrentMeta()
                loadArtwork(meta)
                LyricOverlay.setTitle("${meta.optString("title")} - ${meta.optString("artist")}")
            }
            "lines" -> {
                val arr = a?.optJSONArray("lines")
                lines = if (arr == null) emptyList() else (0 until arr.length()).map { i ->
                    val l = arr.getJSONObject(i)
                    val w = l.optJSONArray("w")
                    Line(l.optDouble("t"), l.optDouble("d", 3.0), l.optString("x"), l.optString("r"),
                        w?.let { (0 until it.length()).map { j -> it.getJSONArray(j).let { x -> Triple(x.optDouble(0), x.optDouble(1), x.optString(2)) } } })
                }
                lineIndex = -1
                updateLine()
            }
            "lockLyric" -> {
                lockLyric = a?.optBoolean("on") == true
                updateCurrentMeta()
            }
        }
    }

    // ---------------- 定时关闭 ----------------
    private val sleepTask = Runnable {
        if (sleepAfterSong && exo?.isPlaying == true) pauseAtEnd = true else finishSleep()
    }

    private fun finishSleep() {
        pauseAtEnd = false
        sleepAt = 0
        exo?.pause()
        WebHost.emit("sleep", JSONObject().put("done", true))
    }

    /** minutes = 0 取消；afterSong = 到时间后把这首放完再停 */
    fun sleep(a: JSONObject): JSONObject {
        VeyaApp.main.removeCallbacks(sleepTask)
        pauseAtEnd = false
        val minutes = a.optDouble("minutes", 0.0)
        sleepAfterSong = a.optBoolean("afterSong")
        sleepAt = if (minutes > 0) System.currentTimeMillis() + (minutes * 60_000).toLong() else 0L
        if (sleepAt > 0) VeyaApp.main.postDelayed(sleepTask, (minutes * 60_000).toLong())
        return JSONObject().put("until", sleepAt).put("afterSong", sleepAfterSong)
    }

    fun openApp() {
        VeyaApp.instance.startActivity(Intent(VeyaApp.instance, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
