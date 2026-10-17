<script setup>
/* 帖子详情 —— 对应 V3 `web/post.html`（本项目最复杂的一页）
   关键顺序（V3 反复踩过的地方，务必保留）：
     ① 乐谱区**先问后端「我能不能看」**（GET /api/files/{id}/meta → `viewable`），
        再决定渲染谱面还是锁定提示 —— 反过来会被本地演示谱面盖掉锁定态，权限形同虚设。
        ⚠️ 2026-10-13 起**查看与下载是两套口径**：`login` 档（默认）匿名也能**看**谱、能试听，
        但**下载**仍要登录 —— 所以这里判的是 `viewable`，**不是** `downloadable`。
        内容用 `GET /api/files/{id}/content`（公开只读）取，不再借用下载接口。
     ② 锁定态的文案一律用后端给的 reason，解锁动作也由后端 needsFollow / needsFavorite
        给出（两者互斥），前端不自己推 —— 否则两边口径必然漂。
     ③ 「下载乐谱 JSON」不能用 <a href>：附件接口要带 sa-token 自定义头，
        <a> 发不出请求头，只能 fetch → Blob → 触发下载。
     ④ 谱面不再是本页自绘的简化网格，而是 <ScorePreview> —— **复用制谱内核**
        （iframe 承载 public/composer.html，渲染 / 播放 / 进度条都是内核本尊）。
        数据只认内核导出的 `source`（简谱原文），理由见 ScorePreview.vue 顶部说明。 */

import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { DB } from '@/api/mock'
import { handleRes, requireLogin } from '@/shared/res'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ICONS } from '@/shared/icons'
import ScorePreview from '@/components/ScorePreview.vue'
import BlockRenderer from '@/components/BlockRenderer.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const postId = computed(() => String(route.params.id || ''))
const post = ref(null)
const score = ref(null)
const hasScore = ref(false)
const scoreVisLabel = ref('')
const lockReason = ref('')
const lockNeedsFollow = ref(false)
const lockNeedsFavorite = ref(false)

const comments = ref([])
const cmtInput = ref('')

const loggedIn = computed(() => auth.isLogin)

/* 老帖子的正文当**纯文本**渲染（有 blocks 的走 BlockRenderer）。
   ⚠️ 必须剥掉 HTML 标签：历史数据里确实存过 HTML 片段（例如 `<p>…</p>`），
      直接 `{{ }}` 输出会把标签当字面量显示出来。把 `</p>` / `<br>` 换成换行，段落的呼吸感还在。
   ⚠️ 这是「只读展示」的清洗，**不是安全防线** —— 安全来自"这段文本不经 v-html"这件事本身。 */
const plainContent = computed(() => {
  const raw = post.value && post.value.content
  if (!raw) return ''
  return String(raw)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
})

/* ---------- 帖子状态提示条（2026-10-14） ----------
   作者打开自己的**未发布**帖时给一条明示 —— 否则「草稿」在页面上跟已发布长得一模一样，
   很容易以为已经发出去了。
   ⚠️ 这条天然只对作者与管理员出现：非正常态对其他人，后端直接返回 404（不区分「不存在」与「无权看」）。 */
const publishing = ref(false)

/* ★ 2026-10-14：帖子顶部封面图。
   数据其实**一直在库里** —— `post.cover` 从 2026-10-03 起就能正常存（列表卡也一直在用它），
   只是 `api.posts.detail()` 的返回映射漏了这个字段，所以详情页从来拿不到、也就没显示过。
   映射已在同批补上（见 api/index.js 的 detail()），这里只负责渲染。
   ⚠️ 加载失败要退回「整块不显示」，而不是留个破图 —— cover 可能指向已被清理的旧文件。 */
const coverOk = ref(true)
watch(() => post.value && post.value.cover, () => { coverOk.value = true })
const showCover = computed(() => !!post.value && !!post.value.cover && coverOk.value)

