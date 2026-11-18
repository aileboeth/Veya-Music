<script setup lang="ts">
// 关于：作者、开源地址和协议、致谢、免责声明（电脑版和手机版共用）
import { onMounted, ref } from 'vue'
import { api } from '../api'
import logo from '../assets/logo.svg'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import { showDisclaimer } from '../disclaimer'
import { isAndroid } from '../platform'
import { showChangelog } from '../update'

defineProps<{ params: Record<string, any> }>()

const REPO = 'https://github.com/aileboeth/Veya-Music'
const appInfo = ref<any>({})
onMounted(async() => { appInfo.value = await api('app.info') })
const open = (url: string) => void api('app.open', url)

const thanks = [
  { name: 'lx-music-desktop', url: 'https://github.com/lyswhut/lx-music-desktop', desc: '各平台的搜索、歌单、榜单、歌词接口（musicSdk）和自定义音源脚本接口，Apache-2.0' },
  { name: '音源脚本的作者们', url: `${REPO}/blob/main/sources/README.md`, desc: '播放链接全部来自你导入的第三方音源脚本，版权归各自的作者所有' },
]
const libs = isAndroid
  ? 'Vue 3 · AndroidX Media3（ExoPlayer）· OkHttp · ZXing · crypto-js · pako · qrcode-generator'
  : 'Electron · Vue 3 · electron-updater · needle · ws · crypto-js · qrcode-generator'
</script>

<template>
  <Page>
    <div class="hero">
      <img :src="logo" class="logo" alt="" />
      <h1>Veya Music</h1>
      <p class="ver">版本 {{ appInfo.version }}{{ isAndroid ? ' · 安卓版' : ' · Windows 版' }}</p>
      <p class="slogan">听见你的喜欢</p>
    </div>

    <div class="group">
      <button class="row" @click="open('https://github.com/aileboeth')">
        <span class="k">作者</span><span class="v">aile（GitHub @aileboeth）</span><Icon name="forward" :size="16" />
      </button>
      <button class="row" @click="open(REPO)">
        <span class="k">开源地址</span><span class="v">github.com/aileboeth/Veya-Music</span><Icon name="forward" :size="16" />
      </button>
      <button class="row" @click="open(`${REPO}/blob/main/LICENSE`)">
        <span class="k">开源协议</span><span class="v">Apache License 2.0，免费使用，可以自由修改和分发</span><Icon name="forward" :size="16" />
      </button>
      <button class="row" @click="open(`${REPO}/issues`)">
        <span class="k">问题反馈</span><span class="v">在 GitHub Issues 提交问题或建议</span><Icon name="forward" :size="16" />
      </button>
    </div>

    <div class="group">
      <button class="row" @click="showDisclaimer">
        <span class="k">免责声明</span><span class="v">仅供学习交流，音乐接口和音源均来自网络</span><Icon name="forward" :size="16" />
      </button>
      <button class="row" @click="showChangelog">
        <span class="k">更新日志</span><span class="v">每个版本改了什么</span><Icon name="forward" :size="16" />
      </button>
    </div>

    <h2>致谢</h2>
    <div class="group">
      <button v-for="t in thanks" :key="t.name" class="row tall" @click="open(t.url)">
        <span class="t"><b>{{ t.name }}</b><small>{{ t.desc }}</small></span><Icon name="forward" :size="16" />
      </button>
      <div class="row tall static">
        <span class="t"><b>开源组件</b><small>{{ libs }}</small></span>
      </div>
    </div>

    <p v-if="appInfo.dataDir && !isAndroid" class="foot path">数据保存在：{{ appInfo.dataDir }}</p>
    <p class="foot">© 2026 aile · Apache-2.0</p>
  </Page>
</template>

<style scoped>
.hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 26px 0 22px; }
.logo { width: 84px; height: 84px; border-radius: 22px; box-shadow: 0 10px 30px rgba(40, 80, 200, 0.22); }
.hero h1 { margin: 16px 0 4px; font-size: 24px; letter-spacing: .3px; }
.ver { margin: 0; color: var(--text2); font-size: 13px; }
.slogan { margin: 8px 0 0; font-size: 13px; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: 600; }
h2 { font-size: 15px; margin: 22px 4px 10px; color: var(--text2); font-weight: 600; }
.group { max-width: 640px; margin: 0 auto 14px; border-radius: 16px; background: var(--card); border: 1px solid var(--border); overflow: hidden; }
h2 { max-width: 640px; margin-left: auto; margin-right: auto; }
.row { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 52px; padding: 10px 16px; text-align: left; color: var(--text3); }
.row + .row { border-top: 1px solid var(--border); }
.row:not(.static):hover { background: var(--hover); }
.row:not(.static):active { background: var(--active); }
.k { flex: none; width: 72px; font-weight: 600; color: var(--text); }
.v { flex: 1; min-width: 0; font-size: 13px; color: var(--text2); }
.row.tall { padding: 12px 16px; }
.t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.t b { font-weight: 600; color: var(--text); }
.t small { font-size: 12px; color: var(--text3); line-height: 1.6; }
.foot { max-width: 640px; margin: 14px auto 0; text-align: center; font-size: 12px; color: var(--text3); }
.foot.path { user-select: text; word-break: break-all; }
:root.mobile .hero { padding-top: 14px; }
:root.mobile .k { width: 64px; }
</style>
