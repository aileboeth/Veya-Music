package com.aileboeth.veyamusic

import android.app.PendingIntent
import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import org.json.JSONObject

/**
 * 后台播放服务：媒体通知、锁屏控制、耳机 / 蓝牙按键。
 * 上一首 / 下一首交给页面处理（页面知道播放队列、随机模式、续播推荐）。
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, JsPlayer(PlayerHub.player)).setSessionActivity(open).build()
        ensureChannel()
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this)
                .setChannelId(CHANNEL)
                .setChannelName(R.string.playback_channel)
                .build()
                .apply { setSmallIcon(R.drawable.ic_notify) },
        )
    }

    /**
     * 播放通知用自己的渠道：Media3 默认建的是「低」重要性（静默通知），
     * 不少系统（vivo / OPPO 等）锁屏上不显示静默通知。这里用「默认」重要性但不响铃不振动，锁屏完整显示。
     */
    private fun ensureChannel() {
        if (android.os.Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(android.app.NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) == null) {
            val ch = android.app.NotificationChannel(CHANNEL, getString(R.string.playback_channel), android.app.NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = getString(R.string.playback_channel_desc)
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
                setShowBadge(false)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            nm.createNotificationChannel(ch)
        }
        // 旧版本建的 Media3 默认渠道不再使用
        if (nm.getNotificationChannel(OLD_CHANNEL) != null) nm.deleteNotificationChannel(OLD_CHANNEL)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = PlayerHub.player
        // 没在放歌时，划掉应用就彻底退出
        if (!p.playWhenReady || p.mediaItemCount == 0) {
            LyricOverlay.hide()
            stopSelf()
        }
    }

    override fun onDestroy() {
        session?.release()
        session = null
        instance = null
        super.onDestroy()
    }

    /** 上一首 / 下一首交给页面 */
    private class JsPlayer(p: Player) : ForwardingPlayer(p) {
        private val extra = intArrayOf(
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        )

        override fun getAvailableCommands(): Player.Commands = super.getAvailableCommands().buildUpon().addAll(*extra).build()
        override fun isCommandAvailable(command: Int) = command in extra || super.isCommandAvailable(command)
        override fun hasNextMediaItem() = true
        override fun hasPreviousMediaItem() = true
        override fun seekToNext() = send("next")
        override fun seekToNextMediaItem() = send("next")
        override fun seekToPrevious() = send("prev")
        override fun seekToPreviousMediaItem() = send("prev")

        private fun send(action: String) = WebHost.emit("media", JSONObject().put("action", action))
    }

    companion object {
        private const val CHANNEL = "veya_playback"
        private const val OLD_CHANNEL = "default_channel_id"
        var instance: PlaybackService? = null
            private set

        /** 开始播放时确保服务在运行（之后由 Media3 自己切换成前台服务） */
        fun ensure() {
            if (instance != null) return
            try {
                VeyaApp.instance.startService(Intent(VeyaApp.instance, PlaybackService::class.java))
            } catch (_: Exception) {
                // 应用在后台时系统可能不允许启动服务：等用户回到应用时再启动
            }
        }
    }
}