const statusNote = computed(() => {
  const st = post.value ? Number(post.value.status) : 1
  if (st === 3) return { cls: 'draft', title: '草稿', desc: '仅你自己可见 —— 发布之后琴友才能看到。', canPublish: true }
  if (st === 0) return { cls: 'pending', title: '审核中', desc: '管理员审核通过后才会公开显示。', canPublish: false }
  if (st === 2) return { cls: 'banned', title: '已下架', desc: '这篇帖子已被下架，目前只有你与管理员能看到。', canPublish: false }
  return null
})

/* 草稿 → 发布：走**作者侧**接口（只收 1 / 3），不是管理端那条 requireAdmin 的。 */
async function publishNow() {
  publishing.value = true
  const r = await api.posts.setStatus(post.value.id, 1)
  publishing.value = false
  if (!handleRes(r, '发布失败')) return
  ui.toast('已发布')
  await load()
}

/** 谱面标题：优先乐谱元信息（内核 `title`），回退帖子标题 */
const scoreTitle = computed(() =>
  (score.value && score.value.meta && score.value.meta.songTitle) || (post.value && post.value.title) || ''
)

/** 内嵌预览要的**简谱原文**（组件把它灌回内核，由内核自己生成琴谱）。
     · 内核导出格式：顶层 `source` 是字符串
     · 页面形状（normalizeScore 产出）：`source.jianpuText`
    两者内容都是内核原文 —— 格式以内核为唯一真源。 */
const scoreSource = computed(() => {
  const s = score.value
  if (!s) return ''
  const src = s.source
  if (typeof src === 'string') return src
  return (src && src.jianpuText) || ''
})

/** 作者 / 管理员判定 —— 「编辑」「删除」与「删除评论」的显示依据 */
const isOwner = computed(() => {
  const a = auth.user
  if (!a || !post.value) return false
  return String(a.id) === String(post.value.author.id) || a.role === 'admin'
})
function canDeleteComment(c) {
  const a = auth.user
  if (!a) return false
  return String(c.user.id) === String(a.id) || a.role === 'admin'
}

/** 锁定态（谱面**看不了**时）—— 解锁动作由后端 needsFollow / needsFavorite 指定 */
const lock = computed(() => {
  const unlock = !loggedIn.value
    ? ''
    : (lockNeedsFollow.value ? 'follow' : (lockNeedsFavorite.value ? 'favorite' : ''))
  /* 罕见边界：一份附件被多篇帖引用时，「已收藏过本帖」仍可能看不了 —— 条件挂在另一篇帖上。
     这时再给「收藏」按钮会点不动（点了也不解锁，刷新回来还是锁定），所以只说清原因。 */
  const favAlready = unlock === 'favorite' && !!(post.value && post.value.isFavorited)
  /* 文案一律用后端给的 `viewReason` —— 它已按「是否登录 / 该收藏还是该关注」分好口径，
     前端再自己拼一遍必然与后端漂（例如匿名 + favorite 档要说「登录并收藏」）。 */
  const desc = lockReason.value || '该乐谱暂不可查看。'
  const btn = !loggedIn.value
    ? 'login'
    : unlock === 'follow'
      ? 'follow'
      : (unlock === 'favorite' && !favAlready) ? 'favorite' : ''
  return { unlock, favAlready, desc, btn }
})

const kindChip = computed(() => {
  const m = score.value && score.value.meta
  if (m && m.kalimbaType) return m.kalimbaType + '键'
  return (post.value && post.value.scoreFile && post.value.scoreFile.fileId) ? '乐谱' : '图文'
})

const subParts = computed(() => {
  const m = (score.value && score.value.meta) || {}
  const arr = []
  if (m.kalimbaType) arr.push(m.kalimbaType + '键')
  if (m.key) arr.push(m.key + '调')
  if (m.bpm) arr.push(m.bpm + ' BPM')
  /* 谱面由内核渲染，出来的是「简谱 → 拇指琴专用谱」，不再是简谱示意 */
  arr.push('拇指琴谱')
  return arr
})

