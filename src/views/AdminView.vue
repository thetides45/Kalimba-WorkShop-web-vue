<script setup>
/* 后台管理 —— 对应 V3 `web/admin.html`
   五分区：概览统计 / 待审帖子 / 举报处理 / 用户管理 / 审核记录。
   与 V3 一致的两条设计：
     · **分区懒加载**：切到哪块才拉哪块的数据
     · **操作类型 chip 从后端反查**（GET /api/admin/logs/actions），前端不硬编码清单 ——
       将来谁往某个接口补了 @OpLog("...")，这里会自动多出一个 chip */
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import { handleRes } from '@/shared/res'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { ICONS } from '@/shared/icons'
import { fmtTime } from '@/shared/utils'

const auth = useAuthStore()
const ui = useUiStore()

const PAGE = 10
const isAdmin = computed(() => auth.isAdmin)
const sec = ref('overview')

const st = reactive({
  overviewLoaded: false,
  stats: [],
  pending: { page: 1, list: [], total: 0, loaded: false },
  reports: { page: 1, status: '0', list: [], total: 0, loaded: false },
  comments: { page: 1, keyword: '', status: '', list: [], total: 0, loaded: false },
  users: { page: 1, keyword: '', list: [], total: 0, loaded: false },
  logs: {
    page: 1, list: [], total: 0, action: '', keyword: '', success: '',
    actions: [], actionsLoaded: false, loaded: false
  }
})

const TABS = [['overview', '概览'], ['pending', '待审帖子'], ['reports', '举报处理'], ['comments', '评论管理'], ['users', '用户管理'], ['logs', '审核记录']]
const REPORT_CHIPS = [['0', '待处理'], ['', '全部'], ['1', '已处理'], ['2', '已驳回']]
const SUCCESS_CHIPS = [['', '全部结果'], ['1', '仅成功'], ['0', '仅失败']]
const COMMENT_CHIPS = [['', '全部'], ['0', '已下架'], ['1', '正常']]
const REPORT_STATUS = { 0: ['待处理', 'wait'], 1: ['已处理', 'done'], 2: ['已驳回', 'off'] }
const LOG_RESULT = { 1: ['成功', 'done'], 0: ['失败', 'wait'] }
const COMMENT_STATUS = { 0: ['已下架', 'off'], 1: ['正常', 'done'] }

/* ---------- 分区切换（懒加载：切到哪块才拉哪块） ---------- */
function showSec(name) {
  sec.value = name
  if (name === 'overview' && !st.overviewLoaded) loadStats()
  if (name === 'pending' && !st.pending.loaded) loadPending(false)
  if (name === 'reports' && !st.reports.loaded) loadReports(false)
  if (name === 'comments' && !st.comments.loaded) loadComments(false)
  if (name === 'users' && !st.users.loaded) loadUsers(false)
  if (name === 'logs' && !st.logs.loaded) { loadLogActions(); loadLogs(false) }
}

/* ---------- 概览 ---------- */
async function loadStats() {
  const r = await api.admin.stats()
  if (!handleRes(r, '统计加载失败')) return
  st.overviewLoaded = true
  const d = r.data || {}
  st.stats = [
    { l: '用户总数', n: d.users },
    { l: '帖子总数', n: d.posts },
    { l: '正常帖子', n: d.postsActive },
    { l: '待处理举报', n: d.pendingReports, warn: (d.pendingReports || 0) > 0 }
  ]
}

/* ---------- 待审帖子 ---------- */
async function loadPending(append) {
  const r = await api.admin.pendingPosts(st.pending.page, PAGE)
  if (!handleRes(r, '待审列表加载失败')) return
  const d = r.data
  st.pending.list = append ? st.pending.list.concat(d.list) : d.list
  st.pending.total = d.total || st.pending.list.length
  st.pending.loaded = true
}
async function actPost(id, status, label) {
  if (!(await ui.confirm('确认对该帖子执行「' + label + '」？'))) return
  const r = await api.admin.setPostStatus(id, status)
  if (!handleRes(r, '操作失败')) return
  ui.toast(label)
  st.pending.list = st.pending.list.filter((x) => x.id !== String(id))
  st.pending.total = Math.max(0, st.pending.list.length)
  st.overviewLoaded = false   /* 概览计数变了，下次进概览重拉 */
}
function morePending() { st.pending.page++; loadPending(true) }

