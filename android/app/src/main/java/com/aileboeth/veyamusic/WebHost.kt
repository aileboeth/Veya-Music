package com.aileboeth.veyamusic

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.MutableContextWrapper
import android.net.Uri
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.util.ArrayDeque

/**
 * 整个应用只有一个 WebView，挂在 Application 上：界面关掉（从最近任务划掉）以后页面里的播放逻辑还在跑，
 * 再打开时直接接回去。显示时把它放进 MainActivity，平时用 Application 的 context。
 */
@SuppressLint("StaticFieldLeak")
object WebHost {
    const val URL = "https://appassets.androidplatform.net/assets/www/index.html"
    private var webView: WebView? = null
    private val wrapper by lazy { MutableContextWrapper(VeyaApp.instance) }
    /** 最近的页面日志（排查问题用，设置里可以导出） */
    val logs = ArrayDeque<String>()

    fun log(line: String) {
        synchronized(logs) {
            logs.addLast(line)
            while (logs.size > 400) logs.removeFirst()
        }
    }

    /** 没有界面时也要能跑（例如播放服务先启动）：建好 WebView 但不显示 */
    fun ensure(): WebView = webView ?: create()

    fun attach(activity: Activity): WebView {
        val wv = ensure()
        wrapper.baseContext = activity
        (wv.parent as? ViewGroup)?.removeView(wv)
        return wv
    }

    fun detach(activity: Activity) {
        val wv = webView ?: return
        if (wrapper.baseContext === activity) wrapper.baseContext = VeyaApp.instance
        (wv.parent as? ViewGroup)?.removeView(wv)
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun create(): WebView {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        val wv = WebView(wrapper)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(VeyaApp.instance))
            .build()
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
            setSupportZoom(false)
            builtInZoomControls = false
            // 页面在 https 下，封面图很多是 http
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = "$userAgentString VeyaMusic/${BuildConfig.VERSION_NAME}"
        }
        wv.setBackgroundColor(0)
        wv.isVerticalScrollBarEnabled = false
        wv.overScrollMode = WebView.OVER_SCROLL_NEVER
        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                // 页面里点到的外部链接用浏览器打开
                if (url.scheme == "http" || url.scheme == "https") {
                    try {
                        VeyaApp.instance.startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    } catch (_: Exception) {}
                }
                return true
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // 页面进程被系统杀掉：重建一个（播放中的歌由原生播放器继续放）
                log("render process gone (crash=${detail.didCrash()})")
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
                webView = null
                MainActivity.current?.reattachWeb()
                return true
            }
        }
        wv.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                val line = "${m.messageLevel().name.take(1)} ${m.message()} (${m.sourceId()?.substringAfterLast('/')}:${m.lineNumber()})"
                Log.d("VeyaJS", line)
                log(line)
                return true
            }
        }
        wv.addJavascriptInterface(Bridge, "VeyaNative")
        wv.loadUrl(URL)
        webView = wv
        return wv
    }

    fun eval(js: String) {
        VeyaApp.main.post { webView?.evaluateJavascript(js, null) }
    }

    /** 原生 → 页面的事件 */
    fun emit(name: String, data: Any?) {
        val json = when (data) {
            null -> "null"
            is JSONObject -> data.toString()
            is String -> data
            else -> JSONObject.wrap(data)?.toString() ?: "null"
        }
        eval("window.__veyaNative&&__veyaNative.emit(${JSONObject.quote(name)},${JSONObject.quote(json)})")
    }

    fun ready(id: String) = eval("window.__veyaNative&&__veyaNative.ready(${JSONObject.quote(id)})")

    fun evalWithResult(js: String, cb: (String?) -> Unit) {
        VeyaApp.main.post {
            val wv = webView
            if (wv == null) cb(null) else wv.evaluateJavascript(js) { cb(it) }
        }
    }

    fun openExternal(url: String) {
        VeyaApp.instance.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
