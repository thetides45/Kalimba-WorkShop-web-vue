<script setup>
/* 首页 —— 对应 V3 `web/index.html`
   结构：hero 签名区（音齿由脚本渲染）+ 本周精选（hot top3）+ 琴谱流（排序/标签筛选/加载更多）
        + 右侧栏（在线制谱 / 热门话题 / 社区约定） */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { DB } from '@/api/mock'
import { handleRes } from '@/shared/res'
import PostCardBig from '@/components/PostCardBig.vue'

const route = useRoute()
const router = useRouter()

const sort = ref('')
const tagId = ref('')
const page = ref(1)
const keyword = ref(String(route.query.keyword || ''))
const posts = ref([])
const total = ref(0)
const tags = ref([])
const hasMore = ref(false)
const featured = ref([])

/* V3 装饰画：音齿高度与珊瑚色点缀由脚本渲染（与原型一致，仅首页） */
const TEETH = [72, 86, 100, 114, 128, 142, 156, 170, 184, 170, 156, 142, 128, 114, 100, 86, 72]
const CORAL_IDX = [2, 5, 8, 11, 14]
function toothStyle(i, h) {
  const s = { left: (34 + i * 21) + 'px', height: h + 'px' }
  if (CORAL_IDX.includes(i)) s.background = 'var(--coral)'
  return s
}

/* 每页取多少 —— ⚠️ **必须是列数的整数倍**，否则最后一行填不满、末尾留一块空
   （用户 2026-10-16 报：「首页只显示 6 个，空一块」）。
   首页信息流是 **4 列**（`.card-grid.cols-4`）⇒ 取 **2 行 = 8** 个。
   ⚠️ 这是按**宽屏列数**定的：窄屏会降列（≤1120 变 3 列、≤900 变 2 列），那时 8 未必整除 ——
      代价可接受（窄屏本来就不是主力场景），要彻底解决得按实际列数动态算 size 并监听 resize 重取。 */
const PAGE_SIZE = 8

/* 卡片流（GET /api/posts?page=&size=&tagId=&sort=&keyword=） */
async function loadPosts(append) {
  const r = await api.posts.list({
    page: page.value, size: PAGE_SIZE, tagId: tagId.value, sort: sort.value, keyword: keyword.value
  })
  if (!handleRes(r, '帖子加载失败')) return
  const list = r.data.list || []
  posts.value = append ? posts.value.concat(list) : list
  total.value = r.data.total || 0
  hasMore.value = list.length >= PAGE_SIZE
}

