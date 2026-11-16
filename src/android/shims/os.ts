import { nativeInfo } from '../native'

export const hostname = () => [nativeInfo.brand, nativeInfo.model].filter(Boolean).join(' ') || '手机'
export const platform = () => 'android'
export const homedir = () => '/'
export const tmpdir = () => '/tmp'
export const EOL = '\n'
export default { hostname, platform, homedir, tmpdir, EOL }
