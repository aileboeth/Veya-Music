// 从内置更新日志生成这一版的 GitHub Release 说明：dist\release-notes.md
// 发布时把它的内容粘贴到 Release 的描述里，客户端在「重启更新」前会显示这段文字
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const { version } = require(path.join(root, 'package.json'))
const log = require(path.join(root, 'src/renderer/src/changelog.json'))
const entry = log.find(c => c.version == version)
if (!entry) {
  console.error(`changelog.json 里没有 ${version} 的条目，请先补上再打包`)
  process.exit(1)
}
const file = path.join(root, 'dist', 'release-notes.md')
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, entry.items.map(i => `- ${i}`).join('\n') + '\n')
console.log(`release notes -> ${file}`)
