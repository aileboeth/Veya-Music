// Veya Music：播放链接由「音源脚本」(src/main/userApi.ts) 负责，这里不提供内置接口
const apis = source => {
  throw new Error('Api is not found: ' + source)
}
const supportQuality = {}

export { apis, supportQuality }
