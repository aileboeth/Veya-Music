<script setup lang="ts">
// 设置 → 同步：配对自部署的 Veya Sync 服务器，选择同步内容，查看设备
import { computed, onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import { api } from '../api'
import { isAndroid } from '../platform'
import { initSync, otherDevices, platformName, sync, timeAgo } from '../sync'
import { confirmDialog, promptDialog, toast } from '../ui'
import Icon from './Icon.vue'

const INSTALL = 'curl -fsSL https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash'
const INSTALL_CN = 'curl -fsSL https://p.jackyu.cn/https://github.com/aileboeth/Veya-Music/releases/latest/download/veya-sync-install.sh | bash'

const code = ref('')
const busy = ref(false)
const showGuide = ref(false)
const qrSvg = ref('')

onMounted(() => void initSync())

const copy = (text: string, what = '命令') => {
  void api('app.copy', text).then(() => toast(`已复制${what}`, 'success'))
}

const connect = async(text = code.value) => {
  if (!text.trim()) return void toast('先粘贴服务器上显示的配对码', 'error')
  busy.value = true
  try {
    await api('sync.pair', text.trim())
    code.value = ''
    toast('已连接同步服务器，正在同步…', 'success')
  } catch (err: any) {
    toast(`连接失败：${err.message}`, 'error', 6000)
  } finally {
    busy.value = false
  }
}

const scan = async() => {
  try {
    const text = await api<string | null>('app.scanQr')
    if (text) await connect(text)
  } catch (err: any) {
    toast(`扫码失败：${err.message}`, 'error')
  }
}

const syncNow = async() => {
  try {
    await api('sync.now')
    toast('同步完成', 'success')
  } catch (err: any) {
    toast(`同步失败：${err.message}`, 'error', 5000)
  }
}

const unpair = async() => {
  if (!await confirmDialog('断开同步服务器？', '本机的歌单和记录都会保留，只是不再和其他设备同步。之后可以用配对码重新连接。', { okText: '断开', danger: true })) return
  await api('sync.unpair')
  qrSvg.value = ''
  toast('已断开')
}

const rename = async() => {
  const name = await promptDialog('本机名称', sync.deviceName, '在其他设备上显示的名字')
  if (name?.trim()) await api('sync.rename', name.trim())
}

const toggleGroup = (g: keyof typeof sync.groups) => void api('sync.groups', { [g]: !sync.groups[g] })

const toggleQr = async() => {
  if (qrSvg.value) return void (qrSvg.value = '')
  const text = await api<string>('sync.code')
  const qr = qrcode(0, 'L')
  qr.addData(text)
  qr.make()
  qrSvg.value = qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true })
}
const copyCode = async() => copy(await api<string>('sync.code'), '配对码')

const statusText = computed(() => {
  if (!sync.enabled) return '已暂停'
  if (sync.showSyncing) return '正在同步…'
  if (sync.online) return sync.lastSync ? `已连接 · 上次同步 ${timeAgo(sync.lastSync)}` : '已连接'
  return sync.error ? '连接不上' : '正在连接…'
})
const groups = [
  { id: 'lists', name: '歌单和我喜欢', desc: '自建、导入的歌单，删掉的歌不会被别的设备加回来' },
  { id: 'history', name: '听歌记录和推荐', desc: '每台设备的听歌记录合在一起算推荐；每日推荐、不喜欢、搜索历史也一样' },
  { id: 'sources', name: '音源脚本', desc: '在一台设备上导入的音源，其他设备自动就有' },
  { id: 'settings', name: '部分设置', desc: '主题、音质、播放模式、歌词配色等；代理、下载位置、窗口大小各设备分开' },
] as const
</script>

