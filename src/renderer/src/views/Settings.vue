<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api, on, QUALITYS, SOURCES } from '../api'
import Icon from '../components/Icon.vue'
import Page from '../components/Page.vue'
import { importLists } from '../lists'
import { player, toggleDesktopLyric } from '../player'
import { settings } from '../settings'
import { alertDialog, confirmDialog, toast } from '../ui'
import { checkUpdate, installUpdate, update, updateText } from '../update'

defineProps<{ params: Record<string, any> }>()

// ---------- 音源 ----------
const sources = ref<any[]>([])
let off: (() => void) | null = null
const appInfo = ref<any>({})
const lxExists = ref(false)
onMounted(async() => {
  sources.value = await api('source.list')
  off = on('sources:changed', (list: any[]) => { sources.value = list })
  appInfo.value = await api('app.info')
  lxExists.value = await api('lx.exists')
})
onBeforeUnmount(() => off?.())

const importResult = (r: { ok: string[], failed: string[] }) => {
  if (r.ok.length) toast(`已导入 ${r.ok.length} 个音源`, 'success')
  if (r.failed.length) void alertDialog('部分文件导入失败', r.failed.join('\n'))
}
const pickFiles = async() => importResult(await api('source.pick'))
const pickFolder = async() => importResult(await api('source.pickFolder'))
const move = (index: number, delta: number) => {
  const ids = sources.value.map(s => s.id)
  const j = index + delta
  if (j < 0 || j >= ids.length) return
  ;[ids[index], ids[j]] = [ids[j], ids[index]]
  void api('source.reorder', ids)
}
const removeSource = async(s: any) => {
  if (await confirmDialog(`移除音源「${s.name}」？`, '', { okText: '移除', danger: true })) void api('source.remove', s.id)
}
const test = async(s: any) => {
  toast(`正在测试「${s.name}」…`)
  try {
    await api('source.reload', s.id)
    const cur = (await api<any[]>('source.list')).find(x => x.id == s.id)
    if (cur?.status == 'ready') toast(`「${s.name}」初始化成功`, 'success')
    else toast(`「${s.name}」初始化失败：${cur?.message || '未知原因'}`, 'error')
  } catch (err: any) {
    toast(`测试失败：${err.message}`, 'error')
  }
}
const statusText: Record<string, string> = { ready: '运行中', loading: '加载中…', failed: '初始化失败', idle: '待命（需要时自动启动）', disabled: '已停用' }
const supportText = (s: any) => s.sources ? SOURCES.filter(x => s.sources[x.id]).map(x => x.name).join(' / ') : ''

// ---------- LX 迁移 ----------
const importing = ref(false)
const doImport = async(method: string) => {
  importing.value = true
  try {
    const data = await api<any[] | null>(method)
    if (!data) return
    const total = data.reduce((n, l) => n + l.songs.length, 0)
    if (!total) return void toast('没有找到可以导入的歌曲')
    const names = data.map(l => `· ${l.name}（${l.songs.length} 首）`).join('\n')
    if (!await confirmDialog(`导入 ${data.length} 个列表、共 ${total} 首歌曲？`, `${names}\n\n同名歌单会合并，重复的歌曲自动跳过。LX Music 里的数据不会被改动。`, { okText: '导入' })) return
    const r = importLists(data)
    toast(`导入完成：${r.listCount} 个列表，新增 ${r.songCount} 首歌曲`, 'success')
  } catch (err: any) {
    void alertDialog('导入失败', err.message)
  } finally {
    importing.value = false
  }
}

const chooseDir = async() => {
  const dir = await api<string | null>('dl.chooseDir')
  if (dir) settings.downloadDir = dir
}
const clearStats = async() => {
  if (!await confirmDialog('清除听歌记录？', '「最近播放」和推荐用到的口味数据都会被清空，推荐会从头开始学习。歌单不受影响。', { okText: '清除', danger: true })) return
  await api('stats.clear')
  toast('听歌记录已清除')
}
const setLyric = (patch: Record<string, any>) => void api('lyric.setConf', patch)
</script>

