// 手机版页面入口：先补 Node 全局变量 → 启动「主进程」逻辑（window.veya）→ 再加载和电脑版同一套界面
import './globals'
import './host'
import '../renderer/src/main'