<template>
  <section>
    <h2>同步与多设备</h2>
    <template v-if="!sync.paired">
      <p class="hint">
        在你自己的服务器（VPS）上装一个 Veya Sync，电脑和手机就能同步歌单、听歌记录、音源和设置，
        还能把正在听的歌接力到另一台设备、互相推歌、一起听。数据只存在你自己的服务器上。
      </p>
      <div class="item col">
        <div class="row gap8 w100">
          <b class="flex1">第 1 步：在服务器上运行一条命令</b>
          <button class="btn small" @click="showGuide = !showGuide">{{ showGuide ? '收起说明' : '说明' }}</button>
        </div>
        <div class="cmd"><code>{{ INSTALL }}</code><button class="icon-btn" title="复制" @click="copy(INSTALL)"><Icon name="copy" :size="15" /></button></div>
        <div class="cmd"><code>{{ INSTALL_CN }}</code><button class="icon-btn" title="复制" @click="copy(INSTALL_CN)"><Icon name="copy" :size="15" /></button></div>
        <p v-if="showGuide" class="hint small">
          第二条是国内服务器用的 GitHub 加速版本（安装时如果连不上 GitHub 也会自动换加速镜像）。用 root 运行；装完会显示一个二维码和一行 <code>veya1.</code> 开头的配对码。
          云服务器记得在控制台的安全组里放行 TCP 7650 端口。已经有域名和 Nginx / 1Panel 的话，可以加 <code>-s -- --behind-proxy --url https://你的域名</code> 放在反向代理后面。
          以后在服务器上运行 <code>veya-sync info</code> 可以再次查看配对码，<code>veya-sync update</code> 更新。
        </p>
      </div>
      <div class="item col">
        <b class="w100">第 2 步：{{ isAndroid ? '扫码或粘贴配对码' : '粘贴配对码' }}</b>
        <div class="row gap8 w100">
          <input v-model="code" class="input flex1" placeholder="veya1.xxxxxxxx…（服务器上显示的那一整行）" spellcheck="false" @keydown.enter="connect()" />
          <button v-if="isAndroid" class="btn" :disabled="busy" @click="scan"><Icon name="qr" :size="16" />扫码</button>
          <button class="btn primary" :disabled="busy || !code.trim()" @click="connect()"><span v-if="busy" class="spinner mini" />连接</button>
        </div>
        <span v-if="!isAndroid" class="sub">手机上也可以扫电脑上显示的二维码配对（连接后在这里点「手机配对」）。</span>
      </div>
    </template>

    <template v-else>
      <div class="item status" :class="{ ok: sync.online && !sync.error, bad: !!sync.error }">
        <div class="flex1">
          <b><i class="dot" />{{ statusText }}</b>
          <span>{{ sync.server ? sync.server + ' · ' : '' }}{{ sync.url }}<template v-if="sync.pending"> · {{ sync.pending }} 条改动等待上传</template></span>
          <span v-if="sync.error" class="err">{{ sync.error }}</span>
        </div>
        <div class="row gap8">
          <button class="btn small" :disabled="sync.showSyncing || !sync.enabled" @click="syncNow"><Icon name="refresh" :size="15" />立即同步</button>
          <button class="btn small" @click="api('sync.enable', !sync.enabled)">{{ sync.enabled ? '暂停' : '继续' }}</button>
          <button class="btn small danger" @click="unpair">断开</button>
        </div>
      </div>

      <div class="item">
        <div><b>本机名称</b><span>其他设备上看到的名字：{{ sync.deviceName }}</span></div>
        <button class="btn small" @click="rename"><Icon name="edit" :size="15" />改名</button>
      </div>

      <div v-if="!isAndroid" class="item col">
        <div class="row gap8 w100">
          <div class="flex1"><b>手机配对</b><span class="sub">手机上打开 Veya Music → 设置 → 同步 → 扫码，扫下面的二维码就能连上同一个服务器</span></div>
          <button class="btn small" @click="copyCode"><Icon name="copy" :size="15" />复制配对码</button>
          <button class="btn small primary" @click="toggleQr"><Icon name="qr" :size="15" />{{ qrSvg ? '隐藏' : '显示二维码' }}</button>
        </div>
        <div v-if="qrSvg" class="qr-box"><div class="qr" v-html="qrSvg" /><span class="sub">二维码里有连接密钥，别给别人看</span></div>
      </div>

      <h3>同步内容</h3>
      <div v-for="g in groups" :key="g.id" class="item">
        <div><b>{{ g.name }}</b><span>{{ g.desc }}</span></div>
        <button class="switch" :class="{ on: sync.groups[g.id] }" @click="toggleGroup(g.id)" />
      </div>

      <h3>设备</h3>
      <div v-if="!otherDevices().length" class="empty-box">还没有其他设备。在手机或另一台电脑上用同一个配对码连接。</div>
      <div v-for="d in otherDevices()" :key="d.id" class="item device" :class="{ online: d.online }">
        <Icon :name="d.platform == 'android' ? 'phone' : 'desktop'" :size="22" />
        <div class="flex1">
          <b>{{ d.name || platformName(d.platform) }} <small class="dim">{{ platformName(d.platform) }}{{ d.version ? ' · ' + d.version : '' }}</small></b>
          <span>{{ d.online ? (d.np?.song ? `正在${d.np.playing ? '播放' : '暂停'}：${d.np.song.name} - ${d.np.song.singer}` : '在线') : `离线 · ${timeAgo(d.lastSeen)}` }}</span>
        </div>
        <button v-if="!d.online" class="icon-btn" title="从列表里移除（它下次连上会重新出现）" @click="api('sync.forget', d.id)"><Icon name="close" :size="15" /></button>
      </div>
    </template>
  </section>