<template>
  <Page>
    <h1 class="page-title">设置</h1>

    <section>
      <h2>音源管理</h2>
      <p class="hint">Veya Music 兼容 LX Music 的自定义音源脚本（.js）。播放时按下面的顺序依次尝试；排在前面的失败了会自动换下一个，全部失败再自动换到其他平台的同一首歌。</p>
      <div class="row gap8" style="margin-bottom: 12px">
        <button class="btn primary" @click="pickFiles"><Icon name="plus" :size="16" />导入音源脚本</button>
        <button class="btn" @click="pickFolder"><Icon name="folder" :size="16" />导入整个文件夹</button>
      </div>
      <div v-if="!sources.length" class="empty-box">还没有音源。点击上方按钮，选择你保存的音源脚本文件。</div>
      <div v-for="(s, i) in sources" :key="s.id" class="source" :class="s.status">
        <span class="order">{{ i + 1 }}</span>
        <div class="s-info">
          <div class="s-name ellipsis">{{ s.name }} <small v-if="s.version" class="dim">{{ s.version }}</small><span v-if="i == 0 && s.enabled" class="badge q-320k">首选</span></div>
          <div class="s-sub ellipsis">
            <span class="st"><i />{{ statusText[s.status] ?? s.status }}</span>
            <span v-if="s.status == 'failed' && s.message" class="err" :title="s.message">{{ s.message }}</span>
            <span v-else-if="supportText(s)">支持：{{ supportText(s) }}</span>
            <span v-if="s.author">作者：{{ s.author }}</span>
          </div>
          <div v-if="s.updateAlert" class="s-update ellipsis" :title="s.updateAlert.log">脚本提示有更新：{{ s.updateAlert.log }}</div>
        </div>
        <button class="icon-btn" title="上移（优先使用）" :disabled="i == 0" @click="move(i, -1)"><Icon name="up" :size="16" /></button>
        <button class="icon-btn" title="下移" :disabled="i == sources.length - 1" @click="move(i, 1)"><Icon name="arrow-down" :size="16" /></button>
        <button class="icon-btn" title="重新加载并测试" :disabled="!s.enabled" @click="test(s)"><Icon name="refresh" :size="16" /></button>
        <button class="icon-btn" title="移除" @click="removeSource(s)"><Icon name="trash" :size="16" /></button>
        <button class="switch" :class="{ on: s.enabled }" :title="s.enabled ? '点击停用' : '点击启用'" @click="api('source.enable', s.id, !s.enabled)" />
      </div>
    </section>

    <section>
      <h2>播放</h2>
      <div class="item">
        <div><b>优先音质</b><span>音源不支持所选音质时自动降级</span></div>
        <div class="tabs"><button v-for="q in QUALITYS" :key="q.id" :class="{ on: settings.quality == q.id }" @click="settings.quality = q.id">{{ q.name }}</button></div>
      </div>
      <div class="item">
        <div><b>播完自动续播</b><span>「顺序播放」模式下，列表播完后自动接上风格相近的歌</span></div>
        <button class="switch" :class="{ on: settings.autoContinue }" @click="settings.autoContinue = !settings.autoContinue" />
      </div>
      <div class="item">
        <div><b>自动换源</b><span>一首歌在原平台放不了时，自动换到其他平台的同一首歌</span></div>
        <button class="switch" :class="{ on: settings.autoSwitchSource }" @click="settings.autoSwitchSource = !settings.autoSwitchSource" />
      </div>
      <div class="item">
        <div><b>显示歌词翻译</b><span>外语歌曲在原文下方显示中文翻译</span></div>
        <button class="switch" :class="{ on: settings.showTranslation }" @click="settings.showTranslation = !settings.showTranslation" />
      </div>
    </section>

    <section>
      <h2>外观</h2>
      <div class="item">
        <div><b>主题</b></div>
        <div class="tabs">
          <button :class="{ on: settings.theme == 'light' }" @click="settings.theme = 'light'">浅色</button>
          <button :class="{ on: settings.theme == 'dark' }" @click="settings.theme = 'dark'">深色</button>
          <button :class="{ on: settings.theme == 'system' }" @click="settings.theme = 'system'">跟随系统</button>
        </div>
      </div>
      <div class="item">
        <div><b>关闭窗口时</b><span>最小化到托盘后音乐继续播放，右键托盘图标可以退出</span></div>
        <div class="tabs">
          <button :class="{ on: settings.closeToTray }" @click="settings.closeToTray = true">最小化到托盘</button>
          <button :class="{ on: !settings.closeToTray }" @click="settings.closeToTray = false">直接退出</button>
        </div>
      </div>
    </section>

    <section>
      <h2>桌面歌词</h2>
      <div class="item">
        <div><b>显示桌面歌词</b><span>悬浮在所有窗口之上，可拖动和调整大小</span></div>
        <button class="switch" :class="{ on: player.lyricWindow }" @click="toggleDesktopLyric" />
      </div>
      <div class="item">
        <div><b>锁定位置</b><span>锁定后鼠标可以穿透歌词；把鼠标移到歌词上会出现解锁按钮</span></div>
        <button class="switch" :class="{ on: settings.desktopLyric.locked }" @click="setLyric({ locked: !settings.desktopLyric.locked })" />
      </div>
      <div class="item">
        <div><b>字号</b></div>
        <div class="row gap8">
          <button class="btn small" @click="setLyric({ fontSize: Math.max(18, (settings.desktopLyric.fontSize ?? 30) - 2) })">A-</button>
          <span class="num">{{ settings.desktopLyric.fontSize ?? 30 }}</span>
          <button class="btn small" @click="setLyric({ fontSize: Math.min(64, (settings.desktopLyric.fontSize ?? 30) + 2) })">A+</button>
        </div>
      </div>
      <div class="item">
        <div><b>配色</b></div>
        <div class="tabs">
          <button :class="{ on: (settings.desktopLyric.color ?? 'aurora') == 'aurora' }" @click="setLyric({ color: 'aurora' })">极光渐变</button>
          <button :class="{ on: settings.desktopLyric.color == 'white' }" @click="setLyric({ color: 'white' })">纯白</button>
          <button :class="{ on: settings.desktopLyric.color == 'gold' }" @click="setLyric({ color: 'gold' })">暖金</button>
          <button :class="{ on: settings.desktopLyric.color == 'pink' }" @click="setLyric({ color: 'pink' })">樱粉</button>
        </div>
      </div>
    </section>

    <section>
      <h2>下载</h2>
      <div class="item">
        <div><b>下载音质</b></div>
        <div class="tabs"><button v-for="q in QUALITYS" :key="q.id" :class="{ on: settings.downloadQuality == q.id }" @click="settings.downloadQuality = q.id">{{ q.name }}</button></div>
      </div>
      <div class="item">
        <div><b>保存位置</b><span class="path">{{ settings.downloadDir || '默认：音乐\\Veya Music' }}</span></div>
        <div class="row gap8">
          <button v-if="settings.downloadDir" class="btn small" @click="settings.downloadDir = ''">恢复默认</button>
          <button class="btn small" @click="chooseDir">更改</button>
        </div>
      </div>
      <div class="item">
        <div><b>同时保存歌词</b><span>在歌曲旁边保存同名 .lrc 文件</span></div>
        <button class="switch" :class="{ on: settings.downloadLyric }" @click="settings.downloadLyric = !settings.downloadLyric" />
      </div>
    </section>

    <section>
      <h2>数据</h2>
      <div class="item">
        <div><b>从 LX Music 迁移歌单</b><span>{{ lxExists ? '检测到本机安装过 LX Music，可以直接读取「我的列表」（只读，不会改动 LX 的数据）' : '没有检测到本机的 LX Music 数据，可以用 LX 导出的列表文件导入' }}</span></div>
        <div class="row gap8">
          <button v-if="lxExists" class="btn small primary" :disabled="importing" @click="doImport('lx.readDb')">一键迁移</button>
          <button class="btn small" :disabled="importing" @click="doImport('lx.readFile')">从文件导入</button>
        </div>
      </div>
      <div class="item">
        <div><b>清除听歌记录</b><span>清空「最近播放」和推荐使用的口味数据</span></div>
        <button class="btn small danger" @click="clearStats">清除</button>
      </div>
    </section>

    <section>
      <h2>关于与更新</h2>
      <div class="item">
        <div><b>当前版本 {{ appInfo.version }}</b><span :class="{ err: update.status == 'error' }">{{ updateText() || '新版本发布在 GitHub，下载完成后会提示你重启更新' }}</span></div>
        <div class="row gap8">
          <button v-if="update.status == 'downloaded'" class="btn small primary" @click="installUpdate">重启更新</button>
          <button v-else class="btn small" :disabled="['checking', 'available', 'downloading', 'unsupported'].includes(update.status)" @click="checkUpdate">检查更新</button>
        </div>
      </div>
      <div class="item">
        <div><b>自动检查更新</b><span>启动时和每隔几小时检查一次，有新版本自动在后台下载</span></div>
        <button class="switch" :class="{ on: settings.autoUpdate }" @click="settings.autoUpdate = !settings.autoUpdate" />
      </div>
      <p class="hint about">
        <b>Veya Music</b> {{ appInfo.version }} · <a @click="api('app.open', 'https://github.com/aileboeth/Veya-Music')">GitHub 主页</a><br>
        数据保存在：<span class="path">{{ appInfo.dataDir }}</span><br>
        各平台的搜索、歌单、榜单、歌词接口使用了开源项目
        <a @click="api('app.open', 'https://github.com/lyswhut/lx-music-desktop')">lx-music-desktop</a>（Apache-2.0）的 musicSdk，并兼容它的自定义音源脚本接口，感谢原作者。<br>
        本软件不提供任何音频内容，播放链接完全来自你自行导入的音源脚本。
      </p>
    </section>
  </Page>
