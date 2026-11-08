<script setup>
/* 在线制谱 —— 内嵌 `public/composer.html`
   ---------------------------------------------------------------------
   刻意**不**用 Vue 重写制谱器，理由：
     · `composer.html` 是**单文件**，内含 4600 行零依赖内核（记谱 / 渲染 / 播放 /
       打印 / 导出 / MIDI 与 MusicXML 导入），由 `tools/sync_composer.js` 从离线产物派生；
     · 用 Vue 重写等于把已经通过 `kalprobe` 全量验收（21 探针 / 1240 项）的内核
       推倒重做一遍，风险与收益完全不成比例。
   所以这里只做「承载」：iframe 指向同一个单文件，内核**零改动**。
   —— 与 V3 的唯一差异：V3 的 composer.html 是独立页面、没有社区顶栏；
      SPA 里没有浏览器后退按钮可用，故保留顶栏作为返回入口。 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const frame = ref(null)

/* 关页面时提醒「制谱器里还有没保存的改动」（2026-11-08）。
   ⚠️ 为什么外层还要再拦一层：内核（iframe 里那份）**自己也监听了 beforeunload**，
      但**关闭顶层页面时，iframe 的 beforeunload 只触发事件、不弹窗**（浏览器行为）——
      真正会弹确认的是**顶层文档**这一层。所以这里要反过来问内核「里面有没有没存的」。
   ⚠️ `__kalimbaHasUnsaved` 由内核导出（见 kalimba-tab/index.html）。iframe 还没加载完、
      或者将来换成跨源承载时它是 undefined ⇒ 必须用类型判断兜底，不能直接调用。 */
function onBeforeUnload(e) {
  let dirty = false
  try {
    const w = frame.value && frame.value.contentWindow
    dirty = !!(w && typeof w.__kalimbaHasUnsaved === 'function' && w.__kalimbaHasUnsaved())
  } catch (err) {
    dirty = false          // 跨源会抛 SecurityError，按"没有改动"处理，别误拦
  }
  if (!dirty) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <main class="composer-frame">
    <iframe
      ref="frame"
      class="composer-iframe"
      src="/composer.html"
      title="卡林巴转谱工坊 · 在线制谱器"
    ></iframe>
  </main>
</template>

<style scoped>
/* 顶栏高度 —— **不要写死 64px**：窄屏（≤1080）顶栏会变成两行（约 108px），
   写死的话 iframe 底部会被顶出视口。实际高度由 SiteHeader 用 ResizeObserver
   写进 `--topnav-h`（回退 64 留给首帧/无 JS）。制谱器自身也需要尽量多的竖向空间。 */
.composer-frame {
  height: calc(100vh - var(--topnav-h, 64px));
  background: #F9F7F5;
}
.composer-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
