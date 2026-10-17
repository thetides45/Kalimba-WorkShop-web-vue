<script setup>
/* 用户中心 / 个人主页 —— **融合版**（2026-10-11，外观定稿见 `_mock_f10/06-融合版-用户中心.*`）
   一份实现同时服务两种身份，不再分成两个页面：
     · 自己看（isMe）：按钮 = 编辑资料 + 发布谱帖；左菜单多出「我的消息 / 账号设置」
     · 别人看：按钮 = + 关注；左菜单只列 TA 的创作 / 收藏 / 关注 / 粉丝
   版式：封面横幅（头像一半压在封面、一半落到封面下）→ 左竖排菜单 + 右（横排分类页签 + 三列大图卡）。

   ⚠️ 三条踩过的坑，改这里时别踩回去：
   1. 横幅上的文字是**浅色**（压在木色封面上）→ 它们必须落在**封面之内**，
      否则浅色压浅色＝整块消失，而且缩图里看不出来。调 `bottom` 后用几何探针重量（见 v3.css 的注释）。
   2. V3 的 `.profile{display:flex}` 是个陷阱：当年把统计/页签/卡片流一起塞进去，结果全被拉成一排
      （就是 F10）。现在它们是**兄弟节点**，谁都不许再嵌回 `.uc-hero` 里。
   3. 左菜单的「我的关注 / 我的粉丝」后端**没有列表接口**，点了只弹「敬请期待」——
      这是用户 2026-10-11 拍板的（宁愿留位也不做假列表）。 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { handleRes, requireLogin } from '@/shared/res'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useNotificationStore } from '@/stores/notification'
import { ICONS } from '@/shared/icons'
import PostCardBig from '@/components/PostCardBig.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const noti = useNotificationStore()

const uid = computed(() => String(route.params.id || (auth.user ? auth.user.id : '')))
const isMe = computed(() => !!(auth.user && uid.value === auth.user.id))

const profile = ref(null)
/* 加载失败的**持久**提示。没有它的话，`profile` 为 null 时模板会落到
   「正在加载…」那一支 —— 页面就永远转圈，用户只看到一条 3 秒的 toast。 */
const loadError = ref('')

/** 左菜单选中的**分区**：创作 / 收藏 */
const section = ref('posts')
/** 横排页签选中的**分类**（标签 id，'' = 全部） */
const cat = ref('')
/** 当前分区**未按分类过滤**的完整列表 */
const allPosts = ref([])

const showEdit = ref(false)
const editForm = reactive({ nickname: '', intro: '', fanType: 17 })

/* 封面装饰：与 mockup 逐项一致（确定性图案，不用随机） */
const DOTS = 24
const TINES = Array.from({ length: 22 }, (_, i) => 28 + Math.round(56 * Math.abs(Math.sin(i * 0.62)) + i * 1.1))

const stats = computed(() => {
  const p = profile.value || {}
  return [
    { label: '发布谱帖', value: p.postCount || 0 },
    { label: '粉丝', value: p.followerCount || 0 },
    { label: '关注', value: p.followingCount || 0 },
    /* ⚠️ 这两项后端**没有对应字段**（UserService 的 profile 只给上面三个）。
       用户 2026-10-11 明确要求「保留」这两格 → 先占位成 —，等后端加聚合再填真数。
       别自己拿帖子 likeCount 求和顶上：那只是当前页的和，会给出一个看着真、其实错的数。 */
    { label: '获赞', value: '—' },
    { label: '浏览', value: '—' }
  ]
})

/* 横排分类页签：**计数由已加载的列表本地算**（后端没有「某用户某标签下有几篇」的聚合接口）。
   ⚠️ 别拿首页那套 `GET /api/tags` 的 postCount 顶上 —— 那是**全站**计数，不是这个人的。 */
const catTabs = computed(() => {
  const m = new Map()
  for (const p of allPosts.value) {
    for (const t of (p.tags || [])) {
      const e = m.get(t.id)
      if (e) e.n++
      else m.set(t.id, { id: t.id, name: t.name, n: 1 })
    }
  }
  return [...m.values()]
})

const visiblePosts = computed(() => (cat.value
  ? allPosts.value.filter((p) => (p.tags || []).some((t) => t.id === cat.value))
  : allPosts.value))