</template>

<style scoped>
section { max-width: 860px; margin-bottom: 30px; }
h2 { font-size: 17px; margin: 0 0 12px; }
.hint { color: var(--text2); font-size: 13px; line-height: 1.75; margin: 0 0 14px; user-select: text; }
.item { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 58px; padding: 10px 16px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); margin-bottom: 8px; }
.item > div:first-child { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.item b { font-weight: 600; }
.item span { font-size: 12px; color: var(--text3); }
.path { user-select: text; word-break: break-all; }
.num { width: 28px; text-align: center; font-size: 14px !important; color: var(--text) !important; }
.empty-box { padding: 26px; border-radius: 12px; border: 1.500px dashed var(--border); color: var(--text3); text-align: center; }
.source { display: flex; align-items: center; gap: 6px; padding: 10px 14px 10px 10px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); margin-bottom: 8px; }
.source.disabled .s-info { opacity: .5; }
.order { width: 26px; text-align: center; color: var(--text3); font-size: 13px; flex: none; }
.s-info { flex: 1; min-width: 0; margin-right: 8px; }
.s-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.s-name small { font-weight: 400; font-size: 12px; }
.s-sub { display: flex; gap: 14px; font-size: 12px; color: var(--text3); margin-top: 4px; }
.st { display: flex; align-items: center; gap: 5px; flex: none; }
.st i { width: 7px; height: 7px; border-radius: 50%; background: var(--text3); }
.source.ready .st { color: #12b886; } .source.ready .st i { background: #12b886; box-shadow: 0 0 6px #12b886; }
.source.loading .st i { background: #f5b301; }
.source.failed .st { color: var(--danger); } .source.failed .st i { background: var(--danger); }
.err { color: var(--danger); overflow: hidden; text-overflow: ellipsis; }
.s-update { font-size: 12px; color: #c77d00; margin-top: 3px; }
.about a { text-decoration: underline; }
</style>
