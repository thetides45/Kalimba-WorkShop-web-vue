<script setup>
/* 三列竖向大图卡 —— 首页 / 作品广场 / 用户中心**共用同一张卡**（2026-10-11 融合版定稿，
   外观见 `_mock_f10/06-08`）。三处唯一的不同只是正文两行：
     谱帖：元信息 =「作者 · 日期」        计数 =「N 赞 · N 评」
     作品：元信息 =「弹奏 · 作者 · 分类」  计数 =「时长 · N 赞 · N 评」
   ⚠️ 卡上**不放任何按钮**（试听 / 看谱已按用户要求全部去掉，整卡即链接）；
      外层是 <button>，内部就不能再放可点元素 —— 与 `PostCard.vue` 同一条理由。 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  post: { type: Object, required: true },
  /** 元信息行；不传则由 author + createdAt 拼 */
  meta: { type: String, default: '' },
  /** 计数行前缀（作品用来放时长）；为空则只显示赞/评 */
  lead: { type: String, default: '' }
})

const router = useRouter()
const p = computed(() => props.post || {})
const authorName = computed(() => (p.value.author && p.value.author.nickname) || '')
const dateShort = computed(() => String(p.value.createdAt || '').slice(5, 10))

/* 封面图**加载失败要退回占位**，不能留个破图：封面区在竖卡里是 100%×136px 的一大块，
   破图非常显眼（而且封面可能是已被清理的旧路径）。`@error` 把标记翻掉即可；
   换卡片数据时记得复位，否则复用的组件会把上一张的失败状态带过来。 */
const imgOk = ref(true)
watch(() => p.value.cover, () => { imgOk.value = true })
const showImg = computed(() => !!p.value.cover && imgOk.value)

const metaText = computed(() => props.meta
  || (authorName.value ? authorName.value + ' · ' + dateShort.value : ''))
const countText = computed(() => {
  const base = (p.value.likeCount || 0) + ' 赞 · ' + (p.value.commentCount || 0) + ' 评'
  return props.lead ? props.lead + ' · ' + base : base
})

function open() {
  router.push('/post/' + p.value.id)
}
</script>

<template>
  <button class="card-big" type="button" @click="open">
    <span class="cover">
      <!-- ★ 2026-10-14：草稿角标。只可能出现在「我的帖子」里 ——
           后端 list 对作者放行 status=3，看别人的帖只会是 1。 -->
      <span v-if="p.status === 3" class="st-badge">草稿</span>
      <img v-if="showImg" :src="p.cover" alt="" @error="imgOk = false">
      <template v-else>
        <b>{{ p.hasScore ? '谱' : '文' }}</b>
        <i>{{ p.hasScore ? 'JIANPU' : 'TEXT' }}</i>
      </template>
    </span>
    <span class="body">
      <span class="t">{{ p.title }}</span>
      <span class="a">{{ metaText }}</span>
      <span class="f"><span class="c">{{ countText }}</span></span>
    </span>
  </button>
</template>