/* ---------- 举报处理 ---------- */
async function loadReports(append) {
  const r = await api.admin.reports(st.reports.page, PAGE, st.reports.status)
  if (!handleRes(r, '举报列表加载失败')) return
  const d = r.data
  st.reports.list = append ? st.reports.list.concat(d.list) : d.list
  st.reports.total = d.total || 0
  st.reports.loaded = true
}
function pickReportStatus(v) {
  st.reports.status = v
  st.reports.page = 1
  st.reports.list = []
  loadReports(false)
}
async function actReport(id, status) {
  const r = await api.admin.handleReport(id, status)
  if (!handleRes(r, '处理失败')) return
  ui.toast(status === 1 ? '已受理' : '已驳回')
  st.reports.page = 1
  st.reports.list = []
  loadReports(false)
  st.overviewLoaded = false
}
function moreReports() { st.reports.page++; loadReports(true) }

/* ---------- 评论管理（缺口 B8） ---------- */
async function loadComments(append) {
  const r = await api.admin.comments(st.comments.page, PAGE, { keyword: st.comments.keyword, status: st.comments.status })
  if (!handleRes(r, '评论列表加载失败')) return
  const d = r.data
  st.comments.list = append ? st.comments.list.concat(d.list) : d.list
  st.comments.total = d.total || 0
  st.comments.loaded = true
}
function pickCommentStatus(v) {
  st.comments.status = v
  st.comments.page = 1
  st.comments.list = []
  loadComments(false)
}
function searchComments() {
  const el = document.getElementById('cmt-q')
  st.comments.keyword = el ? el.value.trim() : ''
  st.comments.page = 1
  st.comments.list = []
  loadComments(false)
}
/* 下架 / 恢复：软删，可逆（B2 提供的接口） */
async function actComment(c, status) {
  const label = status === 0 ? '下架' : '恢复'
  if (!(await ui.confirm('确认' + label + '这条评论？'))) return
  const r = await api.admin.setCommentStatus(c.id, status)
  if (!handleRes(r, '操作失败')) return
  ui.toast(label + '成功')
  st.comments.page = 1
  st.comments.list = []
  loadComments(false)
}
/* 物理删除：**不可恢复**，且后端**不级联**（一级评论被删后，它的回复会留在库里）
   —— 所以确认文案要把「软删可恢复」这条退路说清楚，别让管理员当常规手段用。 */
async function delComment(c) {
  if (!(await ui.confirm('确认彻底删除这条评论？软删（下架）可恢复，这一步不可恢复。'))) return
  const r = await api.posts.removeComment(c.postId, c.id)
  if (!handleRes(r, '删除失败')) return
  ui.toast('评论已删除')
  st.comments.page = 1
  st.comments.list = []
  loadComments(false)
}
function moreComments() { st.comments.page++; loadComments(true) }

/* ---------- 用户管理 ---------- */
async function loadUsers(append) {
  const r = await api.admin.users(st.users.page, PAGE, st.users.keyword)
  if (!handleRes(r, '用户列表加载失败')) return
  const d = r.data
  st.users.list = append ? st.users.list.concat(d.list) : d.list
  st.users.total = d.total || 0
  st.users.loaded = true
}
function searchUsers() {
  st.users.keyword = (document.getElementById('user-q') || {}).value ? document.getElementById('user-q').value.trim() : ''
  st.users.page = 1
  st.users.list = []
  loadUsers(false)
}
async function actUser(id, status) {
  const label = status === 0 ? '封禁' : '解除封禁'
  if (!(await ui.confirm('确认' + label + '该用户？'))) return
  const r = await api.admin.setUserStatus(id, status)
  if (!handleRes(r, '操作失败')) return
  ui.toast(label + '成功')
  st.users.page = 1
  st.users.list = []
  loadUsers(false)
}
function moreUsers() { st.users.page++; loadUsers(true) }

/* ---------- 审核记录（操作日志） ---------- */
async function loadLogActions() {
  if (st.logs.actionsLoaded) return
  const r = await api.admin.logActions()
  if (!handleRes(r, '操作类型加载失败')) return
  st.logs.actionsLoaded = true
  st.logs.actions = r.data || []
}
async function loadLogs(append) {
  const r = await api.admin.logs(st.logs.page, PAGE, {
    action: st.logs.action, keyword: st.logs.keyword, success: st.logs.success
  })
  if (!handleRes(r, '审核记录加载失败')) return
  const d = r.data
  st.logs.list = append ? st.logs.list.concat(d.list) : d.list
  st.logs.total = d.total || 0
  st.logs.loaded = true
}
function pickLogAction(v) {
  st.logs.action = v
  st.logs.page = 1
  st.logs.list = []
  loadLogs(false)
}
function pickLogSuccess(v) {
  st.logs.success = v
  st.logs.page = 1
  st.logs.list = []
  loadLogs(false)
}
function searchLogs() {
  const el = document.getElementById('log-q')
  st.logs.keyword = el ? el.value.trim() : ''
  st.logs.page = 1
  st.logs.list = []
  loadLogs(false)
}
function moreLogs() { st.logs.page++; loadLogs(true) }