</template>

<style scoped>
section { max-width: 860px; min-width: 0; margin-bottom: 30px; }
h2 { font-size: 17px; margin: 0 0 12px; }
h3 { font-size: 14px; margin: 18px 0 10px; color: var(--text2); font-weight: 600; }
.hint { color: var(--text2); font-size: 13px; line-height: 1.75; margin: 0 0 14px; user-select: text; }
.hint.small { font-size: 12px; margin: 4px 0 0; }
.hint code, .cmd code { font-family: Consolas, 'Cascadia Mono', monospace; font-size: 12px; }
.item { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 58px; padding: 10px 16px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); margin-bottom: 8px; }
.item.col { flex-direction: column; align-items: stretch; gap: 8px; }
.item > div:first-child:not(.row) { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.item b { font-weight: 600; }
.item span, .sub { font-size: 12px; color: var(--text3); }
.flex1 { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.w100 { width: 100%; }
.cmd { display: flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; padding: 6px 6px 6px 12px; border-radius: 10px; background: var(--hover); user-select: text; }
.cmd code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; color: var(--text); }
.input.flex1 { display: block; height: 34px; }
.status .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: #f5b301; vertical-align: 1px; }
.status.ok .dot { background: #12b886; box-shadow: 0 0 6px #12b886; }
.status.bad .dot { background: var(--danger); }
.err { color: var(--danger) !important; word-break: break-all; }
.qr-box { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 0 4px; }
.qr { width: 220px; height: 220px; padding: 0; background: #fff; border-radius: 12px; overflow: hidden; }
.qr :deep(svg) { width: 100%; height: 100%; display: block; }
.empty-box { padding: 20px; border-radius: 12px; border: 1.5px dashed var(--border); color: var(--text3); text-align: center; font-size: 13px; }
.device { justify-content: flex-start; color: var(--text3); }
.device.online { color: var(--accent); }
.device .flex1 b { color: var(--text); }
.spinner.mini { width: 14px; height: 14px; border-width: 2px; }
@media (max-width: 640px) {
  .item:not(.col):not(.device) { flex-wrap: wrap; }
  .status .flex1 { flex-basis: 100%; }
  .status .row { width: 100%; }
  .status .row .btn { flex: 1; }
  /* 手机上命令换行显示：一整行不换行会把整个设置页撑宽，页面能左右滑 */
  .cmd code { font-size: 11px; white-space: pre-wrap; word-break: break-all; overflow: visible; line-height: 1.5; }
}
:root.mobile .cmd code { font-size: 11px; white-space: pre-wrap; word-break: break-all; overflow: visible; line-height: 1.5; }
</style>
