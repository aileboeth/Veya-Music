// 手机版用不到的 Node 模块（被替换掉的电脑版模块里才用到）：给个空壳，防止打包失败
const noop = () => {}
const fail = () => { throw new Error('手机版不支持这个操作') }

// tunnel：代理由原生层处理
export const httpOverHttp = () => undefined
export const httpsOverHttp = () => undefined

// dns
export const lookup = (_host: string, _opts: any, cb: any) => (typeof _opts == 'function' ? _opts : cb)?.(new Error('dns 不可用'))

// http / https / net / tls
export const request = fail
export const get = fail
export const connect = fail
export const createServer = fail
export class Agent { constructor(_o?: any) {} destroy() {} }
export const checkServerIdentity = noop

// electron-updater
export const autoUpdater = { on: noop, checkForUpdates: fail, quitAndInstall: fail }

export default { httpOverHttp, httpsOverHttp, lookup, request, get, connect, createServer, Agent, checkServerIdentity, autoUpdater }
