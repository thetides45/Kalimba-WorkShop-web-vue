<script setup>
/* 综合搜索 —— 对应 V3 `web/search.html`
   关键词与类型都从 URL 读，保证「可分享、可前进后退」：
   顶栏搜索框提交后会跳到 /search?keyword=xxx。 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { handleRes } from '@/shared/res'
import { SearchHistory } from '@/shared/searchHistory'
import { ICONS } from '@/shared/icons'
import PostCard from '@/components/PostCard.vue'

const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 8
const MATCH_LABEL = { title: '标题', content: '正文', tag: '标签', user: '作者' }
const TYPE_CHIPS = [['all', '综合'], ['post', '琴谱'], ['user', '用户'], ['tag', '标签']]

const keyword = computed(() => String(route.query.keyword || '').trim())
const type = computed(() => String(route.query.type || 'all'))

const inputEl = ref(keyword.value)
const page = ref(1)
const posts = ref([])
const postTotal = ref(0)
const hasMore = ref(false)
const users = ref([])
const tags = ref([])
const searched = ref(false)
const resultKeyword = ref('')
const emptyMsg = ref('')
const showEmpty = ref(false)

const hotItems = ref([])
const historyItems = ref([])

const showPosts = computed(() => type.value === 'all' || type.value === 'post')
const showUsers = computed(() => type.value === 'all' || type.value === 'user')
const showTags = computed(() => type.value === 'all' || type.value === 'tag')

function q(kw, tp) {
  const query = {}
  if (kw) query.keyword = kw
  if (tp && tp !== 'all') query.type = tp
  return { path: '/search', query }
}

/* 大搜索框提交：换关键词重新搜（回到第 1 页，类型回落到综合 —— 与 V3 的 doSearch 一致） */
function doSearch() {
  router.replace(q(inputEl.value.trim(), 'all'))
}
function pickType(t) {
  router.replace(q(keyword.value, t))
}
/* 用某个关键词重新搜（点热搜 / 历史 chip / 标签卡都走这里） */
function searchKeyword(kw) {
  inputEl.value = String(kw || '')
  router.replace(q(String(kw || ''), type.value))
}
function clearHistory() {
  SearchHistory.clear()
  renderHistory()
}

function renderHistory() {
  historyItems.value = SearchHistory.get()
}

/* ---- 热门搜索：优先后端热搜榜；榜空（新站 / 关了日志）回退显示热门标签，不留空块 ---- */
async function renderHot() {
  const r = await api.search.hot({ limit: 8, days: 7 })
  const list = (r.code === 0 && Array.isArray(r.data)) ? r.data : []
  if (list.length) {
    hotItems.value = list.map((x) => x.keyword)
    return
  }
  const t = await api.tags.list()
  const arr = (t.code === 0 && t.data && Array.isArray(t.data.list)) ? t.data.list : []
  hotItems.value = arr.slice(0, 8).map((x) => x.name)
}

function matchedLabelOf(p) {
  const labels = (p.matchedIn || []).map((m) => MATCH_LABEL[m]).filter(Boolean)
  return labels.join('·')
}

async function run(append) {
  if (!keyword.value) {
    posts.value = []
    users.value = []
    tags.value = []
    searched.value = false
    showEmpty.value = true
    emptyMsg.value = '输入关键词开始搜索'
    return
  }

  /* 发请求前记下历史代际：若请求期间用户点了「清空」，落地时就别再写回去 */
  const histGen = SearchHistory.generation()
  const r = await api.search.query({
    keyword: keyword.value, type: type.value, page: page.value, size: PAGE_SIZE
  })
  if (!handleRes(r, '搜索失败')) return

  if (SearchHistory.generation() === histGen) SearchHistory.add(keyword.value)
  renderHistory()

  const d = r.data
  const list = d.posts.list || []
  posts.value = append ? posts.value.concat(list) : list
  postTotal.value = d.posts.total || 0
  hasMore.value = list.length >= PAGE_SIZE
  users.value = d.users || []
  tags.value = d.tags || []

  searched.value = true
  resultKeyword.value = d.keyword || keyword.value

  /* 三组都空才显示空状态 */
  const total = (d.posts.total || 0) + users.value.length + tags.value.length
  if (total === 0) {
    showEmpty.value = true
    emptyMsg.value = '没有找到与「' + resultKeyword.value + '」相关的内容'
  } else {
    showEmpty.value = false
  }
}

function loadMore() {
  page.value++
  run(true)
}

watch(() => route.fullPath, () => {
  inputEl.value = keyword.value
  page.value = 1
  run(false)
}, { immediate: true })

onMounted(() => {
  renderHot()
  renderHistory()
})
</script>

