<script setup>
/* 谱帖卡片 —— 对应 V3 `assets/app.js` 的 cardHTML()（首页 / 个人主页 / 搜索页共用）。
   ⚠️ 外层是 <button>，内部不能再放可点元素（原版用 span 做「可试听」角标也是这个原因）。 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ICONS } from '@/shared/icons'

const props = defineProps({
  post: { type: Object, required: true },
  /** 搜索页用：命中位置标注（如「标题·正文」），非空时在计数前插一枚小 pill */
  matchedLabel: { type: String, default: '' }
})

const router = useRouter()
const p = computed(() => props.post || {})
const dateShort = computed(() => String(p.value.createdAt || '').slice(5, 10))
const authorName = computed(() => (p.value.author && p.value.author.nickname) || '')
const tagList = computed(() => (p.value.tags || []).slice(0, 2))

/* 封面图加载失败退回占位（同 `PostCardBig`）：封面可能是已被清理的旧路径，
   不能留一个破图。换数据时复位，避免复用组件继承上一张的失败状态。 */
const imgOk = ref(true)
watch(() => p.value.cover, () => { imgOk.value = true })
const showImg = computed(() => !!p.value.cover && imgOk.value)

function open() {
  router.push('/post/' + p.value.id)
}
</script>

<template>
  <button class="post-card" type="button" @click="open">
    <img v-if="showImg" class="score-thumb" :src="p.cover" alt="" @error="imgOk = false">
    <span v-else class="score-thumb">
      <b>{{ p.hasScore ? '谱' : '文' }}</b>
      <i>{{ p.hasScore ? 'JIANPU' : 'TEXT' }}</i>
    </span>

    <span class="info">
      <span class="name">{{ p.title }}</span>
      <span class="summary">{{ p.summary }}</span>
      <span class="row2">
        <span v-for="t in tagList" :key="t.id" class="tag">{{ t.name }}</span>
        <span class="author">{{ authorName }} · {{ dateShort }}</span>
        <span v-if="matchedLabel" class="match-pill">{{ matchedLabel }}命中</span>
        <span class="cnt">{{ p.likeCount }} 赞 · {{ p.commentCount }} 评</span>
      </span>
    </span>

    <span v-if="p.hasScore" class="play-mini" title="可试听" v-html="ICONS.play"></span>
  </button>
</template>
