<script setup>
/* 404 —— 对应 V3 `web/404.html`（该页只有顶栏、没有页脚，见 router meta.noFooter） */
</script>

<template>
  <main class="nf-body">
    <div class="code">404</div>
    <div class="t">这页谱子还没写出来</div>
    <div class="d">你可能走错了音位——帖子可能已下架，或者链接不对。<br>回广场看看琴友们最近在弹什么吧。</div>
    <div class="btns">
      <RouterLink class="btn primary" to="/">回广场</RouterLink>
      <RouterLink class="btn ghost" to="/composer">去制谱</RouterLink>
    </div>
  </main>
</template>
