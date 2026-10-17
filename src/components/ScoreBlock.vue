<script setup>
/* 乐谱块 —— 正文里内嵌的**可播放**谱面（路线 B 第 6 步）
   ---------------------------------------------------------------------
   这一步把「组件块」这件事坐实：块数组里的 score 块在这里挂上 ScorePreview，
   于是谱面能出现在正文的**任意位置** —— 这是把正文塞进 HTML 做不到的，也是 B 站专栏放不了的
   （它只能放视频卡）。

   ⚠️ 取谱口径必须与 `PostView` **完全一致**，那是唯一正确的一套：
      ① 先看 meta 的 `viewable`（**不是** `downloadable`）——「查看/试听」与「下载」是两套口径：
         login 档（默认）匿名也能看能听，但下载要登录；
      ② 再走 `files.view()`（公开只读的 `/content`），**不借**下载接口；
      ③ source 只认内核原文 —— 顶层字符串，或 `normalizeScore` 之后的 `source.jianpuText`。
   ⚠️ 四种"没出来"要**分开报**：加载中 / 没权限 / 文件取不到 / 没有简谱原文。
      含糊成一个「加载失败」，用户完全不知道该找谁、该做什么。 */
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import ScorePreview from './ScorePreview.vue'

const props = defineProps({
  fileId: { type: [String, Number], required: true },
  title: { type: String, default: '' }
})

/** loading | ok | locked（没权限）| empty（没简谱原文）| error（取不到） */
const state = ref('loading')
const source = ref('')
const reason = ref('')
const visLabel = ref('')

function pickSource(s) {
  if (!s) return ''
  const src = s.source
  if (typeof src === 'string') return src
  return (src && src.jianpuText) || ''
}

async function load() {
  state.value = 'loading'
  reason.value = ''
  source.value = ''
  visLabel.value = ''

  const mr = await api.files.meta(props.fileId)
  if (mr.code !== 0) { state.value = 'error'; reason.value = mr.message || '乐谱读取失败'; return }
  visLabel.value = mr.data.visibilityLabel || ''

  if (!mr.data.viewable) {
    state.value = 'locked'
    reason.value = mr.data.viewReason || '该乐谱暂不可查看'
    return
  }

  const fr = await api.files.view(props.fileId)
  if (fr.code !== 0 || !fr.data) { state.value = 'error'; reason.value = fr.message || '乐谱读取失败'; return }

  const src = pickSource(fr.data)
  if (!src) { state.value = 'empty'; return }
  source.value = src
  state.value = 'ok'
}

onMounted(load)
watch(() => props.fileId, load)
</script>

<template>
  <div class="blk-score-paper">
    <div class="bsp-head">
      <span class="bsp-ic">谱</span>
      <span class="bsp-t">《{{ title || '乐谱' }}》</span>
      <span v-if="visLabel" class="bsp-vis">下载权限：{{ visLabel }}</span>
    </div>

    <ScorePreview v-if="state === 'ok'" :source="source" />

    <div v-else class="bsp-msg">
      <template v-if="state === 'loading'">正在载入谱面…</template>
      <template v-else-if="state === 'empty'">这份乐谱没有可渲染的简谱原文。</template>
      <template v-else>{{ reason }}</template>
    </div>
  </div>
</template>