function pickSort(s) {
  sort.value = s
  page.value = 1
  loadPosts(false)
}
function pickTag(id) {
  tagId.value = id
  page.value = 1
  loadPosts(false)
}
function loadMore() {
  page.value++
  loadPosts(true)
}
/* 搜索提示条的「清除」：清掉关键词、把 URL 上的 keyword 摘掉，再重新拉 */
function clearKeyword() {
  keyword.value = ''
  page.value = 1
  router.replace({ path: '/' })
  loadPosts(false)
}
function scrollToFeed() {
  const el = document.getElementById('feed')
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

/** 卡片上那行「简谱预览」：从**内核导出的简谱原文**里取一小段**谱行**。
    内核原文（唯一真源）是 `title: …\nkey: …\n…\n\nM: 1 1 5 5 | …` 这样的多行文本，
    直接 slice 前 16 个字符只会拿到头部行，所以先定位谱行标记 M:。 */
function scoreExcerpt(score) {
  const src = score && score.source
  if (!src) return ''
  const s = String(typeof src === 'string' ? src : src.jianpuText || '')
  const m = s.match(/M:\s*([^\n]*)/)
  return (m ? m[1] : s).trim().slice(0, 16)
}

/* 本周精选（GET /api/hot?limit=3）。
   谱面预览/键数/难度取内部扩展 score —— 正式版由 GET /api/posts/{id} 的 score 扩展返回。
   真实数据下 DB 里没有对应 id，取不到就退化成默认值（与 V3 行为一致）。 */
async function loadFeatured() {
  /* ★ 2026-10-14：本周精选改 **4 列**（与信息流同列数），取数同步由 3 条改 4 条 ——
     否则 4 列下第 4 格永远空着，看着像少了一张。 */
  const r = await api.hot.list(4)
  if (r.code !== 0) return
  featured.value = (r.data.list || []).map((h) => {
    const p = DB.posts.find((x) => x.id === h.postId) || {}
    return {
      postId: h.postId,
      title: h.title,
      keys: (p.score && p.score.meta) ? p.score.meta.kalimbaType : 17,
      level: (p.tags && p.tags[0] && p.tags[0].name) || '入门',
      notes: scoreExcerpt(p.score),
      authorName: (h.author && h.author.nickname) || ''
    }
  })
}

/* 标签（GET /api/tags）——同时供「标签筛选 chips」与「热门话题」使用 */
async function loadTags() {
  const r = await api.tags.list()
  if (r.code !== 0) return
  tags.value = r.data.list || []
}

onMounted(() => {
  loadTags()
  loadFeatured()
  loadPosts(false)
})
</script>

<template>
  <main class="wrap">
    <!-- 签名构图（大幅装饰画右置，音齿由脚本渲染，仅首页使用） -->
    <section class="hero">
      <div>
        <!-- 2026-10-16 用户定稿：主标题「拨给自己听」（原「拨给同好听听」），
             副标题把「简谱」改成更通俗的「琴谱」，其余不动。
             ⚠️ `<br>` 是**断句**，不是排版换行 —— 主标题 32px 衬线，两行各 6~7 字。 -->
        <div class="ht">找喜欢的曲子，<br>拨给自己听。</div>
        <div class="hd">找一份靠谱的卡林巴琴谱，听别人怎么弹，<br>或者亲手制一份谱子发出来。</div>
        <div class="hbtns">
          <button class="btn coral" type="button" @click="router.push('/composer')">去制谱</button>
          <button class="btn ghost" type="button" @click="scrollToFeed">逛逛琴谱</button>
        </div>
        <div class="demo-note"><i></i>谱面在本地生成 · 试听为程序合成音</div>
      </div>
      <div class="art" id="hero-art" aria-hidden="true">
        <i v-for="(h, i) in TEETH" :key="i" :style="toothStyle(i, h)"></i>
      </div>
    </section>

    <div class="home-grid">
      <section id="featured">
        <div class="section-h">
          <div class="t">本周精选<small>编辑部挑的谱子</small></div>
        </div>
        <div class="feat-row" id="feat-row">
          <div
            v-for="f in featured"
            :key="f.postId"
            class="feat-card"
            role="button"
            tabindex="0"
            @click="router.push('/post/' + f.postId)"
            @keydown.enter="router.push('/post/' + f.postId)"
          >
            <div class="label">精选谱</div>
            <div class="name">{{ f.title }}</div>
            <div class="notes">{{ f.notes }}</div>
            <div class="meta"><span>{{ f.keys }}键 · {{ f.level }}</span><span>{{ f.authorName }}</span></div>
          </div>
        </div>
      </section>

      <section id="feed">
        <div class="section-h">
          <div class="t">琴谱<small>大家刚发的</small></div>
        </div>

        <div class="chips" id="sort-chips">
          <button class="chip" :class="{ on: sort === '' }" type="button" @click="pickSort('')">最新</button>
          <button class="chip" :class="{ on: sort === 'hot' }" type="button" @click="pickSort('hot')">热门</button>
          <button class="chip" :class="{ on: sort === 'mostLiked' }" type="button" @click="pickSort('mostLiked')">最多点赞</button>
        </div>

        <div class="chips" id="tag-chips">
          <button class="chip" :class="{ on: tagId === '' }" type="button" @click="pickTag('')">全部</button>
          <button
            v-for="t in tags"
            :key="t.id"
            class="chip"
            :class="{ on: tagId === String(t.id) }"
            type="button"
            @click="pickTag(String(t.id))"
          >{{ t.name }} · {{ t.postCount }}</button>
        </div>

        <div v-if="keyword" class="search-hint" id="search-hint" style="display:flex">
          <span>搜索「<b>{{ keyword }}</b>」· 共 {{ total }} 篇</span>
          <button class="sh-clear" type="button" @click="clearKeyword">清除</button>
        </div>

        <!-- ★ 2026-10-11：两列横卡 → 三列竖向大图卡（与广场、用户中心同一套卡）。
             ★ 2026-10-14：容器加宽到 1400、本列表改 **4 列**（`cols-4`）—— 主列 1024 ⇒ 卡宽 244，
               与改前的 237 差 3%，即「卡宽不变、把两边的空位用来多加一列」。
             ⚠️ 容器保留了 `id="post-list"`：`web_vue_smoke.js` 拿它当首页的签名元素。 -->
        <div class="card-grid cols-4" id="post-list">
          <PostCardBig v-for="p in posts" :key="p.id" :post="p" />
        </div>

        <div class="pager">
          <button v-if="hasMore" class="btn ghost sm" id="more-btn" type="button" @click="loadMore">加载更多</button>
        </div>
      </section>

      <aside>
        <div class="side-card">
          <div class="st">在线制谱</div>
          <div class="sd">数字键录入简谱，随手试听校对，写完直接发布成谱帖。</div>
          <button class="btn coral sm" style="width:100%" type="button" @click="router.push('/composer')">打开制谱器</button>
        </div>
        <div class="side-card">
          <div class="st">热门话题</div>
          <div id="topic-chips">
            <span
              v-for="t in tags.slice(0, 4)"
              :key="t.id"
              class="topic-chip"
              @click="pickTag(String(t.id))"
            ># {{ t.name }}</span>
          </div>
        </div>
        <div class="side-card">
          <div class="st">社区约定</div>
          <div class="sd" style="margin-bottom:0">分享真实的谱子与心得；转载注明出处；友好交流，不抬杠。</div>
        </div>
      </aside>
    </div>
  </main>
</template>
