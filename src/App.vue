<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import PwaCard from '@/components/PwaCard.vue'

const route = useRoute()
/* 与 V3 对齐：404 页只有顶栏、没有页脚（其它页面都由 renderHeader + renderFooter 成对出现） */
const showFooter = computed(() => !(route.meta && route.meta.noFooter))

/* ★ 2026-10-14：**按路由的容器宽度**。
   卡宽固定 346（用户拍板），而各页的列数与侧栏结构不同 ⇒ 容器宽必须分别反算：
     首页      4 列卡片 + 1 列热门话题 = 5 列 → 4×346 + 16 + 346 = 1794 内容 → 1842
     作品广场  5 列卡片                        → 5×346 + 4×16     = 1794 内容 → 1842
     用户中心  1 列左菜单 + 4 列卡片（我的收藏/创作）→ 188 + 22 + 1432 = 1642 → 1690
   把变量挂在**同时包住顶栏与内容的这一层**上，两者才会用同一个宽度、左右缘严丝合缝
   （分开写死会出现「logo 与内容左缘错开」的错位）。
   ⚠️ 其余路由（搜索 / 管理端 / 详情…）不设此变量，走 `.wrap` 的默认值。 */
const pageClass = computed(() => 'page-' + (route.name || 'home'))
</script>

<template>
  <div :class="pageClass">
    <SiteHeader />
    <RouterView />
    <SiteFooter v-if="showFooter" />
    <PwaCard />
  </div>
</template>
