<script setup>
/* 正文块渲染器（路线 B，2026-10-16）
   ---------------------------------------------------------------------
   把「一整块 HTML」换成「按 type 渲染的块数组」，与 B 站专栏的 paragraphs[] 同构。

   为什么这样就**没有 XSS**：
     · 全程 Vue 模板 —— 文本走 `{{ }}` 自动转义，**没有任何 v-html**；
     · 服务端已做过白名单清洗（只留白名单字段、逐块重建，见 PostService#sanitizeBlocks）。
   两道加起来才成立：前端不 v-html 是"输出的安全"，服务端清洗是"存储的安全"。

   ⚠️ `text / image / divider` 在本组件直接渲染；`score` 交给 `ScoreBlock`
      —— 它自己取谱并挂 `ScorePreview`，于是**谱面真的能播**（见那个组件的说明）。
   ⚠️ 未知 type 一律**不渲染**（静默跳过）：后端本就挡了，这里是第二道防线，
      也顺带兼容"后端加了新块类型、前端还没跟上"的过渡期。 */
import ScoreBlock from './ScoreBlock.vue'

defineProps({
  /** 块数组：[{type:'text'|'image'|'divider'|'score', ...}] */
  blocks: { type: Array, default: () => [] }
})
</script>

<template>
  <div class="blocks">
    <template v-for="(b, i) in blocks" :key="i">
      <p v-if="b && b.type === 'text'" class="blk-text">{{ b.text }}</p>

      <figure v-else-if="b && b.type === 'image'" class="blk-image">
        <img :src="b.url" :alt="b.caption || ''" loading="lazy">
        <figcaption v-if="b.caption">{{ b.caption }}</figcaption>
      </figure>

      <hr v-else-if="b && b.type === 'divider'" class="blk-divider">

      <ScoreBlock v-else-if="b && b.type === 'score'" :file-id="b.fileId" :title="b.title || ''" />
    </template>
  </div>
</template>