const sectionLabel = computed(() => (isMe.value ? '我的' : 'TA 的'))
const menuItems = computed(() => {
  const items = [
    { key: 'posts', text: sectionLabel.value + '创作', n: (profile.value && profile.value.postCount) || 0 },
    { key: 'favs', text: sectionLabel.value + '收藏', n: 0 },
    { sep: true },
    { key: 'followees', text: sectionLabel.value + '关注', n: 0 },
    { key: 'followers', text: sectionLabel.value + '粉丝', n: 0 }
  ]
  if (isMe.value) {
    items.splice(2, 0, { key: 'noti', text: '我的消息', n: noti.unread })
    items.push({ sep: true }, { key: 'setting', text: '账号设置', n: 0 })
  }
  return items
})

async function loadProfile() {
  loadError.value = ''
  const r = await api.users.profile(uid.value)
  if (!handleRes(r, '用户信息加载失败')) {
    /* 后端把「不存在」与「已被封禁」拆成了两个码（B16，2026-10-10）：
       1002 = 没这个人；2004 = 账号已被封禁。这里落成两句人话。 */
    loadError.value = (r && r.code === 2004) ? '该账号已被封禁'
      : (r && r.code === 1002) ? '找不到这位琴友'
        : '用户信息加载失败'
    return
  }
  profile.value = r.data
}

async function loadSection() {
  if (section.value === 'favs') {
    /* GET /api/users/me/favorites：该端点在 V3 就未接后端（走 mock），此处保持一致 */
    const r = await api.users.myFavorites()
    if (!handleRes(r, '收藏加载失败')) return
    allPosts.value = r.data.list || []
  } else {
    /* GET /api/posts?userId={id} —— userId 走**服务端**过滤 */
    const r = await api.posts.list({ userId: uid.value })
    if (!handleRes(r, '谱帖加载失败')) return
    allPosts.value = r.data.list || []
  }
  cat.value = ''
}

function pickSection(key) {
  if (key === 'noti') { router.push('/notifications'); return }
  if (key === 'setting') { openEdit(); return }
  if (key === 'followees' || key === 'followers') {
    /* 后端没有关注/粉丝列表接口，也没做页面 —— 留位但明确告知（用户 2026-10-11 定的口径） */
    ui.toast('敬请期待')
    return
  }
  if (section.value === key) return
  section.value = key
  loadSection()
}

async function toggleFollow() {
  if (!requireLogin('/user/' + uid.value)) return
  const on = !profile.value.isFollowing
  const r = await api.users.follow(uid.value, on)
  if (!handleRes(r)) return
  profile.value.isFollowing = on
  /* 关注数本地 ±1：后端 `POST/DELETE /follow` 只回 code，不回头部统计 */
  profile.value.followerCount = Math.max(0, (profile.value.followerCount || 0) + (on ? 1 : -1))
  ui.toast(on ? '已关注 ' + profile.value.nickname : '已取消关注')
}

function openEdit() {
  if (!profile.value) return
  editForm.nickname = profile.value.nickname || ''
  editForm.intro = profile.value.intro || ''
  editForm.fanType = profile.value.fanType === 21 ? 21 : 17
  showEdit.value = true
}

async function saveEdit() {
  if (!editForm.nickname.trim()) { ui.toast('昵称不能为空'); return }
  const r = await api.users.editMe({
    nickname: editForm.nickname.trim(),
    intro: editForm.intro.trim(),
    fanType: editForm.fanType
  })
  if (!handleRes(r, '保存失败')) return
  auth.patchUser(r.data || {})
  showEdit.value = false
  await loadProfile()
  ui.toast('资料已更新')
}

/**
 * 退出登录。
 *
 * <p>本项目是**无状态 JWT**（Sa-Token 的 jwt-simple 模式，令牌只放在 `sa-token` 请求头里，
 * 服务端不存会话、也没有 /api/auth/logout 接口），所以「退出」的实质就是**清掉本机的登录态**：
 * `auth.clear()` 同时清 Pinia 与 `localStorage.kc_auth`。
 *
 * <p>⚠️ 清的是「本机这一份」，不是让令牌失效 —— 令牌在有效期内仍可使用。
 * 要做到服务端注销，得再加 token 黑名单，那是另一件事。
 */
