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
</script>

<template>
  <main class="composer-frame">
    <iframe
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
