package com.aileboeth.veyamusic

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
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
        session = MediaSession.Builder(this, JsPlayer(PlayerHub.player))
            .setSessionActivity(open)
            .setCallback(callback)
            .setMediaButtonPreferences(buttons(false))
            .build()
        ensureChannel()
        // 标准媒体通知：vivo / 小米 / 原生 Android 都按自己系统的样式画（封面、歌名、按钮），和其他音乐 App 一致
        setMediaNotificationProvider(
            object : DefaultMediaNotificationProvider(this, { 1001 }, CHANNEL, R.string.playback_channel) {
                // 按钮顺序和常见音乐 App 一致：爱心、上一首、播放暂停、下一首、词
                override fun getMediaButtons(
                    session: MediaSession,
                    playerCommands: Player.Commands,
                    mediaButtonPreferences: ImmutableList<CommandButton>,
                    showPauseButton: Boolean,
                ): ImmutableList<CommandButton> {
                    val list = super.getMediaButtons(session, playerCommands, mediaButtonPreferences, showPauseButton).toMutableList()
                    val like = list.indexOfFirst { it.sessionCommand?.customAction == ACTION_LIKE }
                    if (like > 0) list.add(0, list.removeAt(like))
                    return ImmutableList.copyOf(list)
                }
            }.apply { setSmallIcon(R.drawable.ic_notify) },
        )
    }

    /**
     * 「喜欢」和「桌面歌词」两个自定义按钮：通知卡片、锁屏、手表 / 车机上显示在上一首、下一首两边
     * （和汽水音乐、QQ 音乐的卡片一样：爱心、上一首、播放暂停、下一首、词）
     */
    private var likedShown = false

    private fun buttons(liked: Boolean): ImmutableList<CommandButton> = ImmutableList.of(
        CommandButton.Builder(if (liked) CommandButton.ICON_HEART_FILLED else CommandButton.ICON_HEART_UNFILLED)
            .setDisplayName(if (liked) "取消喜欢" else "喜欢")
            .setSessionCommand(SessionCommand(ACTION_LIKE, Bundle.EMPTY))
            .build(),
        CommandButton.Builder(CommandButton.ICON_UNDEFINED)
            .setCustomIconResId(R.drawable.nf_lyric)
            .setDisplayName("桌面歌词")
            .setSessionCommand(SessionCommand(ACTION_LYRIC, Bundle.EMPTY))
            .build(),
    )

    private val callback = object : MediaSession.Callback {
        override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult {
            val commands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS.buildUpon()
                .add(SessionCommand(ACTION_LIKE, Bundle.EMPTY))
                .add(SessionCommand(ACTION_LYRIC, Bundle.EMPTY))
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(commands)
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            when (customCommand.customAction) {
                ACTION_LIKE -> WebHost.emit("media", JSONObject().put("action", "like"))
                ACTION_LYRIC -> WebHost.emit("media", JSONObject().put("action", "lyric"))
                else -> return Futures.immediateFuture(SessionResult(SessionError.ERROR_NOT_SUPPORTED))
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
        }
    }

    /** 页面告诉我们「喜欢」状态变了：换爱心图标（系统随之重画通知） */
    fun refreshNotification() {
        val liked = PlayerHub.notifyInfo().liked
        if (liked == likedShown) return
        likedShown = liked
        try { session?.setMediaButtonPreferences(buttons(liked)) } catch (_: Exception) {}
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
        private const val ACTION_LIKE = "veya.like"
        private const val ACTION_LYRIC = "veya.lyric"
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
