<script setup>
/* 顶部导航（全站共用）—— 对应 V3 `renderHeader(active)`
   布局：[品牌][导航(…我的)] ⟨留白⟩ [搜索] ⟨留白⟩ [消息][头像]
   搜索框夹在「我的」与「消息」之间，两侧 .grow 等分剩余空间。
   与 V3 的差异只有一处：SPA 里路由切换不刷新页面，所以把「未读红点刷新」
   挂到路由变化上 —— 等效于 V3 每次整页导航都重查一次的行为。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { SearchHistory } from '@/shared/searchHistory'
import { ICONS } from '@/shared/icons'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const noti = useNotificationStore()

/* ★ 2026-10-16：把顶栏的**实际高度**同步到 CSS 变量 `--topnav-h`。
   为什么需要：窄屏（≤1080）顶栏会变成**两行**（64px → 约 108px），而有两处布局
   以前写死了 `calc(100vh - 64px)`（制谱页的 iframe、登录页的居中）——
   写死的话窄屏下 iframe 底部会被顶出视口。
   为什么用 ResizeObserver 而不是监听 window.resize：字体加载完成、登录态切换
   （顶栏多出上传/通知/头像三个按钮）都会改变顶栏高度，而窗口尺寸没变 ——
   只有直接观察元素本身才跟得住。 */
const navEl = ref(null)
let navRo = null

const keyword = ref(String(route.query.keyword || ''))
const history = ref(SearchHistory.get())

const active = computed(() => {
  switch (route.name) {
    case 'home': return 'index'
    case 'works': return 'works'
    case 'composer': return 'composer'
    case 'user': return 'user'
    case 'admin': return 'admin'
    default: return ''
  }
})

/* 顶栏搜索提交：回车 / 点图标 → 进综合搜索页，关键词带在 query 上 */
function submitSearch() {
  const q = keyword.value.trim()
  router.push({ path: '/search', query: q ? { keyword: q } : {} })
}

watch(() => route.fullPath, () => {
  keyword.value = String(route.query.keyword || '')
  history.value = SearchHistory.get()
  if (auth.isLogin) noti.refresh()
})

onMounted(() => {
  if (auth.isLogin) noti.refresh()
  /* 顶栏实际高度 → CSS 变量（见上面 navEl 的说明） */
  if (navEl.value && typeof ResizeObserver !== 'undefined') {
    const apply = () => {
      if (navEl.value) document.documentElement.style.setProperty('--topnav-h', navEl.value.offsetHeight + 'px')
    }
    navRo = new ResizeObserver(apply)
    navRo.observe(navEl.value)
    apply()
  }
})

onBeforeUnmount(() => { if (navRo) { navRo.disconnect(); navRo = null } })
</script>

<template>
  <header class="topnav">
    <div class="in" ref="navEl">
      <span class="brand" role="link" tabindex="0" @click="router.push('/')" @keydown.enter="router.push('/')">
        <span class="brandmark">谷</span>
        <span><span class="name">拇指琴谷</span><br><span class="sub">卡林巴琴谱社区</span></span>
      </span>

      <nav class="navlinks">
        <RouterLink to="/" :class="{ on: active === 'index' }">琴谱</RouterLink>
        <RouterLink to="/works" :class="{ on: active === 'works' }">作品广场</RouterLink>
        <RouterLink to="/composer" :class="{ on: active === 'composer' }">在线制谱</RouterLink>
        <!-- ⚠️ 判据用 auth.user 而不是 auth.isLogin：isLogin 只保证「有令牌」，
             半截会话（有 token 没 user）时 auth.user 仍是 null，取 .id 会抛错 → 整页空白。
             见 stores/auth.js 的说明。 -->
        <RouterLink :to="auth.user ? `/user/${auth.user.id}` : '/login'" :class="{ on: active === 'user' }">我的</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin" :class="{ on: active === 'admin' }">管理</RouterLink>
      </nav>

      <span class="grow"></span>

      <form class="navsearch" role="search" @submit.prevent="submitSearch">
        <span class="navsearch-ic" v-html="ICONS.search"></span>
        <input
          id="nav-search-input"
          v-model="keyword"
          type="search"
          placeholder="搜索琴谱…"
          autocomplete="off"
          aria-label="搜索琴谱"
          list="kc-history-list"
        >
      </form>

      <span class="grow"></span>

      <template v-if="auth.user">
        <!-- 2026-10-14 用户要求：登录后在**通知按钮左侧**加「上传」入口（图标 + 「上传」二字）。
             与通知同属 `.iconbtn` 族（同高 38 / 同圆角 / 同 hover 底色），只是带文字、宽度自适应。
             去向 = 发布页 `/publish`；注意与导航里的「在线制谱」不是一回事 ——
             那个进的是制谱工作台，这个才是**发帖 / 上传乐谱**的入口。 -->
        <button class="iconbtn navupload" aria-label="上传" @click="router.push('/publish')">
          <span v-html="ICONS.upload"></span>
          <span class="up-tx">上传</span>
        </button>
        <button class="iconbtn" aria-label="消息通知" @click="router.push('/notifications')">
          <span v-html="ICONS.bell"></span>
          <span v-if="noti.unread > 0" class="bell-dot">{{ noti.unread }}</span>
        </button>
        <RouterLink class="navavatar" :to="`/user/${auth.user.id}`" :title="auth.user.nickname">
          {{ String(auth.user.nickname || '').slice(0, 1) }}
        </RouterLink>
      </template>
      <RouterLink v-else class="btn primary sm" to="/login">登录 / 注册</RouterLink>
    </div>

    <!-- 顶栏搜索框挂本地历史，获得原生自动补全下拉（datalist）——
         不是自定义下拉：省一套键盘/失焦处理，且天然不挡输入。 -->
    <datalist id="kc-history-list">
      <option v-for="k in history" :key="k" :value="k"></option>
    </datalist>
  </header>
</template>