/* ---------------- 加载 ---------------- */
async function load() {
  const res = await api.posts.detail(postId.value)
  if (!handleRes(res, '帖子加载失败')) {
    if (res.code === 40400) router.replace('/404')
    return
  }
  const p = res.data
  post.value = p
  document.title = p.title + ' · 拇指琴谷'

  score.value = null
  hasScore.value = false
  scoreVisLabel.value = ''
  lockReason.value = ''
  lockNeedsFollow.value = false
  lockNeedsFavorite.value = false

  const dbp = DB.posts.find((x) => x.id === p.id) || {}
  if (p.scoreFile && p.scoreFile.fileId) {
    hasScore.value = true
    const mr = await api.files.meta(p.scoreFile.fileId)
    if (mr.code === 0) {
      scoreVisLabel.value = mr.data.visibilityLabel || ''
      /* ★ 先判「能不能看」：查看与下载是两套口径 —— login 档（默认）匿名也能看并试听，
         所以判的是 `viewable`，**不是** `downloadable`（后者决定下载按钮点下去的结果）。 */
      if (mr.data.viewable) {
        const fr = await api.files.view(p.scoreFile.fileId)
        if (fr.code === 0 && fr.data) score.value = fr.data
        else lockReason.value = fr.message || '乐谱读取失败'
      } else {
        lockReason.value = mr.data.viewReason || '该乐谱暂不可查看'
        lockNeedsFollow.value = mr.data.needsFollow
        lockNeedsFavorite.value = mr.data.needsFavorite
      }
    } else {
      /* meta 已公开（匿名也能读），走到这里基本只剩「附件不存在」这类硬错 */
      lockReason.value = mr.message || ''
    }
  } else {
    /* 没有附件的图文帖：仍可回退本地演示数据 */
    score.value = dbp.score || null
  }

  loadComments()
}

async function loadComments() {
  const r = await api.posts.comments(postId.value)
  if (!handleRes(r, '评论加载失败')) return
  comments.value = r.data.list || []
}

/* ---------------- 作者操作 ---------------- */
async function editPost() {
  router.push('/publish/' + post.value.id)
}
async function removePost() {
  if (!(await ui.confirm('确认删除《' + post.value.title + '》？此操作不可恢复。'))) return
  const r = await api.posts.remove(post.value.id)
  if (!handleRes(r, '删除失败')) return
  ui.toast('帖子已删除')
  setTimeout(() => {
    router.push(auth.user ? '/user/' + auth.user.id : '/works')
  }, 700)
}

/* ---------------- 互动 ---------------- */
async function like() {
  if (!requireLogin('/post/' + postId.value)) return
  const on = !post.value.isLiked
  const r = await api.posts.like(post.value.id, on)
  if (!handleRes(r)) return
  post.value.isLiked = on
  post.value.likeCount += on ? 1 : -1
  ui.toast(on ? '已点赞' : '已取消点赞')
}
async function favorite() {
  if (!requireLogin('/post/' + postId.value)) return
  const on = !post.value.isFavorited
  const r = await api.posts.favorite(post.value.id, on)
  if (!handleRes(r)) return
  post.value.isFavorited = on
  ui.toast(on ? '已加入收藏夹' : '已取消收藏')
}
async function lockFollow() {
  const r = await api.users.follow(post.value.author.id, true)
  if (!handleRes(r, '关注失败')) return
  ui.toast('已关注，正在解锁乐谱…')
  location.reload()
}
async function lockFavorite() {
  const r = await api.posts.favorite(post.value.id, true)
  if (!handleRes(r, '收藏失败')) return
  ui.toast('已收藏，正在解锁乐谱…')
  location.reload()
}
async function report() {
  if (!requireLogin('/post/' + postId.value)) return
  const reason = await ui.prompt('请简述举报原因（将提交给管理员处理）：', '举报这篇帖', '例如：盗用他人谱子 / 内容违规')
  if (!reason) return
  const r = await api.reports.submit({ targetType: 'post', targetId: post.value.id, reason })
  if (!handleRes(r, '举报提交失败')) return
  ui.toast('举报已提交，感谢你的反馈')
}
/* ★ 查看 ≠ 下载：谱面对所有人可见可试听，但**下载源文件**仍要登录 + 满足附件分级。
   未登录先引导登录；已登录但档位不够（收藏 / 关注 / 仅作者）时后端回 5003 + 中文原因，
   由 handleRes 直接展示 —— 前端不自己判档位，否则两边口径会漂。 */
