// 接口与 lx-music-desktop 的 renderer/utils/request.js 保持一致，供 musicSdk 使用
import needle from 'needle'
import { httpOverHttp, httpsOverHttp } from 'tunnel'
import { requestMsg } from './message'

export const proxy = { host: '', port: '' }

const httpsRxp = /^https:/
const getRequestAgent = url => {
  if (!proxy.host) return undefined
  return (httpsRxp.test(url) ? httpsOverHttp : httpOverHttp)({ proxy: { host: proxy.host, port: proxy.port } })
}

const request = (url, options, callback) => {
  let data
  if (options.body) {
    data = options.body
  } else if (options.form) {
    data = options.form
    options.json = false
  } else if (options.formData) {
    data = options.formData
    options.json = false
  }
  options.response_timeout = options.timeout
  // 代理只听应用里的设置，不受 HTTP(S)_PROXY 环境变量影响
  options.use_proxy_from_env_var = false

  return needle.request(options.method || 'get', url, data, options, (err, resp, body) => {
    if (!err) {
      body = resp.body = resp.raw.toString()
      try {
        resp.body = JSON.parse(resp.body)
      } catch (_) {}
      body = resp.body
    }
    callback(err, resp, body)
  }).request
}

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
}

const fetchData = async(url, method, { headers = {}, format = 'json', timeout = 15000, ...options }, callback) => {
  return request(url, {
    ...options,
    method,
    headers: Object.assign({}, defaultHeaders, headers),
    timeout,
    agent: getRequestAgent(url),
    json: format === 'json',
  }, (err, resp, body) => {
    if (err) return callback(err, null)
    callback(null, resp, body)
  })
}

export const cancelHttp = requestObj => {
  if (!requestObj) return
  if (!requestObj.abort) return
  requestObj.abort()
}

const buildHttpPromose = (url, options) => {
  const obj = {
    isCancelled: false,
    cancelHttp: () => {
      if (!obj.requestObj) return obj.isCancelled = true
      cancelHttp(obj.requestObj)
      obj.requestObj = null
      obj.promise = obj.cancelHttp = null
      obj.cancelFn(new Error(requestMsg.cancelRequest))
      obj.cancelFn = null
    },
  }
  obj.promise = new Promise((resolve, reject) => {
    obj.cancelFn = reject
    fetchData(url, options.method, options, (err, resp) => {
      obj.requestObj = null
      obj.cancelFn = null
      if (err) return reject(err)
      resolve(resp)
    }).then(ro => {
      obj.requestObj = ro
      if (obj.isCancelled) obj.cancelHttp()
    })
  })
  return obj
}

export const httpFetch = (url, options = { method: 'get' }) => {
  const requestObj = buildHttpPromose(url, options)
  requestObj.promise = requestObj.promise.catch(err => {
    if (err.message === 'socket hang up') return Promise.reject(new Error(requestMsg.unachievable))
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
        return Promise.reject(new Error(requestMsg.timeout))
      case 'ENOTFOUND':
        return Promise.reject(new Error(requestMsg.notConnectNetwork))
      default:
        return Promise.reject(err)
    }
  })
  return requestObj
}

export const http = (url, options, cb) => {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }
  if (options.method == null) options.method = 'get'
  return fetchData(url, options.method, options, (err, resp, body) => cb(err, resp, body))
}

export const httpGet = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  return fetchData(url, 'get', options, (err, resp, body) => callback(err, resp, body))
}

export const httpPost = (url, data, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options.data = data
  return fetchData(url, 'post', options, (err, resp, body) => callback(err, resp, body))
}

export const http_jsonp = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  const jsonpCallback = 'jsonpCallback'
  if (url.indexOf('?') < 0) url += '?'
  url += `&${options.jsonpCallback}=${jsonpCallback}`
  options.format = 'script'
  return fetchData(url, 'get', options, (err, resp, body) => {
    if (!err) body = JSON.parse(body.replace(new RegExp(`^${jsonpCallback}\\(({.*})\\)$`), '$1'))
    callback(err, resp, body)
  })
}

export const checkUrl = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    fetchData(url, 'head', options, (err, resp) => {
      if (err) return reject(err)
      if (resp.statusCode === 200) resolve()
      else reject(new Error(resp.statusCode))
    })
  })
}
