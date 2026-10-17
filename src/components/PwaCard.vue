<script setup>
/* PWA：Service Worker 注册 + 「安装到桌面」浮层
   对应 V3 `app.js` 末尾的 PWA 模块。两条要点保持一致：
     ① SW **不挂在 window load 上** —— load 要等所有子资源（含第三方字体 woff2）完成，
        任何一个外链卡住注册就永远不发生（2026-10-03 实测）。注册本就不需要等 load。
     ② 接住 beforeinstallprompt 并 preventDefault，用我们自己的入口，
        而不是让浏览器弹一条不受控的横条。 */
import { onMounted, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { ICONS } from '@/shared/icons'

const ui = useUiStore()
const visible = ref(false)
let installEvent = null

function alreadyInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

async function doInstall() {
  const ev = installEvent
  visible.value = false
  if (!ev) return
  ev.prompt()
  installEvent = null
  try {
    const r = await ev.userChoice
    /* 用户拒绝就安静收场，不反复弹 */
    if (!r || r.outcome !== 'accepted') return
  } catch (e) { /* ignore */ }
}

function close() {
  ui.dismissPwa()
  visible.value = false
}

onMounted(() => {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[PWA] Service Worker 注册失败：' + (e && e.message))
    })
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e
    if (!alreadyInstalled() && !ui.pwaDismissed) visible.value = true
  })

  window.addEventListener('appinstalled', () => {
    installEvent = null
    ui.dismissPwa()
    visible.value = false
    ui.toast('已安装到桌面')
  })
})
</script>

<template>
  <div v-if="visible" class="pwa-card">
    <span class="pwa-ic" v-html="ICONS.download"></span>
    <span class="pwa-tx"><b>安装到桌面</b><i>像 App 一样打开拇指琴谷</i></span>
    <button class="pwa-go" type="button" @click="doInstall">安装</button>
    <button class="pwa-x" type="button" aria-label="不再提示" @click="close">×</button>
  </div>
</template>
