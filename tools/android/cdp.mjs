// 在手机上的 Veya Music（调试版）WebView 里执行 JS：node tools/android/cdp.mjs "表达式"
// 需要：手机上运行 devfwd（把 127.0.0.1:9222 转到 WebView 调试套接字）+ 本机 ssh -L 9222:127.0.0.1:9222 phone
import fs from 'node:fs'
const args = process.argv.slice(2)
// -f 文件：表达式从文件读（脚本内容太长放不进命令行）
const expr = args[0] == '-f' ? fs.readFileSync(args[1], 'utf8') : (args.join(' ') || 'document.title')
const list = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = list.find(p => p.type == 'page' && /appassets/.test(p.url)) ?? list.find(p => p.type == 'page')
if (!page) { console.error('no page', list); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
const send = (method, params) => new Promise(resolve => {
  const id = Math.floor(Math.random() * 1e9)
  const onMsg = ev => { const m = JSON.parse(ev.data); if (m.id == id) { ws.removeEventListener('message', onMsg); resolve(m) } }
  ws.addEventListener('message', onMsg)
  ws.send(JSON.stringify({ id, method, params }))
})
const r = await send('Runtime.evaluate', { expression: `(async () => { ${/^\s*(return|const|let|await|for|if)\b/.test(expr) || expr.includes(';') ? expr : 'return (' + expr + ')'} })()`, awaitPromise: true, returnByValue: true, timeout: 120000 })
if (r.result?.exceptionDetails) console.log('EXCEPTION', JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
else console.log(typeof r.result?.result?.value == 'string' ? r.result.result.value : JSON.stringify(r.result?.result?.value, null, 1))
ws.close()