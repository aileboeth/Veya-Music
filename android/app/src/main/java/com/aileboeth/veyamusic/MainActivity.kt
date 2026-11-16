package com.aileboeth.veyamusic

import android.Manifest
import android.content.ComponentName
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CompletableFuture

class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private var controller: ListenableFuture<MediaController>? = null
    private var insetsJson = JSONObject().put("top", 0).put("bottom", 0).put("left", 0).put("right", 0).put("ime", 0)

    private var pendingScan: CompletableFuture<String?>? = null
    private val scanLauncher = registerForActivityResult(ScanContract()) { r -> pendingScan?.complete(r.contents); pendingScan = null }

    private var pendingPick: CompletableFuture<JSONArray>? = null
    private var pickBinary = false
    private val pickMany = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> finishPick(uris) }
    private val pickOne = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> finishPick(listOfNotNull(uri)) }
    private val notifyPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        current = this
        WindowCompat.setDecorFitsSystemWindows(window, false)
        root = FrameLayout(this)
        setContentView(root)
        reattachWeb()
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            // 输入法弹出时把网页顶上去（edge-to-edge 下 adjustResize 不会自动生效）
            v.setPadding(0, 0, 0, ime.bottom)
            val d = resources.displayMetrics.density
            insetsJson = JSONObject().put("top", bars.top / d).put("bottom", if (ime.bottom > 0) 0f else bars.bottom / d)
                .put("left", bars.left / d).put("right", bars.right / d).put("ime", ime.bottom / d)
            WebHost.emit("insets", insetsJson)
            insets
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // 先让页面处理（关闭播放页、弹窗、返回上一页），页面没得退了就回到桌面（音乐继续放）
                WebHost.evalWithResult("window.__veyaBack ? String(window.__veyaBack()) : 'false'") { r ->
                    if (r?.trim('"') != "true") moveTaskToBack(true)
                }
            }
        })
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            root.postDelayed({ notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS) }, 2500)
        }
    }

    /** 把 WebView 放进界面（页面进程被系统杀掉重建后也调用这里） */
    fun reattachWeb() {
        val wv = WebHost.attach(this)
        root.addView(wv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    fun insets(): JSONObject = insetsJson

    override fun onStart() {
        super.onStart()
        PlayerHub.visible = true
        WebHost.emit("app", JSONObject().put("type", "visible").put("visible", true))
        // 连上播放服务：开始放歌时由 Media3 把它切成前台服务（通知栏、锁屏控制）
        controller = MediaController.Builder(this, SessionToken(this, ComponentName(this, PlaybackService::class.java))).buildAsync()
    }

    override fun onStop() {
        super.onStop()
        PlayerHub.visible = false
        WebHost.emit("app", JSONObject().put("type", "visible").put("visible", false))
        controller?.let { MediaController.releaseFuture(it) }
        controller = null
    }

    override fun onPause() {
        super.onPause()
        WebHost.emit("app", JSONObject().put("type", "pause"))
    }

    override fun onDestroy() {
        WebHost.detach(this)
        if (current === this) current = null
        super.onDestroy()
    }

    fun setDarkBars(dark: Boolean) {
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.isAppearanceLightStatusBars = !dark
        c.isAppearanceLightNavigationBars = !dark
        window.decorView.setBackgroundColor(if (dark) 0xFF12141C.toInt() else 0xFFF4F6FB.toInt())
    }

    // ---------------- 扫码 ----------------
    fun scanQr(): CompletableFuture<String?> {
        val f = CompletableFuture<String?>()
        runOnUiThread {
            pendingScan?.complete(null)
            pendingScan = f
            scanLauncher.launch(ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt("扫描服务器上或电脑上显示的配对二维码")
                .setBeepEnabled(false)
                .setOrientationLocked(false))
        }
        return f
    }

    // ---------------- 选文件（导入音源脚本 / LX 列表） ----------------
    fun pickFiles(multiple: Boolean, binary: Boolean): CompletableFuture<JSONArray> {
        val f = CompletableFuture<JSONArray>()
        runOnUiThread {
            pendingPick?.complete(JSONArray())
            pendingPick = f
            pickBinary = binary
            if (multiple) pickMany.launch(arrayOf("*/*")) else pickOne.launch(arrayOf("*/*"))
        }
        return f
    }

    private fun finishPick(uris: List<Uri>) {
        val f = pendingPick ?: return
        pendingPick = null
        val binary = pickBinary
        VeyaApp.io.execute {
            val out = JSONArray()
            for (uri in uris) {
                try {
                    var name = uri.lastPathSegment ?: "file"
                    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                        if (c.moveToFirst()) name = c.getString(0) ?: name
                    }
                    val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: continue
                    if (bytes.size > 10 * 1024 * 1024) continue
                    val o = JSONObject().put("name", name)
                    if (binary) o.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)) else o.put("text", String(bytes, Charsets.UTF_8))
                    out.put(o)
                } catch (_: Exception) {}
            }
            f.complete(out)
        }
    }

    companion object {
        var current: MainActivity? = null
            private set
    }
}
