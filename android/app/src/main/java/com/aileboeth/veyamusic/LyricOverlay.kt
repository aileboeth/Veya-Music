package com.aileboeth.veyamusic

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * 悬浮歌词：浮在其他应用上面的一条歌词。
 * 点一下显示控制条（上一首 / 播放暂停 / 下一首 / 锁定 / 关闭），上下拖动换位置；锁定后点击会穿透到下面的应用。
 * 当前这句按逐字时间（或整句时长）从左到右点亮。
 */
@SuppressLint("StaticFieldLeak")
object LyricOverlay {
    private var view: LyricView? = null
    private var params: WindowManager.LayoutParams? = null
    private var conf = JSONObject()
    private val wm get() = VeyaApp.instance.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    fun isShown() = view != null

    fun show(c: JSONObject): JSONObject {
        conf = c
        val ctx = VeyaApp.instance
        if (!Settings.canDrawOverlays(ctx)) {
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { ctx.startActivity(intent) } catch (_: Exception) {}
            return JSONObject().put("shown", false).put("needPermission", true)
        }
        if (view == null) {
            val v = LyricView(ctx)
            val dm = ctx.resources.displayMetrics
            val p = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT,
            )
            p.gravity = Gravity.TOP or Gravity.START
            p.y = if (c.has("y") && !c.isNull("y")) c.optInt("y").coerceIn(0, dm.heightPixels - 100) else (dm.heightPixels * 0.62).toInt()
            params = p
            view = v
            applyConf()
            wm.addView(v, p)
            val cur = PlayerHub.lines.getOrNull(PlayerHub.lineIndex)
            v.setLine(cur, PlayerHub.lines.getOrNull(PlayerHub.lineIndex + 1))
            v.playing = PlayerHub.isPlaying()
            v.invalidate()
        } else applyConf()
        return JSONObject().put("shown", true)
    }

    fun hide() {
        view?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        view = null
        params = null
    }

    fun setConf(c: JSONObject) {
        conf = c
        applyConf()
    }

    private fun applyConf() {
        val v = view ?: return
        val p = params ?: return
        v.applyConf(conf)
        val locked = conf.optBoolean("locked")
        p.flags = if (locked) p.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE else p.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        if (locked) v.controls = false
        try { wm.updateViewLayout(v, p) } catch (_: Exception) {}
    }

    fun place(where: String) {
        val p = params ?: return
        val h = VeyaApp.instance.resources.displayMetrics.heightPixels
        p.y = when (where) { "top" -> (h * 0.08).toInt(); "middle" -> (h * 0.42).toInt(); else -> (h * 0.72).toInt() }
        view?.let { try { wm.updateViewLayout(it, p) } catch (_: Exception) {} }
        WebHost.emit("overlay", JSONObject().put("type", "moved").put("y", p.y))
    }

    fun setLine(cur: PlayerHub.Line?, next: PlayerHub.Line?) {
        view?.setLine(cur, next)
    }

    fun setTitle(title: String) {
        view?.title = title
        view?.invalidate()
    }

    fun onPlaying(playing: Boolean) {
        view?.let {
            it.playing = playing
            it.invalidate()
        }
    }

    private fun moveBy(dy: Float) {
        val p = params ?: return
        val v = view ?: return
        p.y = (p.y + dy).toInt().coerceIn(0, VeyaApp.instance.resources.displayMetrics.heightPixels - v.height)
        try { wm.updateViewLayout(v, p) } catch (_: Exception) {}
    }

    private fun command(cmd: String) {
        when (cmd) {
            "close" -> {
                hide()
                WebHost.emit("overlay", JSONObject().put("type", "closed"))
            }
            "lock" -> {
                conf.put("locked", true)
                applyConf()
                WebHost.emit("overlay", JSONObject().put("type", "lock").put("locked", true))
            }
            else -> WebHost.emit("overlay", JSONObject().put("type", "command").put("cmd", cmd))
        }
    }

    private class LyricView(ctx: Context) : View(ctx) {
        private val dm = ctx.resources.displayMetrics
        private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, dm)
        private fun sp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, dm)

        private var cur: PlayerHub.Line? = null
        private var next: PlayerHub.Line? = null
        var title = ""
        var playing = false
        var controls = false
        private var colors = intArrayOf(0xFF12F1E4.toInt(), 0xFF2A62FF.toInt(), 0xFFA23BF6.toInt())
        private var fontSize = 22f
        private var effect = "fill"

        private val base = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = 150; setShadowLayer(dp(2f), 0f, dp(1f), 0x99000000.toInt()) }
        private val lit = Paint(Paint.ANTI_ALIAS_FLAG)
        private val small = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; alpha = 200; setShadowLayer(dp(2f), 0f, dp(1f), 0x99000000.toInt()) }
        private val panel = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x99101420.toInt() }
        private val icon = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.STROKE; strokeWidth = dp(2f); strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
        private val iconFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
        private val buttons = mutableListOf<Pair<RectF, String>>()

        fun applyConf(c: JSONObject) {
            fontSize = c.optDouble("fontSize", 22.0).toFloat().coerceIn(14f, 40f)
            effect = c.optString("effect", "fill")
            colors = when (c.optString("color", "aurora")) {
                "white" -> intArrayOf(Color.WHITE, Color.WHITE)
                "gold" -> intArrayOf(0xFFFFE08A.toInt(), 0xFFFFB03B.toInt())
                "pink" -> intArrayOf(0xFFFFB3D1.toInt(), 0xFFFF5FA2.toInt())
                else -> intArrayOf(0xFF12F1E4.toInt(), 0xFF18B6FF.toInt(), 0xFF2A62FF.toInt(), 0xFFA23BF6.toInt())
            }
            requestLayout()
            invalidate()
        }

        fun setLine(c: PlayerHub.Line?, n: PlayerHub.Line?) {
            cur = c
            next = n
            invalidate()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val w = MeasureSpec.getSize(widthMeasureSpec)
            val h = sp(fontSize) * 1.5f + sp(fontSize * 0.62f) * 1.6f + dp(14f) + (if (controls) dp(50f) else 0f)
            setMeasuredDimension(w, h.toInt())
        }

        private fun progress(line: PlayerHub.Line, text: String, width: Float): Float {
            if (effect == "none") return width
            val t = PlayerHub.positionSec() - line.t
            val words = line.words
            if (words != null && words.isNotEmpty() && words.joinToString("") { it.third } == text) {
                var x = 0f
                for ((st, du, s) in words) {
                    val ww = lit.measureText(s)
                    when {
                        t >= st + du -> x += ww
                        t > st -> { x += ww * ((t - st) / max(0.05, du)).toFloat(); return x }
                        else -> return x
                    }
                }
                return x
            }
            return (width * (t / max(0.3, line.d)).coerceIn(0.0, 1.0)).toFloat()
        }

        override fun onDraw(canvas: Canvas) {
            val w = width.toFloat()
            val pad = dp(16f)
            if (controls) canvas.drawRoundRect(RectF(dp(8f), 0f, w - dp(8f), height.toFloat()), dp(16f), dp(16f), panel)
            val line = cur
            val text = line?.text?.takeIf { it.isNotBlank() } ?: title.ifBlank { "Veya Music" }
            var size = sp(fontSize)
            base.textSize = size
            val avail = w - pad * 2
            val tw0 = base.measureText(text)
            if (tw0 > avail) size *= max(0.6f, avail / tw0)
            base.textSize = size
            lit.textSize = size
            val tw = base.measureText(text)
            val x = (w - tw) / 2
            val y = dp(6f) + size * 1.15f
            canvas.drawText(text, x, y, base)
            if (line != null) {
                val pw = progress(line, text, tw)
                lit.shader = LinearGradient(x, 0f, x + tw, 0f, colors, null, Shader.TileMode.CLAMP)
                canvas.save()
                canvas.clipRect(x, 0f, x + pw, y + size * 0.4f)
                canvas.drawText(text, x, y, lit)
                canvas.restore()
            }
            val sub = line?.trans?.takeIf { it.isNotBlank() } ?: next?.text ?: ""
            if (sub.isNotBlank()) {
                small.textSize = sp(fontSize * 0.62f)
                val sw = small.measureText(sub)
                val s2 = if (sw > avail) sub.take(max(1, (sub.length * avail / sw).toInt() - 1)) + "…" else sub
                canvas.drawText(s2, (w - small.measureText(s2)) / 2, y + sp(fontSize * 0.62f) * 1.5f, small)
            }
            buttons.clear()
            if (controls) drawControls(canvas, w, height - dp(26f))
            if (playing && line != null && effect != "none") postInvalidateOnAnimation()
        }

        private fun drawControls(c: Canvas, w: Float, cy: Float) {
            val names = listOf("lock", "prev", "toggle", "next", "close")
            val gap = min(dp(64f), (w - dp(40f)) / names.size)
            val start = (w - gap * (names.size - 1)) / 2
            val r = dp(9f)
            names.forEachIndexed { i, n ->
                val cx = start + gap * i
                buttons += RectF(cx - gap / 2, cy - dp(22f), cx + gap / 2, cy + dp(22f)) to n
                val p = Path()
                when (n) {
                    "prev" -> { p.moveTo(cx + r * 0.6f, cy - r); p.lineTo(cx - r * 0.5f, cy); p.lineTo(cx + r * 0.6f, cy + r); p.close(); c.drawPath(p, iconFill); c.drawLine(cx - r * 0.8f, cy - r, cx - r * 0.8f, cy + r, icon) }
                    "next" -> { p.moveTo(cx - r * 0.6f, cy - r); p.lineTo(cx + r * 0.5f, cy); p.lineTo(cx - r * 0.6f, cy + r); p.close(); c.drawPath(p, iconFill); c.drawLine(cx + r * 0.8f, cy - r, cx + r * 0.8f, cy + r, icon) }
                    "toggle" -> if (playing) {
                        c.drawRoundRect(RectF(cx - r * 0.8f, cy - r, cx - r * 0.2f, cy + r), dp(1.5f), dp(1.5f), iconFill)
                        c.drawRoundRect(RectF(cx + r * 0.2f, cy - r, cx + r * 0.8f, cy + r), dp(1.5f), dp(1.5f), iconFill)
                    } else { p.moveTo(cx - r * 0.6f, cy - r * 1.1f); p.lineTo(cx + r, cy); p.lineTo(cx - r * 0.6f, cy + r * 1.1f); p.close(); c.drawPath(p, iconFill) }
                    "lock" -> { c.drawRoundRect(RectF(cx - r * 0.8f, cy - r * 0.15f, cx + r * 0.8f, cy + r), dp(2f), dp(2f), icon); c.drawArc(RectF(cx - r * 0.5f, cy - r, cx + r * 0.5f, cy + r * 0.1f), 180f, 180f, false, icon) }
                    "close" -> { c.drawLine(cx - r * 0.7f, cy - r * 0.7f, cx + r * 0.7f, cy + r * 0.7f, icon); c.drawLine(cx + r * 0.7f, cy - r * 0.7f, cx - r * 0.7f, cy + r * 0.7f, icon) }
                }
            }
        }

        private var downY = 0f
        private var lastY = 0f
        private var moved = false

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downY = e.rawY; lastY = e.rawY; moved = false }
                MotionEvent.ACTION_MOVE -> {
                    if (abs(e.rawY - downY) > dp(6f)) moved = true
                    if (moved) {
                        moveBy(e.rawY - lastY)
                        lastY = e.rawY
                    }
                }
                MotionEvent.ACTION_UP -> {
                    if (moved) {
                        params?.let { WebHost.emit("overlay", JSONObject().put("type", "moved").put("y", it.y)) }
                    } else {
                        val hit = buttons.firstOrNull { it.first.contains(e.x, e.y) }?.second
                        if (hit != null) command(hit)
                        else {
                            controls = !controls
                            requestLayout()
                            invalidate()
                        }
                    }
                }
            }
            return true
        }
    }
}