async function downloadScore() {
  if (!requireLogin('/post/' + postId.value)) return
  const r = await api.files.save(post.value.scoreFile.fileId, (post.value.title || 'score') + '.kalimba.json')
  if (!handleRes(r, '下载失败')) return
  ui.toast('已开始下载')
}
function goComments() {
  const el = document.querySelector('.cmt-sec')
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

/* ---------------- 试听 ----------------
   已整体交给内核：播放 / 暂停 / 复位 / 竖向进度条（含按住拖动跳转）都由
   <ScorePreview> 承载的内核在跑 —— 本页不再自绘播放条、不再自己算时长。
   （原来是本页用 shared/jianpu.js 的 Player 逐音 beep + 一条 CSS 进度条，
     只覆盖页面里那几个音格；现在整块谱面都是内核在渲染。） */

/* ---------------- 评论 ---------------- */
async function sendComment() {
  if (!requireLogin('/post/' + postId.value)) return
  const v = cmtInput.value.trim()
  if (!v) { ui.toast('评论内容不能为空'); return }
  const r = await api.posts.addComment(postId.value, { content: v, parentId: null, replyToUserId: null })
  if (!handleRes(r)) return
  cmtInput.value = ''
  ui.toast('评论已发布')
  comments.value.unshift(r.data)
  if (post.value) post.value.commentCount++
}
function replyTo(c) {
  if (!requireLogin('/post/' + postId.value)) return
  cmtInput.value = '回复 @' + c.user.nickname + '：' + cmtInput.value.replace(/^回复 @[^：]+：/, '')
  const el = document.getElementById('cmt-input')
  if (el) el.focus()
}
async function removeComment(c) {
  if (!(await ui.confirm('确认删除这条评论？'))) return
  const r = await api.posts.removeComment(postId.value, c.id)
  if (!handleRes(r, '删除失败')) return
  ui.toast('评论已删除')
  if (post.value && post.value.commentCount > 0) post.value.commentCount--
  await loadComments()
}
function likeComment(c) {
  if (!requireLogin('/post/' + postId.value)) return
  ui.toast('已点赞该评论')
  c.isLiked = true
}

watch(postId, () => {
  load()
}, { immediate: true })
</script>

<template>
  <main class="detail-wrap">
    <div class="backline">
      <button class="iconbtn" aria-label="返回" style="width:32px;height:32px" type="button" @click="router.back()">
        <span v-html="ICONS.back"></span>
      </button>
      <span class="bt">谱帖</span>
      <span class="grow"></span>

      <!-- 作者操作条：编辑（PUT /api/posts/{id}）与删除（DELETE） -->
      <span id="owner-bar">
        <template v-if="isOwner">
          <button class="btn ghost sm" id="edit-btn" type="button" @click="editPost">编辑</button>
          <button class="btn ghost sm" id="del-btn" type="button" @click="removePost">删除</button>
        </template>
      </span>

      <span class="time" id="d-time">{{ post ? post.createdAt : '' }}</span>
      <button class="morebtn" id="report-btn" title="举报" type="button" @click="report">
        <span v-html="ICONS.flag"></span>
      </button>
    </div>

    <div id="detail">
      <div v-if="!post" class="empty-tip">正在打开谱帖…</div>

      <template v-else>
        <!-- ★ 2026-10-14：帖子顶部封面图（正文最上方，与 B 站专栏的封面位一致）。
             数据取后端 `post.cover`；详情接口此前漏映射这个字段，见 script 里的说明。 -->
        <div v-if="showCover" class="d-cover" id="d-cover">
          <img :src="post.cover" alt="" @error="coverOk = false">
        </div>

        <!-- ★ 2026-10-14：未发布态提示（草稿 / 审核中 / 已下架）。
             只有作者与管理员会看到它 —— 别人打开非正常态的帖子拿到的是 404。 -->
        <div v-if="statusNote" class="post-status" :class="statusNote.cls" id="post-status">
          <b>{{ statusNote.title }}</b>
          <span class="ps-desc">{{ statusNote.desc }}</span>
          <button
            v-if="statusNote.canPublish"
            class="btn primary sm"
            id="post-publish"
            type="button"
            :disabled="publishing"
            @click="publishNow"
          >{{ publishing ? '发布中…' : '立即发布' }}</button>
        </div>

        <div class="d-chips">
          <span class="chip key">{{ kindChip }}</span>
          <span v-for="t in post.tags" :key="t.id" class="chip">{{ t.name }}</span>
        </div>

        <!-- ① 可下载 / 有本地演示谱面 → 内嵌内核预览（复用制谱内核，见 ScorePreview.vue） -->
        <div v-if="score" class="score-paper">
          <div class="p-title">《{{ scoreTitle }}》</div>
          <div class="p-sub">{{ subParts.join(' · ') }}</div>

          <ScorePreview v-if="scoreSource" :source="scoreSource" />
          <div v-else class="empty-tip" style="padding:18px 0">这份乐谱没有可渲染的简谱原文。</div>

          <div class="p-tools">
            <span v-if="scoreVisLabel" class="vis-note">下载权限：{{ scoreVisLabel }}</span>
            <button
              v-if="post.scoreFile && post.scoreFile.fileId"
              class="btn ghost sm"
              id="score-dl"
              type="button"
              @click="downloadScore"
            >下载乐谱 JSON</button>
          </div>
        </div>

        <!-- ② 有附件但**看不了** → 锁定态（原因用后端的 viewReason，解锁动作由后端指定） -->
        <div v-else-if="hasScore" class="score-lock">
          <div class="lk-t">{{ loggedIn ? '该乐谱暂不可查看' : '登录后可查看与试听这份乐谱' }}</div>
          <div class="lk-d">{{ lock.desc }}</div>
          <div class="lk-a">
            <RouterLink
              v-if="lock.btn === 'login'"
              class="btn primary sm"
              :to="{ path: '/login', query: { next: '/post/' + post.id } }"
            >去登录</RouterLink>
            <button v-else-if="lock.btn === 'follow'" class="btn primary sm" id="lock-follow" type="button" @click="lockFollow">关注作者</button>
            <button v-else-if="lock.btn === 'favorite'" class="btn primary sm" id="lock-favorite" type="button" @click="lockFavorite">收藏这篇帖</button>
          </div>
        </div>

        <!-- ★ 2026-10-16：正文**不再走 v-html** —— 那是个存储型 XSS 面，也与 `Post.content`
             的设计意图（「前端以安全文本渲染，不做富文本 HTML 透传」）相矛盾。现在两条路：
               · 有 blocks（路线 B）→ BlockRenderer 按 type 渲染，全程 Vue 模板、自动转义；
               · 没有 blocks（老帖子）→ content 当**纯文本**渲染（剥标签 + 保留换行）。 -->
        <BlockRenderer v-if="post.blocks && post.blocks.length" :blocks="post.blocks" />
        <div v-else-if="plainContent" class="intro-p">{{ plainContent }}</div>

        <div class="author-row" @click="router.push('/user/' + post.author.id)">
          <span class="avatar">{{ String(post.author.nickname || '').slice(0, 1) }}</span>
          <div>
            <div class="name">{{ post.author.nickname }}</div>
            <div class="role">琴友 · {{ (DB.users[post.author.id] && DB.users[post.author.id].intro) || '拇指琴谷琴友' }}</div>
          </div>
        </div>

        <div class="d-actions">
          <button class="btn ghost" :class="{ 'fav-on': post.isLiked }" id="like-btn" type="button" @click="like">
            <span v-html="ICONS.like"></span> <span class="cnt-n">{{ post.likeCount }}</span> 点赞
          </button>
          <button class="btn ghost" :class="{ 'fav-on': post.isFavorited }" id="fav-btn" type="button" @click="favorite">
            <span v-html="ICONS.star"></span> <span>{{ post.isFavorited ? '已收藏' : '收藏' }}</span>
          </button>
          <button class="btn ghost" id="go-cmt" type="button" @click="goComments">
            评论 <span class="cnt-n">{{ post.commentCount }}</span>
          </button>
        </div>

        <section class="cmt-sec">
          <div class="section-h">
            <div class="t">评论<small id="cmt-n">{{ post.commentCount }} 条</small></div>
          </div>

          <div class="cmt-form">
            <textarea id="cmt-input" v-model="cmtInput" placeholder="友善交流，聊聊你的练习心得…"></textarea>
            <div class="foot">
              <span class="hint">请友善交流 · 演示模式评论仅本地保存</span>
              <span class="grow" style="flex:1"></span>
              <button class="btn primary sm" id="cmt-send" type="button" @click="sendComment">发表评论</button>
            </div>
          </div>

          <div class="cmt-list" id="cmt-list">
            <div v-for="c in comments" :key="c.id" class="cmt-item">
              <span class="avatar">{{ String(c.user.nickname || '').slice(0, 1) }}</span>
              <div class="body">
                <div class="who">
                  {{ c.user.nickname }}
                  <span v-if="c.replyToUser" class="reply-to">回复 @{{ c.replyToUser.nickname }}</span>
                </div>
                <div class="txt">{{ c.content }}</div>
                <div class="tools">
                  <span>{{ c.createdAt }}</span>
                  <button class="cmt-like" :class="{ liked: c.isLiked }" type="button" @click="likeComment(c)">
                    <span v-html="ICONS.like"></span> 赞 · {{ c.likeCount }}
                  </button>
                  <button class="cmt-reply" type="button" @click="replyTo(c)">回复</button>
                  <button v-if="canDeleteComment(c)" class="cmt-del" title="删除这条评论" type="button" @click="removeComment(c)">删除</button>
                </div>

                <div v-if="c.replies && c.replies.length" class="cmt-replies">
                  <div v-for="rc in c.replies" :key="rc.id" class="cmt-item">
                    <span class="avatar">{{ String(rc.user.nickname || '').slice(0, 1) }}</span>
                    <div class="body">
                      <div class="who">
                        {{ rc.user.nickname }}
                        <span v-if="rc.replyToUser" class="reply-to">回复 @{{ rc.replyToUser.nickname }}</span>
                      </div>
                      <div class="txt">{{ rc.content }}</div>
                      <div class="tools"><span>{{ rc.createdAt }}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="!comments.length" class="cmt-empty empty-tip">还没有评论，来说第一句吧。</div>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
/* 乐谱区不再是「自绘谱面的米色纸张」，而是**内嵌内核预览**的承载位：
   把 .score-paper 的纸张底 / 边框 / 阴影剥掉，只留标题与副标题的排版。
   ⚠️ 保留类名是因为 .p-title / .p-sub 的样式写在 v3.css 的 `.score-paper .p-title` 下；
      带 scoped 属性后选择器优先级更高，才压得过 v3.css 的同名规则——
      hover 那条（`.score-paper:hover`）也要一并盖掉，否则鼠标移上去又冒出阴影。 */
.score-paper,
.score-paper:hover {
  background: transparent;
  border: 0;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}
/* 组件是左对齐的（卡片 + 卡外播放条），标题保持居中不动，只给下方留一点呼吸 */
.score-paper .p-sub { margin-bottom: 12px; }
/* 预览区在窄屏放不下时横向滚动（不动谱面尺寸，避免缩放失真） */
.score-paper :deep(.sp) { max-width: 100%; overflow-x: auto; }
</style>