async function doLogout() {
  const ok = await ui.confirm('退出后需要重新登录才能发布谱帖、查看消息。确定退出吗？', '退出登录')
  if (!ok) return
  auth.clear()
  /* 未读数是跟着账号走的，不清会在下次登录时短暂显示上一个账号的角标 */
  try { noti.$reset() } catch (e) { /* ignore */ }
  showEdit.value = false
  ui.toast('已退出登录')
  router.push('/login')
}

function init() {
  if (!uid.value) return
  section.value = 'posts'
  cat.value = ''
  loadProfile()
  loadSection()
}

onMounted(init)
/* SPA 内从「A 用户页」跳到「B 用户页」时组件会被复用，必须跟着参数重载 */
watch(uid, init)
</script>

<template>
  <main class="wrap" id="user-main">
    <!-- 未登录且未指定用户 → 引导登录（个人主页为需鉴权页面，文档 §1.2） -->
    <div v-if="!uid" class="empty-state">
      <span v-html="ICONS.user"></span>
      <div class="t">登录后查看你的主页</div>
      <div class="d">登录后可以管理谱帖、查看收藏与关注动态。</div>
      <div class="btns"><RouterLink class="btn primary" to="/login">登录 / 注册</RouterLink></div>
    </div>

    <template v-else-if="profile">
      <!-- ① 封面横幅：头像一半压在封面、一半落到封面下 -->
      <section class="uc-hero">
        <div class="uc-cover">
          <div class="wm">KALIMBA</div>
          <div class="wm2">拇指琴谷</div>
          <div class="dots" aria-hidden="true"><s v-for="i in DOTS" :key="i"></s></div>
          <div class="uc-tines" aria-hidden="true"><i v-for="(h, i) in TINES" :key="i" :style="{ height: h + 'px' }"></i></div>
        </div>
        <span class="uc-avatar">{{ String(profile.nickname || '').slice(0, 1) }}</span>
        <div class="uc-id">
          <div>
            <div class="uc-name">
              {{ profile.nickname }}<span v-if="profile.fanType" class="p-fan">{{ profile.fanType }} 键</span>
            </div>
            <div class="uc-who">{{ profile.intro || '这位琴友还没有填写简介' }} · @{{ profile.username }}</div>
          </div>
          <span class="uc-vline" aria-hidden="true"></span>
          <div class="uc-stats">
            <div v-for="s in stats" :key="s.label" class="uc-stat">
              <span>{{ s.label }}</span><b>{{ s.value }}</b>
            </div>
          </div>
        </div>
        <div class="uc-act">
          <template v-if="isMe">
            <button class="btn bare sm" id="btn-edit" type="button" @click="openEdit">编辑资料</button>
            <button class="btn primary sm" type="button" @click="router.push('/publish')">发布谱帖 &rsaquo;</button>
          </template>
          <button
            v-else
            class="btn sm"
            :class="profile.isFollowing ? 'ghost' : 'primary'"
            id="btn-follow"
            type="button"
            @click="toggleFollow"
          >{{ profile.isFollowing ? '已关注' : '+ 关注' }}</button>
        </div>
      </section>

      <!-- ② 左竖排菜单 + 右（横排分类页签 + 三列大图卡） -->
      <div class="uc-body">
        <aside class="uc-nav" id="user-nav">
          <template v-for="(it, i) in menuItems" :key="i">
            <div v-if="it.sep" class="sep"></div>
            <button
              v-else
              class="mi"
              :class="{ on: section === it.key && it.key !== 'noti' && it.key !== 'setting' }"
              :data-menu="it.key"
              type="button"
              @click="pickSection(it.key)"
            >{{ it.text }}<span v-if="it.n" class="n">{{ it.n }}</span></button>
          </template>
        </aside>

        <section>
          <!-- 横排分类页签（原来是左竖排，2026-10-11 改成打横，照「我的消息」那条） -->
          <nav class="uc-tabs" id="user-tabs">
            <button type="button" class="uc-tab" :class="{ on: cat === '' }" data-cat="" @click="cat = ''">
              全部 <b>{{ allPosts.length }}</b>
            </button>
            <button
              v-for="t in catTabs"
              :key="t.id"
              type="button"
              class="uc-tab"
              :class="{ on: cat === t.id }"
              :data-cat="t.id"
              @click="cat = t.id"
            >{{ t.name }} <b>{{ t.n }}</b></button>
          </nav>

          <!-- ★ 2026-10-14：**4 列**（用户：「我的收藏也要 4 列」）。创作与收藏共用这一处栅格，
               所以两个分区都是 4 列。栅格区宽 1432 = 4×346+3×16 ⇒ 卡宽与首页/广场一致。 -->
          <div class="card-grid cols-4" id="user-posts">
            <PostCardBig v-for="p in visiblePosts" :key="p.id" :post="p" />
          </div>
          <div v-if="!visiblePosts.length" class="empty-tip">
            {{ section === 'favs'
              ? (isMe ? '收藏夹还是空的，去广场逛逛吧。' : 'TA 还没有收藏。')
              : (isMe ? '你还没有发过谱帖。' : 'TA 还没有发过谱帖。') }}
          </div>
        </section>
      </div>
    </template>

    <!-- 加载失败：把后端的 1002 / 2004 落成页面里的持久提示（见 loadProfile 的说明）。
         ⚠️ 必须放在「正在加载…」之前，否则失败时会一直转圈。 -->
    <div v-else-if="loadError" class="empty-state" id="user-error">
      <span v-html="ICONS.user"></span>
      <div class="t">{{ loadError }}</div>
      <div class="d">可能链接有误，或该账号已不可访问。</div>
      <div class="btns"><RouterLink class="btn primary" to="/works">去作品广场逛逛</RouterLink></div>
    </div>

    <div v-else class="empty-tip">正在加载…</div>

    <!-- 编辑资料弹层（PUT /api/users/me：昵称 / 简介 / 键数） -->
    <div v-if="showEdit" class="overlay show" @click.self="showEdit = false">
      <div class="modal" role="dialog" aria-label="编辑资料">
        <div class="m-h">编辑资料</div>
        <div class="field-inline">
          <label for="e-nick">昵称</label>
          <input id="e-nick" v-model="editForm.nickname" maxlength="20">
        </div>
        <div class="field-inline">
          <label for="e-intro">简介</label>
          <input id="e-intro" v-model="editForm.intro" maxlength="60" placeholder="一句话介绍你和你的琴">
        </div>
        <div class="field-inline">
          <label>我的琴</label>
          <div class="seg" id="e-fan">
            <button type="button" :class="{ on: editForm.fanType !== 21 }" @click="editForm.fanType = 17">17键</button>
            <button type="button" :class="{ on: editForm.fanType === 21 }" @click="editForm.fanType = 21">21键</button>
          </div>
        </div>

        <!-- 退出登录：无状态 JWT，退出即清掉本机登录态（详见 doLogout 的说明） -->
        <div class="modal-sep" aria-hidden="true"></div>
        <div class="logout-row">
          <div class="lo-text">
            <b>退出登录</b>
            <span>退出后需重新登录才能发布谱帖、查看消息</span>
          </div>
          <button class="btn ghost sm btn-logout" id="btn-logout" type="button" @click="doLogout">退出</button>
        </div>

        <div class="m-btns">
          <button class="btn ghost" type="button" @click="showEdit = false">取消</button>
          <button class="btn primary" type="button" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
/* 这个弹层用的是 .modal 的通用外壳，但标题与按钮行一直没有样式：
   `.m-h` / `.m-btns` 在 v3.css 里根本不存在（V3 时代的类名残留），
   结果标题是默认字号、两个按钮紧贴在一起。这里补齐，只作用于本组件。 */
.m-h {
  font-family: var(--serif);
  font-size: 19px;
  font-weight: 600;
  color: var(--wood-deep);
  text-align: center;
  margin-bottom: 20px;
}

.m-btns {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.modal-sep {
  height: 1px;
  background: var(--hairline);
  margin: 18px 0 16px;
}

.logout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.logout-row .lo-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.logout-row .lo-text b {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}

.logout-row .lo-text span {
  font-size: 12px;
  color: var(--ink-3);
}

.btn-logout {
  flex: none;
  color: var(--coral-deep);
  border-color: #F2D9CD;
}

.btn-logout:hover {
  border-color: var(--coral);
}
</style>
