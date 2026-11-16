// 运行平台：电脑版（Electron）/ 手机版（安卓宿主在页面加载前注入 window.veyaPlatform = 'android'）
export const platform: 'desktop' | 'android' = (window as any).veyaPlatform == 'android' ? 'android' : 'desktop'
export const isAndroid = platform == 'android'
