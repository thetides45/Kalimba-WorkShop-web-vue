<script setup>
/* 作品广场 —— 对应 V3 `web/works.html`
   ---------------------------------------------------------------------
   ★ 2026-10-13 改版（用户拍板）：
     ① **只收这四个标签下的帖子**：曲谱分享 / 教程 / 翻弹 / 原创；
     ② 卡片换 **五列**（2026-10-14 由四列加宽而来）—— 复用首页那套 `.card-grid` 大图卡，只加 `.cols-5`
        （该页没有右侧栏，容器满宽 1400 − 48 = 1352px ⇒ 卡宽 257.6，与四列时的 256 基本一致）。

   ⚠️ 数据源也换了。原来是 `api.works.list()` —— 那是**纯 mock 占位**
      （后端根本没有 `/api/works`，mock 里写死 3 条 6001/6002/6003），
      所以广场**永远看不到社区真实帖子**。现在读真实帖子 `api.posts.list()`，
      用服务端的**多标签并集**参数 `tagIds` 过滤。
      标签 id **不写死**：从 `/api/tags` 按**名字**解析，站点改 id 也不会失效。

   ⚠️ 下面 `Player` / `togglePlay` / `makeBars` 这一簇**目前没有调用点**，是**刻意保留**的：
      本项目 `web-vue/` 不在任何 git 仓库里（删了就真没了），而播放能力大概率会在
      谱帖详情页或以后的「广场播放」里回来。等确实用不上时再删。
      （改造后 `rows` 不再从 mock 填充，所以 `togglePlay` 只会提示「暂无可试听」——
        它没有任何调用点，不影响页面。） */
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import { handleRes } from '@/shared/res'
import { useUiStore } from '@/stores/ui'
import { Player, parseJianpu, scoreDuration } from '@/shared/jianpu'
import { fmtDur } from '@/shared/utils'
import PostCardBig from '@/components/PostCardBig.vue'

const ui = useUiStore()

/** 广场只收录这几类（按**名字**匹配，见文件头 ①） */
const PLAZA_TAGS = ['曲谱分享', '教程', '翻弹', '原创']
/** 每页取多少 —— ⚠️ **必须是列数的整数倍**，否则最后一行填不满、末尾留一块空
    （用户 2026-10-16 报）。广场是 **5 列**（`.card-grid.cols-5`）⇒ 取 **3 行 = 15** 个。
    ⚠️ 按**宽屏列数**定的：窄屏降列（≤1120 变 4 列、≤900 变 2 列）时未必整除，代价可接受。 */
const SIZE = 15

const plazaTags = ref([])       // 解析出的标签（站点缺哪个就少哪个）
const activeTagId = ref('')     // '' = 全部（四类并集）
const posts = ref([])
const total = ref(0)
const page = ref(1)
const hasMore = ref(false)
const loading = ref(true)
const tagMissing = ref(false)   // 四类标签一个都没匹配上（站点改过名字）

/** 发给服务端的 `tagIds`：选了某一个就用它，否则是四类的并集 */
const queryTagIds = computed(() =>
  activeTagId.value || plazaTags.value.map((t) => t.id).join(','))

async function loadTags() {
  const r = await api.tags.list()
  if (r.code !== 0) return
  const all = r.data.list || []
  plazaTags.value = PLAZA_TAGS
    .map((name) => all.find((t) => t.name === name))
    .filter(Boolean)
    .map((t) => ({ id: String(t.id), name: t.name }))
  tagMissing.value = plazaTags.value.length === 0
}

async function loadPosts(append) {
  /* 标签都没解析出来时**不发请求** —— 否则 tagIds 为空会被当成「不过滤」，
     广场反而会列出全站帖子，与「只放这四类」的约定正好相反。 */
  if (!plazaTags.value.length) {
    posts.value = []
    total.value = 0
    hasMore.value = false
    loading.value = false
    return
  }
  loading.value = true
  const r = await api.posts.list({
    page: page.value, size: SIZE, tagIds: queryTagIds.value, sort: 'latest'
  })
  loading.value = false
  if (!handleRes(r, '作品加载失败')) return
  const list = r.data.list || []
  posts.value = append ? posts.value.concat(list) : list
  total.value = r.data.total || 0
  hasMore.value = list.length >= SIZE
}

function pickTag(id) {
  activeTagId.value = id
  page.value = 1
  loadPosts(false)
}
function loadMore() {
  page.value++
  loadPosts(true)
}

/* ---------------- 播放簇（当前无调用点，见文件头说明） ---------------- */
const playingId = ref('')
const progress = reactive({})
/** rows[workId] = 由关联谱帖简谱解析出的音序列（只读，不需响应式） */
const rows = {}

/** 波形示意条：确定性高度，避免每次刷新抖动（当前无调用点） */
function makeBars(id) {
  const arr = []
  for (let i = 0; i < 26; i++) arr.push(28 + ((i * 13 + id.length * 7) % 50))
  return arr
}

function resetAll() {
  Object.keys(progress).forEach((k) => { progress[k] = 0 })
  playingId.value = ''
}

/* 播放控制（当前无调用点）：整卡点击进谱帖详情，播放键阻止冒泡 */
function togglePlay(w) {
  const r = rows[w.id]
  if (!r || !r.length) { ui.toast('该作品暂无可试听的谱面'); return }
  if (playingId.value === w.id) { Player.stop(); resetAll(); return }
  Player.stop()
  resetAll()
  playingId.value = w.id
  Player.play(
    r,
    w.tempo,
    (i) => { progress[w.id] = (i + 1) / r.length * 100 },
    () => resetAll()
  )
}

onMounted(async () => {
  await loadTags()
  await loadPosts(false)
})
</script>

<template>
  <main class="wrap" style="padding-top:26px">
    <div class="section-h"><span class="t">作品广场<small>听大家弹的曲子</small></span></div>

    <!-- 分类 chips = 广场收录的那几类标签；「全部」= 四类并集 -->
    <div class="chips" id="works-chips" role="tablist" aria-label="作品分类">
      <button class="chip" :class="{ on: activeTagId === '' }" type="button" @click="pickTag('')">全部</button>
      <button
        v-for="t in plazaTags"
        :key="t.id"
        class="chip"
        :class="{ on: activeTagId === t.id }"
        type="button"
        @click="pickTag(t.id)"
      >{{ t.name }}</button>
    </div>

    <!-- ★ 五列竖向大图卡（与首页同一套卡，只多 .cols-5）。容器 1400 ⇒ 满宽 1352、卡宽 257.6，
             与改前 4 列的 256 只差 1.6px（卡宽不变，靠加宽容器多加一列）。
         ⚠️ 容器保留 id="works-list" 供 web_vue_smoke 当签名 -->
    <div class="card-grid cols-5" id="works-list">
      <PostCardBig v-for="p in posts" :key="p.id" :post="p" />
    </div>

    <div class="pager">
      <button v-if="hasMore" class="btn ghost sm" id="works-more" type="button" @click="loadMore">加载更多</button>
    </div>

    <div v-if="!loading && !posts.length" class="empty-tip" id="works-empty">
      {{ tagMissing ? '广场的标签还没建好（曲谱分享 / 教程 / 翻弹 / 原创），暂时没有可展示的作品。'
                    : '这个分类还没有作品，去听听别的吧。' }}
    </div>

    <div class="demo-note" style="margin-top:20px"><i></i>广场只收录「曲谱分享 / 教程 / 翻弹 / 原创」四类帖子 · 试听请进谱帖详情页</div>
  </main>
</template>
