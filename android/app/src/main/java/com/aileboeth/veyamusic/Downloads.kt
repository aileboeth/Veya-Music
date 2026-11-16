package com.aileboeth.veyamusic

import android.content.ContentValues
import android.net.Uri
import android.provider.MediaStore
import okhttp3.Call
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * 下载到系统的「音乐/Veya Music」（MediaStore，不需要存储权限；其他音乐 App 和文件管理器都能看到）
 */
object Downloads {
    private const val DIR = "Music/Veya Music"
    private val calls = ConcurrentHashMap<String, Call>()
    private val resolver get() = VeyaApp.instance.contentResolver

    private fun mime(ext: String) = when (ext.lowercase()) {
        "flac" -> "audio/flac"
        "m4a" -> "audio/mp4"
        "ogg" -> "audio/ogg"
        "wav" -> "audio/x-wav"
        "aac" -> "audio/aac"
        else -> "audio/mpeg"
    }

    private fun sniff(b: ByteArray, n: Int): String? {
        if (n < 12) return null
        val tag = String(b, 0, 4, Charsets.ISO_8859_1)
        return when {
            String(b, 4, 4, Charsets.ISO_8859_1) == "ftyp" -> "m4a"
            tag == "fLaC" -> "flac"
            tag == "OggS" -> "ogg"
            tag == "RIFF" -> "wav"
            tag.startsWith("ID3") || (b[0] == 0xff.toByte() && (b[1].toInt() and 0xe0) == 0xe0) -> "mp3"
            else -> null
        }
    }

    fun save(a: JSONObject): JSONObject {
        val id = a.getString("id")
        val base = a.getString("base")
        var ext = a.optString("ext", "mp3")
        val call = Net.playerClient().newCall(Request.Builder().url(a.getString("url"))
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36").build())
        calls[id] = call
        var uri: Uri? = null
        try {
            call.execute().use { resp ->
                if (resp.code != 200) throw IllegalStateException("服务器返回 ${resp.code}")
                val body = resp.body ?: throw IllegalStateException("没有内容")
                val total = body.contentLength()
                val input = body.byteStream()
                val head = ByteArray(16)
                var headLen = 0
                while (headLen < 12) {
                    val n = input.read(head, headLen, head.size - headLen)
                    if (n < 0) break
                    headLen += n
                }
                sniff(head, headLen)?.let { ext = it }
                val values = ContentValues().apply {
                    put(MediaStore.Audio.Media.DISPLAY_NAME, "$base.$ext")
                    put(MediaStore.Audio.Media.MIME_TYPE, mime(ext))
                    put(MediaStore.Audio.Media.RELATIVE_PATH, DIR)
                    put(MediaStore.Audio.Media.IS_PENDING, 1)
                }
                uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("无法在音乐文件夹里创建文件")
                var done = headLen.toLong()
                var lastEmit = 0L
                resolver.openOutputStream(uri!!)!!.use { out ->
                    out.write(head, 0, headLen)
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        val now = System.currentTimeMillis()
                        if (now - lastEmit > 300) {
                            lastEmit = now
                            WebHost.emit("dl", JSONObject().put("id", id).put("total", total).put("downloaded", done))
                        }
                    }
                }
                if (done < 20_000) throw IllegalStateException("下载到的文件无效")
                resolver.update(uri!!, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
                return JSONObject().put("uri", uri.toString()).put("bytes", done)
            }
        } catch (e: Exception) {
            uri?.let { try { resolver.delete(it, null, null) } catch (_: Exception) {} }
            throw if (call.isCanceled()) IllegalStateException("已取消") else e
        } finally {
            calls.remove(id)
        }
    }

    fun cancel(id: String) {
        calls.remove(id)?.cancel()
    }

    /** 歌词文件放在歌曲旁边（部分系统不允许在音乐文件夹里放文本文件，失败就算了） */
    fun saveText(a: JSONObject) {
        try {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, "${a.getString("base")}.${a.optString("ext", "lrc")}")
                put(MediaStore.MediaColumns.MIME_TYPE, "application/octet-stream")
                put(MediaStore.MediaColumns.RELATIVE_PATH, DIR)
            }
            val uri = resolver.insert(MediaStore.Files.getContentUri("external"), values) ?: return
            resolver.openOutputStream(uri)?.use { it.write(a.optString("text").toByteArray()) }
        } catch (_: Exception) {}
    }

    fun exists(uri: String): Boolean = try {
        resolver.query(Uri.parse(uri), arrayOf(MediaStore.MediaColumns._ID), null, null, null)?.use { it.count > 0 } == true
    } catch (_: Exception) { false }
}
