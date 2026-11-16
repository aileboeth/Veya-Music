<script setup lang="ts">
// 设备：其他设备在放什么；接力（接过来 / 交过去）、推歌、一起听
import { computed } from 'vue'
import { player } from '../player'
import { inviteTogether, leaveTogether, pullFrom, pushPlayback, pushSong, remote } from '../remote'
import { otherDevices, platformName, sync, timeAgo } from '../sync'
import { go, sheet } from '../ui'
import Cover from './Cover.vue'
import Icon from './Icon.vue'
import Sheet from './Sheet.vue'

const devices = computed(() => otherDevices().slice().sort((a, b) => Number(b.online) - Number(a.online)))
const close = () => { sheet.show = '' }
const run = (fn: () => any) => {
  close()
  void fn()
}
const openSync = () => {
  close()
  player.showNowPlaying = false
  go('settings', { _sync: Date.now() })
}
</script>

<template>
  <Sheet :show="sheet.show == 'devices'" title="设备" @close="close">
    <div v-if="!sync.paired" class="empty-box">
      还没有连接同步服务器。连上以后，电脑和手机可以互相接力播放、推歌、一起听。
      <button class="btn small primary" @click="openSync">去设置</button>
    </div>
    <template v-else>
      <div v-if="!sync.online" class="warn"><Icon name="cloud" :size="16" />和同步服务器断开了，正在重新连接…</div>
      <div v-if="remote.following || remote.followers.length" class="together">
        <Icon name="together" :size="18" />
        <span class="flex1">{{ remote.following ? '正在和其他设备一起听' : `${remote.followers.length} 台设备在跟你一起听` }}</span>
        <button class="btn small" @click="leaveTogether">退出</button>
      </div>
      <div v-if="!devices.length" class="empty-box">还没有其他设备。在另一台设备的 Veya Music 里用同一个配对码连接同步服务器。</div>
      <div v-for="d in devices" :key="d.id" class="dev" :class="{ off: !d.online }">
        <div class="head">
          <Icon :name="d.platform == 'android' ? 'phone' : 'desktop'" :size="20" />
          <b class="ellipsis">{{ d.name || platformName(d.platform) }}</b>
          <small class="dim">{{ d.online ? '在线' : `离线 · ${timeAgo(d.lastSeen)}` }}</small>
        </div>
        <div v-if="d.online && d.np?.song" class="np" @click="run(() => pullFrom(d.id))">
          <Cover :src="d.np.song.img" :text="d.np.song.name" :size="42" :radius="9" />
          <div class="flex1">
            <div class="ellipsis">{{ d.np.song.name }} <span class="dim">- {{ d.np.song.singer }}</span></div>
            <small class="dim">{{ d.np.playing ? '正在播放' : '已暂停' }}</small>
          </div>
        </div>
        <div v-if="d.online" class="acts">
          <button :disabled="!d.np?.song || remote.pulling == d.id" @click="run(() => pullFrom(d.id))"><Icon name="arrow-down" :size="17" />{{ remote.pulling == d.id ? '接力中…' : '在这里接着听' }}</button>
          <button :disabled="!player.song" @click="run(() => pushPlayback(d.id))"><Icon name="cast" :size="17" />接力到这台</button>
          <button :disabled="!player.song" @click="run(() => pushSong(d.id, player.song!, 'next'))"><Icon name="playnext" :size="17" />推到下一首</button>
          <button :disabled="!player.song" @click="run(() => inviteTogether(d.id))"><Icon name="together" :size="17" />一起听</button>
        </div>
      </div>
    </template>
  </Sheet>
</template>

<style scoped>
.empty-box { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 18px 10px; color: var(--text3); text-align: center; font-size: 13px; line-height: 1.7; }
.warn { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 10px; border-radius: 10px; background: rgba(245, 179, 1, 0.14); color: #b07800; font-size: 13px; }
.together { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 12px; border-radius: 12px; background: var(--active); color: var(--accent); font-weight: 600; font-size: 14px; }
.flex1 { flex: 1; min-width: 0; }
.dev { padding: 12px; margin-bottom: 10px; border-radius: 16px; background: var(--card); border: 1px solid var(--border); }
.dev.off { opacity: .55; }
.head { display: flex; align-items: center; gap: 8px; color: var(--accent); }
.head b { color: var(--text); font-size: 15px; }
.head small { margin-left: auto; flex: none; }
.np { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 8px; border-radius: 12px; background: var(--hover); font-size: 14px; cursor: pointer; }
.acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.acts button { display: flex; align-items: center; justify-content: center; gap: 6px; height: 38px; border-radius: 12px; background: var(--hover); font-size: 13px; color: var(--text); }
.acts button:disabled { opacity: .4; }
.acts button:active { background: var(--active); color: var(--accent); }
</style>
