package com.aileboeth.veyamusic

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * 页面调用的原生接口（window.VeyaNative）。
 * - 同步方法：文件读写（限定在应用私有目录里）、播放器控制
 * - call(id, method, args)：在后台线程执行，完成后通知页面用 take(id) 取结果
 */
object Bridge {
    private val results = ConcurrentHashMap<String, String>()
    private val root: File by lazy { VeyaApp.instance.filesDir.canonicalFile }

    /** 把页面给的相对路径变成文件，不允许跳出应用私有目录 */
    private fun file(path: String): File {
        val f = File(root, path.trimStart('/')).canonicalFile
        require(f.path == root.path || f.path.startsWith(root.path + File.separator)) { "路径不允许: $path" }
        return f
    }

    @JavascriptInterface
    fun info(): String {
        val ctx = VeyaApp.instance
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return JSONObject()
            .put("version", pi.versionName?.removeSuffix("-debug") ?: "0.0.0")
            .put("versionCode", if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else 0)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("model", Build.MODEL)
            .put("brand", Build.BRAND)
            .put("debug", BuildConfig.DEBUG)
            .put("dataDir", root.path)
            .toString()
    }

    @JavascriptInterface
    fun take(id: String): String? = results.remove(id)

    @JavascriptInterface
    fun call(id: String, method: String, args: String?) {
        VeyaApp.io.execute {
            val out = try {
                val parsed: Any? = when {
                    args.isNullOrEmpty() || args == "null" -> null
                    args.trimStart().startsWith("[") -> JSONArray(args)
                    args.trimStart().startsWith("{") -> JSONObject(args)
                    else -> args
                }
                JSONObject().put("ok", true).put("data", dispatch(method, parsed) ?: JSONObject.NULL)
            } catch (e: Throwable) {
                val cause = e.cause ?: e
                JSONObject().put("ok", false).put("error", cause.message ?: cause.javaClass.simpleName)
            }
            results[id] = out.toString()
            WebHost.ready(id)
        }
    }

    // ---------------- 文件（同步） ----------------
    @JavascriptInterface
    fun fsRead(path: String): String? = try { file(path).takeIf { it.isFile }?.readText() } catch (_: Exception) { null }

    @JavascriptInterface
    fun fsWrite(path: String, data: String): Boolean = try {
        val f = file(path)
        f.parentFile?.mkdirs()
        f.writeText(data)
        true
    } catch (_: Exception) { false }

    @JavascriptInterface
    fun fsExists(path: String): Boolean = try { file(path).exists() } catch (_: Exception) { false }

    @JavascriptInterface
    fun fsDelete(path: String): Boolean = try { file(path).let { if (it.isDirectory) it.deleteRecursively() else it.delete() } } catch (_: Exception) { false }

    @JavascriptInterface
    fun fsList(path: String): String = try { JSONArray(file(path).list()?.sorted() ?: emptyList<String>()).toString() } catch (_: Exception) { "[]" }

    @JavascriptInterface
    fun fsStat(path: String): String? = try {
        val f = file(path)
        if (!f.exists()) null else JSONObject().put("size", f.length()).put("mtime", f.lastModified()).put("dir", f.isDirectory).toString()
    } catch (_: Exception) { null }

    @JavascriptInterface
    fun fsMkdir(path: String): Boolean = try { file(path).mkdirs() || file(path).isDirectory } catch (_: Exception) { false }

    @JavascriptInterface
    fun fsRename(from: String, to: String): Boolean = try {
        val a = file(from)
        val b = file(to)
        b.parentFile?.mkdirs()
        if (b.exists()) b.delete()
        a.renameTo(b)
    } catch (_: Exception) { false }

    @JavascriptInterface
    fun fsCopy(from: String, to: String): Boolean = try {
        val b = file(to)
        b.parentFile?.mkdirs()
        file(from).copyTo(b, overwrite = true)
        true
    } catch (_: Exception) { false }

    // ---------------- 播放器 / 同步通道（同步，转到主线程执行） ----------------
    @JavascriptInterface
    fun player(op: String, json: String?) {
        VeyaApp.main.post { PlayerHub.command(op, json) }
    }

    @JavascriptInterface
    fun wsSend(id: String, text: String): Boolean = WsHub.send(id, text)

    @JavascriptInterface
    fun wsClose(id: String) = WsHub.close(id)

    @JavascriptInterface
    fun fileExists(uri: String): Boolean = Downloads.exists(uri)

    @JavascriptInterface
    fun toast(text: String) {
        VeyaApp.main.post { Toast.makeText(VeyaApp.instance, text, Toast.LENGTH_SHORT).show() }
    }

    // ---------------- 异步方法 ----------------
    fun <T> onMain(block: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        val f = CompletableFuture<T>()
        VeyaApp.main.post {
            try { f.complete(block()) } catch (e: Throwable) { f.completeExceptionally(e) }
        }
        return f.get(60, TimeUnit.SECONDS)
    }

    private fun activity() = MainActivity.current ?: throw IllegalStateException("请先打开 Veya Music")

    private fun dispatch(method: String, a: Any?): Any? {
        val args = a as? JSONObject ?: JSONObject()
        return when (method) {
            "http" -> Net.request(args)
            "httpCancel" -> { Net.cancel(args.optString("cancelId")); null }
            "net.proxy" -> {
                Net.proxy = Net.ProxyConf(args.optString("mode", "system"), args.optString("host", "127.0.0.1"), args.optInt("port", 7890), args.optString("scope", "update"))
                PlayerHub.refreshNetwork()
                null
            }
            "app.open" -> { WebHost.openExternal(args.getString("url")); null }
            "app.copy" -> onMain {
                val cm = VeyaApp.instance.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("Veya Music", args.optString("text")))
                null
            }
            "app.share" -> onMain {
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, args.optString("text"))
                VeyaApp.instance.startActivity(Intent.createChooser(send, "分享").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                null
            }
            "ui.theme" -> onMain { MainActivity.current?.setDarkBars(args.optBoolean("dark")); null }
            "ui.insets" -> onMain { MainActivity.current?.insets() ?: JSONObject() }
            "qr.scan" -> activity().scanQr().get(10, TimeUnit.MINUTES)
            "file.pick" -> activity().pickFiles(args.optBoolean("multiple"), args.optBoolean("binary")).get(10, TimeUnit.MINUTES)
            "player.sleep" -> onMain { PlayerHub.sleep(args) }
            "overlay.show" -> onMain { LyricOverlay.show(args) }
            "overlay.hide" -> onMain { LyricOverlay.hide(); null }
            "overlay.conf" -> onMain { LyricOverlay.setConf(args); null }
            "overlay.place" -> onMain { LyricOverlay.place(args.optString("where")); null }
            "dl.save" -> Downloads.save(args)
            "dl.cancel" -> { Downloads.cancel(args.optString("id")); null }
            "dl.saveText" -> { Downloads.saveText(args); null }
            "update.download" -> Updater.download(args)
            "update.install" -> { Updater.install(args.getString("path")); null }
            "sync.cert" -> JSONObject().put("pem", Net.fetchPinnedCert(args.getString("url"), args.getString("fp")))
            "ws.open" -> { WsHub.open(args.getString("id"), args.getString("url"), args.optString("pin", "")); null }
            "log.text" -> synchronized(WebHost.logs) { WebHost.logs.joinToString("\n") }
            else -> throw IllegalArgumentException("未知的方法: $method")
        }
    }
}
