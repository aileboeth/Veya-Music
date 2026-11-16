// 手机版的「audio 元素」：接口和 HTMLAudioElement 一样（播放器代码不用改），实际由原生的 ExoPlayer 播放，
// 这样切到后台、锁屏后也能继续播放，通知栏 / 耳机按键也能控制
// 原生层通过 window.__veyaNativePlayer 提供：cmd(操作, 参数) 和 on(事件回调)

interface Bridge { cmd(op: string, data?: any): void, on(fn: (e: any) => void): void }

export class NativeAudio extends EventTarget {
  preload = 'auto'
  crossOrigin: string | null = null
  error: { code: number, message: string } | null = null
  private bridge: Bridge
  private _src = ''
  private _paused = true
  private _volume = 1
  private _dur = NaN
  private pos = 0
  private posAt = 0
  private rate = 1
  private buffering = false
  private loadId = 0
  private seq = 0
  private playWaiters: Array<{ resolve: () => void, reject: (e: any) => void }> = []

  constructor(bridge: Bridge) {
    super()
    this.bridge = bridge
    bridge.on(e => this.onNative(e))
  }

  private fire(type: string) { this.dispatchEvent(new Event(type)) }

  private onNative(e: any) {
    if (!e) return
    if (e.type == 'advanced') {
      // 原生层已经接着放预加载的下一首
      this.loadId = e.loadId
      this._src = e.url ?? this._src
      this._dur = NaN
      this.pos = 0
      this.posAt = performance.now()
      this.error = null
      this.dispatchEvent(new CustomEvent('advanced', { detail: e }))
      return
    }
    if (e.loadId != null && e.loadId != this.loadId) return
    if (typeof e.pos == 'number') {
      this.pos = e.pos
      this.posAt = performance.now()
    }
    if (typeof e.dur == 'number' && e.dur > 0 && e.dur != this._dur) {
      const first = !Number.isFinite(this._dur)
      this._dur = e.dur
      if (first) this.fire('loadedmetadata')
      this.fire('durationchange')
    }
    switch (e.type) {
      case 'pos':
        this.fire('timeupdate')
        break
      case 'ready':
        this.fire('canplay')
        break
      case 'buffering':
        this.buffering = !!e.value
        if (this.buffering) this.fire('waiting')
        else this.fire('canplay')
        break
      case 'playing':
        if (e.value) {
          this._paused = false
          this.buffering = false
          this.fire('playing')
          for (const w of this.playWaiters.splice(0)) w.resolve()
        } else if (!this._paused) {
          this._paused = true
          this.fire('pause')
        }
        break
      case 'ended':
        this._paused = true
        this.fire('pause')
        this.fire('ended')
        break
      case 'error':
        this.error = { code: 4, message: String(e.message ?? '播放出错') }
        this._paused = true
        for (const w of this.playWaiters.splice(0)) w.reject(Object.assign(new Error(this.error.message), { name: 'NotSupportedError' }))
        this.fire('error')
        break
    }
  }

  get src() { return this._src }
  set src(url: string) {
    this._src = url ?? ''
    this.error = null
    this._dur = NaN
    this.pos = 0
    this.posAt = performance.now()
    this._paused = true
    this.loadId = ++this.seq
    if (!this._src) {
      this.bridge.cmd('stop')
      return
    }
    this.bridge.cmd('load', { url: this._src, loadId: this.loadId })
  }
  removeAttribute(name: string) {
    if (name == 'src') {
      this._src = ''
      this.loadId = ++this.seq
      this._paused = true
      this.bridge.cmd('stop')
    }
  }

  get paused() { return this._paused }
  get duration() { return this._dur }
  get currentTime() {
    if (this._paused || this.buffering) return this.pos
    return this.pos + (performance.now() - this.posAt) / 1000 * this.rate
  }
  set currentTime(t: number) {
    this.pos = Math.max(0, t)
    this.posAt = performance.now()
    if (this._src) this.bridge.cmd('seek', { pos: this.pos })
  }

  get volume() { return this._volume }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v))
    this.bridge.cmd('volume', { value: this._volume })
  }

  play() {
    if (!this._src) return Promise.reject(Object.assign(new Error('没有音频'), { name: 'NotSupportedError' }))
    this.fire('play')
    this.bridge.cmd('play')
    if (!this._paused) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      this.playWaiters.push({ resolve, reject })
      // 很少见：原生层一直没回报（比如链接一直在缓冲）——不要让调用方永远等着
      setTimeout(() => {
        const i = this.playWaiters.findIndex(w => w.resolve == resolve)
        if (i > -1) {
          this.playWaiters.splice(i, 1)
          resolve()
        }
      }, 20_000)
    })
  }
  pause() {
    this.bridge.cmd('pause')
    if (!this._paused) {
      this._paused = true
      this.fire('pause')
    }
  }

  /** 预加载下一首（放完当前这首时原生层直接接上，不依赖页面在后台被限速的定时器） */
  setNext(next: { url: string, id: string, meta: any } | null) {
    this.bridge.cmd('next', next ? { ...next, loadId: ++this.seq } : null)
  }
  /** 通知栏 / 锁屏上显示的歌曲信息 */
  setMeta(meta: { title: string, artist: string, album?: string, artwork?: string }) {
    this.bridge.cmd('meta', meta)
  }
}
