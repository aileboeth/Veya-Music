package com.aileboeth.veyamusic

import android.app.Application
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executors

class VeyaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: VeyaApp
            private set
        val main = Handler(Looper.getMainLooper())
        /** 网络请求、下载、文件操作都在这里跑 */
        val io = Executors.newCachedThreadPool { r -> Thread(r, "veya-io").apply { isDaemon = true } }
    }
}
