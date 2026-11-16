package com.aileboeth.veyamusic

import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** 同步服务器的实时通道（OkHttp WebSocket，自签名证书按指纹固定） */
object WsHub {
    private val sockets = ConcurrentHashMap<String, WebSocket>()

    private fun event(id: String, type: String, block: JSONObject.() -> Unit = {}) {
        WebHost.emit("ws", JSONObject().put("id", id).put("type", type).apply(block))
    }

    fun open(id: String, url: String, pin: String) {
        val client = Net.client("sync", false, 60_000, pin.ifEmpty { null }).newBuilder()
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .build()
        val ws = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) = event(id, "open")
            override fun onMessage(webSocket: WebSocket, text: String) = event(id, "message") { put("data", text) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                sockets.remove(id)
                event(id, "close") { put("reason", "连接断开（$code）") }
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                sockets.remove(id)
                event(id, "close") { put("reason", t.message ?: "连接失败") }
            }
        })
        sockets[id] = ws
    }

    fun send(id: String, text: String): Boolean = sockets[id]?.send(text) == true

    fun close(id: String) {
        sockets.remove(id)?.close(1000, null)
    }
}
