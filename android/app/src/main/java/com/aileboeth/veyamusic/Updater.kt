package com.aileboeth.veyamusic

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/** 应用内更新：下载 APK（依次试 GitHub 和加速镜像）→ 校验 SHA-256 → 交给系统安装 */
object Updater {
    fun download(a: JSONObject): JSONObject {
        val urls = a.getJSONArray("urls")
        val sha = a.getString("sha256").lowercase()
        val dir = File(VeyaApp.instance.cacheDir, "update").apply { mkdirs() }
        val out = File(dir, "veya-music.apk")
        var last: Exception? = null
        for (i in 0 until urls.length()) {
            try {
                val call = Net.client("update", true, 120_000).newCall(Request.Builder().url(urls.getString(i)).build())
                call.execute().use { resp ->
                    if (resp.code != 200) throw IllegalStateException("服务器返回 ${resp.code}")
                    val body = resp.body ?: throw IllegalStateException("没有内容")
                    val total = body.contentLength().takeIf { it > 0 } ?: a.optLong("size", 0)
                    val md = MessageDigest.getInstance("SHA-256")
                    var done = 0L
                    var lastEmit = 0L
                    out.outputStream().use { o ->
                        body.byteStream().use { input ->
                            val buf = ByteArray(64 * 1024)
                            while (true) {
                                val n = input.read(buf)
                                if (n < 0) break
                                o.write(buf, 0, n)
                                md.update(buf, 0, n)
                                done += n
                                val now = System.currentTimeMillis()
                                if (total > 0 && now - lastEmit > 400) {
                                    lastEmit = now
                                    WebHost.emit("update", JSONObject().put("type", "progress").put("percent", done * 100.0 / total))
                                }
                            }
                        }
                    }
                    val got = md.digest().joinToString("") { "%02x".format(it) }
                    if (got != sha) throw IllegalStateException("安装包校验失败")
                    return JSONObject().put("path", out.absolutePath)
                }
            } catch (e: Exception) {
                last = e
                out.delete()
            }
        }
        throw last ?: IllegalStateException("下载失败")
    }

    fun install(path: String) {
        val ctx = VeyaApp.instance
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            throw IllegalStateException("请先允许 Veya Music「安装未知应用」，然后再点一次安装")
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", File(path))
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
