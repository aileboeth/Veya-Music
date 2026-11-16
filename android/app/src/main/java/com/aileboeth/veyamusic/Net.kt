package com.aileboeth.veyamusic

import android.util.Base64
import okhttp3.Call
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream
import java.util.zip.InflaterInputStream
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

/**
 * 网络：页面里所有请求（音乐平台接口、音源脚本、同步服务器）和播放器都用这里的 OkHttp。
 * 代理：跟随系统（WLAN 里设置的代理）/ 全部直连 / 固定端口（只有检查更新走 或 全部走）
 */
object Net {
    data class ProxyConf(val mode: String = "system", val host: String = "127.0.0.1", val port: Int = 7890, val scope: String = "update")

    @Volatile var proxy = ProxyConf()

    private val base: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
    private val calls = ConcurrentHashMap<String, Call>()

    private fun proxyFor(purpose: String?): Proxy? {
        val p = proxy
        return when (p.mode) {
            "direct" -> Proxy.NO_PROXY
            "custom" -> if (p.scope == "all" || purpose == "update") Proxy(Proxy.Type.HTTP, InetSocketAddress.createUnresolved(p.host, p.port)) else Proxy.NO_PROXY
            else -> null // 系统代理（ProxySelector）
        }
    }

    fun client(purpose: String? = null, follow: Boolean = true, timeoutMs: Long = 30_000, pin: String? = null): OkHttpClient {
        val b = base.newBuilder()
            .followRedirects(follow)
            .followSslRedirects(follow)
            .readTimeout(timeoutMs, TimeUnit.MILLISECONDS)
            .callTimeout(timeoutMs + 15_000, TimeUnit.MILLISECONDS)
        proxyFor(purpose)?.let { b.proxy(it) }
        if (!pin.isNullOrEmpty()) {
            val tm = PinTrustManager(pin)
            b.sslSocketFactory(pinnedFactory(tm), tm).hostnameVerifier { _, _ -> true }
        }
        return b.build()
    }

    /** 播放器用的客户端：跟随重定向，读超时长一些 */
    fun playerClient(): OkHttpClient = client("music", true, 45_000)

    fun cancel(id: String) {
        calls.remove(id)?.cancel()
    }

    /**
     * 发请求，返回 { status, statusText, url, headers, body(base64) }
     * args: url, method, headers, body, bodyType(text|base64), timeout, follow, maxBytes, purpose, pin, cancelId
     */
    fun request(args: JSONObject): JSONObject {
        val url = args.getString("url")
        val method = args.optString("method", "GET").uppercase()
        val timeout = args.optLong("timeout", 30_000).coerceIn(1_000, 180_000)
        val maxBytes = if (args.has("maxBytes") && !args.isNull("maxBytes")) args.optLong("maxBytes") else -1L
        val hb = Headers.Builder()
        var contentType: String? = null
        args.optJSONObject("headers")?.let { h ->
            for (k in h.keys()) {
                val v = h.optString(k)
                if (k.equals("content-type", true)) contentType = v
                // 有的接口头里带中文：OkHttp 默认会拒绝，这里原样放行
                try { hb.addUnsafeNonAscii(k, v) } catch (_: Exception) {}
            }
        }
        val body = if (args.has("body") && !args.isNull("body")) {
            val raw = args.getString("body")
            val bytes = if (args.optString("bodyType") == "base64") Base64.decode(raw, Base64.DEFAULT) else raw.toByteArray()
            bytes.toRequestBody(contentType?.toMediaTypeOrNull())
        } else if (method == "POST" || method == "PUT" || method == "PATCH") ByteArray(0).toRequestBody(null) else null
        val req = Request.Builder().url(url).headers(hb.build()).method(method, body).build()
        val c = client(args.optString("purpose", null), args.optBoolean("follow", true), timeout, args.optString("pin", null).takeIf { !it.isNullOrEmpty() })
        val call = c.newCall(req)
        val cancelId = args.optString("cancelId", "")
        if (cancelId.isNotEmpty()) calls[cancelId] = call
        try {
            call.execute().use { resp ->
                val out = ByteArrayOutputStream()
                resp.body?.byteStream()?.use { input ->
                    val buf = ByteArray(16 * 1024)
                    val limit = if (maxBytes > 0) maxBytes else 96L * 1024 * 1024
                    while (out.size() < limit) {
                        val n = input.read(buf, 0, minOf(buf.size.toLong(), limit - out.size()).toInt())
                        if (n < 0) break
                        out.write(buf, 0, n)
                    }
                }
                var bytes = out.toByteArray()
                // 服务器主动压缩（请求头里自己写了 Accept-Encoding 时 OkHttp 不会自动解）
                val enc = resp.header("Content-Encoding")?.lowercase()
                if (maxBytes <= 0 && bytes.size > 2) {
                    try {
                        if (enc == "gzip" && bytes[0] == 0x1f.toByte() && bytes[1] == 0x8b.toByte()) bytes = GZIPInputStream(bytes.inputStream()).readBytes()
                        else if (enc == "deflate") bytes = InflaterInputStream(bytes.inputStream()).readBytes()
                    } catch (_: Exception) {}
                }
                val headers = JSONObject()
                for (name in resp.headers.names()) headers.put(name.lowercase(), resp.headers(name).joinToString(", "))
                return JSONObject()
                    .put("status", resp.code)
                    .put("statusText", resp.message)
                    .put("url", resp.request.url.toString())
                    .put("headers", headers)
                    .put("body", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
        } finally {
            if (cancelId.isNotEmpty()) calls.remove(cancelId)
        }
    }

    // ---------------- 同步服务器的证书固定 ----------------
    fun fingerprint(cert: X509Certificate): String =
        Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(cert.encoded), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    class PinTrustManager(private val fp: String) : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = throw CertificateException("not supported")
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            val leaf = chain?.firstOrNull() ?: throw CertificateException("没有证书")
            if (fingerprint(leaf) != fp) throw CertificateException("服务器证书和配对码里的指纹对不上")
        }
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }

    private fun pinnedFactory(tm: X509TrustManager): SSLSocketFactory =
        SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), null) }.socketFactory

    /** 只做 TLS 握手读出证书（不发送任何数据），核对指纹，返回 PEM */
    fun fetchPinnedCert(url: String, fp: String): String {
        var got: X509Certificate? = null
        val tm = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) { got = chain?.firstOrNull() }
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        val u = URL(url)
        val port = if (u.port > 0) u.port else 443
        val px = proxyFor("sync")
        val sock = if (px != null && px != Proxy.NO_PROXY) java.net.Socket(px) else java.net.Socket()
        sock.connect(InetSocketAddress(u.host, port), 12_000)
        sock.soTimeout = 12_000
        sock.use { raw ->
            val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), null) }.socketFactory
                .createSocket(raw, u.host, port, true) as javax.net.ssl.SSLSocket
            ssl.use { it.startHandshake() }
        }
        val cert = got ?: throw IllegalStateException("没有读到服务器证书")
        if (fingerprint(cert) != fp) throw IllegalStateException("服务器证书和配对码里的指纹对不上（地址填错了，或者连接被拦截）")
        val b64 = Base64.encodeToString(cert.encoded, Base64.NO_WRAP).chunked(64).joinToString("\n")
        return "-----BEGIN CERTIFICATE-----\n$b64\n-----END CERTIFICATE-----\n"
    }

}