/* ---------- 权限门：非管理员直接不再发任何请求 ---------- */
onMounted(() => {
  if (isAdmin.value) showSec('overview')
})
</script>

<template>
  <main class="wrap">
    <div class="admin-wrap">
      <div class="admin-head">
        <div class="t">后台管理</div>
        <div class="d">内容审核 · 举报处理 · 用户管理</div>
      </div>

      <!-- 非管理员：提示 + 去登录 -->
      <div v-if="!isAdmin" class="empty-state" id="admin-forbidden" style="margin-top:30px">
        <span v-html="ICONS.empty"></span>
        <div class="t">{{ auth.user ? '当前账号不是管理员' : '请先登录管理员账号' }}</div>
        <div class="d">后台管理需要 admin 角色。演示账号：<b>admin / 123456</b>。</div>
        <RouterLink v-if="!auth.user" class="btn coral" :to="{ path: '/login', query: { next: '/admin' } }">去登录</RouterLink>
      </div>

      <template v-else>
        <div class="chips" id="admin-tabs" style="margin-top:20px">
          <button
            v-for="[v, label] in TABS"
            :key="v"
            class="chip"
            :class="{ on: sec === v }"
            :data-sec="v"
            type="button"
            @click="showSec(v)"
          >{{ label }}</button>
        </div>

        <div id="admin-body">
          <!-- ① 概览 -->
          <section class="admin-sec" id="sec-overview" :class="{ show: sec === 'overview' }">
            <div class="stat-grid" id="stat-grid">
              <div v-for="it in st.stats" :key="it.l" class="stat-card" :class="{ warn: it.warn }">
                <div class="n">{{ it.n == null ? '—' : it.n }}</div>
                <div class="l">{{ it.l }}</div>
              </div>
            </div>
          </section>

          <!-- ② 待审帖子 -->
          <section class="admin-sec" id="sec-pending" :class="{ show: sec === 'pending' }">
            <div class="section-h"><div class="t">待审帖子<small>{{ st.pending.total ? '共 ' + st.pending.total + ' 篇' : '' }}</small></div></div>
            <div id="pending-list">
              <div v-for="p in st.pending.list" :key="p.id" class="arow">
                <div class="main">
                  <div class="a-title">{{ p.title }}</div>
                  <div class="a-sum">{{ p.summary || '（无正文）' }}</div>
                  <div class="a-meta">
                    <span class="pill wait">待审核</span>
                    <span>{{ p.author ? p.author.nickname : '?' }}</span>
                    <span>{{ fmtTime(p.createdAt) }}</span>
                    <RouterLink class="more" :to="'/post/' + p.id">查看</RouterLink>
                  </div>
                </div>
                <div class="acts">
                  <button class="btn primary sm" type="button" data-approve @click="actPost(p.id, 1, '已通过')">通过</button>
                  <button class="btn ghost sm" type="button" @click="actPost(p.id, 2, '已驳回')">驳回</button>
                </div>
              </div>
              <div v-if="!st.pending.list.length" class="admin-empty">暂无待审帖子</div>
            </div>
            <div class="pager">
              <button v-if="st.pending.list.length < st.pending.total" class="btn ghost sm" type="button" @click="morePending">加载更多</button>
            </div>
          </section>

          <!-- ③ 举报处理 -->
          <section class="admin-sec" id="sec-reports" :class="{ show: sec === 'reports' }">
            <div class="section-h"><div class="t">举报处理<small>{{ st.reports.total ? '共 ' + st.reports.total + ' 条' : '' }}</small></div></div>
            <div class="chips" id="report-chips">
              <button
                v-for="[v, label] in REPORT_CHIPS"
                :key="v || 'all'"
                class="chip"
                :class="{ on: st.reports.status === v }"
                :data-status="v"
                type="button"
                @click="pickReportStatus(v)"
              >{{ label }}</button>
            </div>
            <div id="report-list">
              <div v-for="x in st.reports.list" :key="x.id" class="arow">
                <div class="main">
                  <div class="a-title">{{ x.reason || '（未填写原因）' }}</div>
                  <div class="a-meta">
                    <span class="pill" :class="(REPORT_STATUS[x.status] || ['未知', 'off'])[1]">
                      {{ (REPORT_STATUS[x.status] || ['未知'])[0] }}
                    </span>
                    <span>举报人 {{ x.reporter ? x.reporter.nickname : '?' }}</span>
                    <RouterLink v-if="x.targetType === 'post'" class="more" :to="'/post/' + x.targetId">查看被举报帖子</RouterLink>
                    <span v-else>{{ x.targetType }} #{{ x.targetId }}</span>
                    <span>{{ fmtTime(x.createdAt) }}</span>
                  </div>
                </div>
                <div v-if="x.status === 0" class="acts">
                  <button class="btn primary sm" type="button" @click="actReport(x.id, 1)">已处理</button>
                  <button class="btn ghost sm" type="button" @click="actReport(x.id, 2)">驳回</button>
                </div>
              </div>
              <div v-if="!st.reports.list.length" class="admin-empty">没有符合条件的举报</div>
            </div>
            <div class="pager">
              <button v-if="st.reports.list.length < st.reports.total" class="btn ghost sm" type="button" @click="moreReports">加载更多</button>
            </div>
          </section>

          <!-- ④ 评论管理（缺口 B8） -->
          <section class="admin-sec" id="sec-comments" :class="{ show: sec === 'comments' }">
            <div class="section-h">
              <div class="t">评论管理<small>{{ st.comments.total ? '共 ' + st.comments.total + ' 条' : '' }}</small></div>
              <div class="more">「下架」是软删、可恢复；「删除」不可恢复</div>
            </div>
            <div class="chips" id="cmt-status-chips">
              <button
                v-for="[v, label] in COMMENT_CHIPS"
                :key="v || 'all'"
                class="chip"
                :class="{ on: st.comments.status === v }"
                :data-status="v"
                type="button"
                @click="pickCommentStatus(v)"
              >{{ label }}</button>
            </div>
            <div class="admin-search">
              <input id="cmt-q" placeholder="搜评论内容 / 作者昵称…" autocomplete="off" @keyup.enter="searchComments">
              <button class="btn ghost sm" id="cmt-search-btn" type="button" @click="searchComments">搜索</button>
            </div>
            <div id="cmt-list">
              <div v-for="c in st.comments.list" :key="c.id" class="arow" :data-cmt="c.id">
                <div class="main">
                  <div class="a-title">
                    {{ c.content }}
                    <span class="pill" :class="(COMMENT_STATUS[c.status] || ['未知', 'off'])[1]">{{ (COMMENT_STATUS[c.status] || ['未知'])[0] }}</span>
                    <span v-if="c.parentId" class="pill role">回复</span>
                  </div>
                  <div class="a-meta">
                    <span>{{ c.nickname }}</span>
                    <!-- 帖子可能已被删（孤儿评论）—— 管理端正是要能看见它们才好收拾 -->
                    <span v-if="c.postTitle">《{{ c.postTitle }}》</span>
                    <span v-else class="pill off">所属帖子已删除</span>
                    <span>{{ fmtTime(c.createdAt) }}</span>
                  </div>
                </div>
                <div class="acts">
                  <button
                    class="btn sm"
                    data-cmt-toggle
                    :class="c.status === 0 ? 'primary' : 'ghost'"
                    type="button"
                    @click="actComment(c, c.status === 0 ? 1 : 0)"
                  >{{ c.status === 0 ? '恢复' : '下架' }}</button>
                  <button class="btn ghost sm" data-cmt-del type="button" @click="delComment(c)">删除</button>
                </div>
              </div>
              <div v-if="!st.comments.list.length" class="admin-empty">没有符合条件的评论</div>
            </div>
            <div class="pager">
              <button v-if="st.comments.list.length < st.comments.total" class="btn ghost sm" type="button" @click="moreComments">加载更多</button>
            </div>
          </section>

          <!-- ⑤ 用户管理 -->
          <section class="admin-sec" id="sec-users" :class="{ show: sec === 'users' }">
            <div class="section-h"><div class="t">用户管理<small>{{ st.users.total ? '共 ' + st.users.total + ' 位' : '' }}</small></div></div>
            <div class="admin-search">
              <input id="user-q" placeholder="搜用户名 / 昵称…" autocomplete="off" @keyup.enter="searchUsers">
              <button class="btn ghost sm" id="user-search-btn" type="button" @click="searchUsers">搜索</button>
            </div>
            <div id="user-list">
              <div v-for="u in st.users.list" :key="u.id" class="arow">
                <div class="main">
                  <div class="a-title">{{ u.nickname }} <span class="pill user">@{{ u.username }}</span></div>
                  <div class="a-meta">
                    <span class="pill" :class="u.status === 0 ? 'wait' : 'done'">{{ u.status === 0 ? '已封禁' : '正常' }}</span>
                    <span>{{ fmtTime(u.createdAt) }}</span>
                  </div>
                </div>
                <div class="acts">
                  <!-- 不给管理员放封禁按钮：否则一次误操作可能把管理入口锁死。
                       （后端没拦这一条，属于页面级保护 —— 真要做权限分级应在服务端补。） -->
                  <span v-if="u.role === 'admin'" class="pill admin">管理员</span>
                  <button
                    v-else
                    class="btn sm"
                    data-user
                    :class="u.status === 0 ? 'primary' : 'ghost'"
                    type="button"
                    @click="actUser(u.id, u.status === 0 ? 1 : 0)"
                  >{{ u.status === 0 ? '解除封禁' : '封禁' }}</button>
                </div>
              </div>
              <div v-if="!st.users.list.length" class="admin-empty">没有匹配的用户</div>
            </div>
            <div class="pager">
              <button v-if="st.users.list.length < st.users.total" class="btn ghost sm" type="button" @click="moreUsers">加载更多</button>
            </div>
          </section>

          <!-- ⑥ 审核记录 -->
          <section class="admin-sec" id="sec-logs" :class="{ show: sec === 'logs' }">
            <div class="section-h">
              <div class="t">审核记录<small>{{ st.logs.total ? '共 ' + st.logs.total + ' 条' : '' }}</small></div>
              <div class="more">由后端切面自动记录，只增不改</div>
            </div>
            <div class="chips" id="log-success-chips">
              <button
                v-for="[v, label] in SUCCESS_CHIPS"
                :key="v || 'all'"
                class="chip"
                :class="{ on: st.logs.success === v }"
                :data-success="v"
                type="button"
                @click="pickLogSuccess(v)"
              >{{ label }}</button>
            </div>
            <div class="chips" id="log-action-chips">
              <template v-if="st.logs.actions.length">
                <button class="chip" :class="{ on: st.logs.action === '' }" type="button" @click="pickLogAction('')">全部类型</button>
                <button
                  v-for="a in st.logs.actions"
                  :key="a"
                  class="chip"
                  :class="{ on: st.logs.action === a }"
                  type="button"
                  @click="pickLogAction(a)"
                >{{ a }}</button>
              </template>
              <span v-else-if="st.logs.actionsLoaded" class="log-hint">还没有任何操作记录</span>
            </div>
            <div class="admin-search">
              <input id="log-q" placeholder="搜操作者用户名 / 接口路径…" autocomplete="off" @keyup.enter="searchLogs">
              <button class="btn ghost sm" type="button" @click="searchLogs">搜索</button>
            </div>
            <div id="log-list">
              <div v-for="x in st.logs.list" :key="x.id" class="arow">
                <div class="main">
                  <div class="a-title">
                    {{ x.action }}
                    <span class="pill" :class="(LOG_RESULT[x.success] || ['未知', 'off'])[1]">{{ (LOG_RESULT[x.success] || ['未知'])[0] }}</span>
                  </div>
                  <div class="a-meta">
                    <span class="pill role">{{ x.method }}</span>
                    <span>{{ x.uri }}</span>
                    <!-- 操作者是**快照**：旧记录（本功能上线前登录的会话没有用户名）只有 id -->
                    <span>操作者 {{ x.username ? '@' + x.username : (x.userId ? '#' + x.userId : '系统 / 游客') }}</span>
                    <span v-if="x.durationMs != null">{{ x.durationMs }} ms</span>
                    <span>{{ fmtTime(x.createdAt) }}</span>
                  </div>
                  <div v-if="x.errorMsg" class="a-sum log-err">失败原因：{{ x.errorMsg }}</div>
                </div>
              </div>
              <div v-if="!st.logs.list.length" class="admin-empty">没有符合条件的操作记录</div>
            </div>
            <div class="pager">
              <button v-if="st.logs.list.length < st.logs.total" class="btn ghost sm" type="button" @click="moreLogs">加载更多</button>
            </div>
          </section>
        </div>
      </template>
    </div>
  </main>
</template>