<template>
  <main class="wrap">
    <div class="search-head">
      <form class="bigsearch" @submit.prevent="doSearch">
        <span class="bs-ic" v-html="ICONS.searchLg"></span>
        <input
          v-model="inputEl"
          id="s-input"
          type="search"
          placeholder="搜索琴谱标题、正文、作者或标签…"
          autocomplete="off"
          aria-label="搜索"
        >
        <button class="btn coral sm" type="submit">搜索</button>
      </form>

      <div class="chips s-head-chips" id="type-chips">
        <button
          v-for="[v, label] in TYPE_CHIPS"
          :key="v"
          class="chip"
          :class="{ on: type === v }"
          :data-type="v"
          type="button"
          @click="pickType(v)"
        >{{ label }}</button>
      </div>

      <div class="s-meta" id="s-meta">
        <template v-if="keyword">
          <template v-if="searched">「<b>{{ resultKeyword }}</b>」的搜索结果</template>
          <template v-else>正在搜索「<b>{{ keyword }}</b>」…</template>
        </template>
      </div>

      <!-- 发现区：热搜词（后端榜，空则回退热门标签）+ 本地搜索历史
           ⚠️ 两个行容器用 v-show（常驻）：断言工装按 display 判可见性，
              元素缺失会让 `getComputedStyle(null)` 抛异常 → 被误当成「可见」的假通过。 -->
      <div class="s-discover">
        <div v-show="hotItems.length" class="sd-row" id="hot-row">
          <span class="sd-label">热门搜索</span>
          <div class="chips sd-chips" id="hot-chips">
            <button v-for="k in hotItems" :key="k" class="chip kw-chip" :data-kw="k" type="button" @click="searchKeyword(k)">{{ k }}</button>
          </div>
        </div>
        <div v-show="historyItems.length" class="sd-row" id="history-row">
          <span class="sd-label">最近搜索</span>
          <div class="chips sd-chips" id="history-chips">
            <button v-for="k in historyItems" :key="k" class="chip kw-chip" :data-kw="k" type="button" @click="searchKeyword(k)">{{ k }}</button>
          </div>
          <button class="linkbtn sd-clear" id="history-clear" type="button" @click="clearHistory">清空</button>
        </div>
      </div>
    </div>

    <section v-show="showPosts" id="s-posts">
      <div class="section-h"><div class="t">相关琴谱<small id="s-posts-n">{{ postTotal ? '共 ' + postTotal + ' 篇' : '' }}</small></div></div>
      <div class="post-list" id="s-post-list">
        <PostCard v-for="p in posts" :key="p.id" :post="p" :matched-label="matchedLabelOf(p)" />
      </div>
      <div v-if="showPosts && !posts.length && searched" class="empty-tip" style="grid-column:1/-1">没有匹配的琴谱</div>
      <div class="pager">
        <button v-if="hasMore" class="btn ghost sm" id="s-more" type="button" @click="loadMore">加载更多</button>
      </div>
    </section>

    <section v-show="showUsers" id="s-users">
      <div class="section-h"><div class="t">相关用户<small>{{ users.length ? '共 ' + users.length + ' 位' : '' }}</small></div></div>
      <div class="user-grid" id="s-user-list">
        <RouterLink v-for="u in users" :key="u.id" class="user-card" :to="'/user/' + u.id">
          <span class="navavatar">{{ String(u.nickname || '?').slice(0, 1) }}</span>
          <span class="uc-info">
            <span class="uc-name">{{ u.nickname }}</span>
            <span class="uc-sub">@{{ u.username || '' }}</span>
          </span>
        </RouterLink>
      </div>
      <div v-if="showUsers && searched && !users.length" class="empty-tip">没有匹配的用户</div>
    </section>

    <section v-show="showTags" id="s-tags">
      <div class="section-h"><div class="t">相关标签<small>{{ tags.length ? '共 ' + tags.length + ' 个' : '' }}</small></div></div>
      <div class="tag-grid" id="s-tag-list">
        <button v-for="t in tags" :key="t.id" class="tag-card" type="button" @click="searchKeyword(t.name)">
          <span class="tc-name"># {{ t.name }}</span>
          <span class="tc-cat">{{ t.category || '标签' }}</span>
        </button>
      </div>
      <div v-if="showTags && searched && !tags.length" class="empty-tip">没有匹配的标签</div>
    </section>

    <!-- ⚠️ 用 v-show 而不是 v-if：空态元素必须**始终存在于 DOM**，
         否则 `getComputedStyle(getElementById('s-empty'))` 会抛异常，
         而断言工装把「抛异常」当成「真值」→ 变成假通过（V3 的该节点就是常驻 + display 切换）。 -->
    <div v-show="showEmpty" class="empty-state" id="s-empty" style="margin-top:34px">
      <span v-html="ICONS.empty"></span>
      <div class="t">{{ emptyMsg }}</div>
      <div class="d">换个关键词试试：曲名、作者昵称，或标签（如「国风」「翻弹」）。</div>
      <RouterLink class="btn coral" to="/">回首页逛逛</RouterLink>
    </div>
  </main>
</template>
