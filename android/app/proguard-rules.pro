# 页面通过 addJavascriptInterface 调用这些方法：混淆后名字变了页面就找不到
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}