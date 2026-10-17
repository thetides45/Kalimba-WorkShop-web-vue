<script setup>
/* 消息通知 —— 2026-10-11 按定稿图重做（外观见 `_mock_f10/06-融合版-用户中心.*` 的消息段）
   顶部 = 4 个**横排类型页签**（回复我的 / 收到的赞 / 新增关注 / 系统通知，带**未读数** + 珊瑚下划线，
   默认落在「回复我的」）；列表 = 头像 + 正文（加粗昵称 + 动作 +《帖子标题》+：评论正文）+ 右侧（相对时间 + 未读红点）。

   ⚠️ 三条必须守住的：
   1. 后端通知接口**没有 type 过滤**，类型筛选只能在前端做。
   2. 列表**一次拉 50 条**再前端筛 —— 如果改成后端分页，就会出现「明明有却翻不到」。
   3. 保留 `#noti-main` / `.noti-item` / `.unread` / `.dot` / `.line1`：冒烟按这几个选择器断言，
      其中 `v3_features_smoke` 要求 **`.dot` 的条数 === `.unread` 的条数**，所以红点必须用 `v-if` 只在未读时渲染。 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import { handleRes, requireLogin } from '@/shared/res'
import { useNotificationStore } from '@/stores/notification'
import { useUiStore } from '@/stores/ui'
import { ICONS } from '@/shared/icons'
import { fmtRelative } from '@/shared/utils'

const router = useRouter()
const noti = useNotificationStore()
const ui = useUiStore()

const TYPE_TXT = { like: '赞了你的帖子', comment: '评论了你的帖子', follow: '关注了你', system: '系统通知' }
/* 页签顺序与文案照定稿图。**刻意没有「全部」档** —— 四类已覆盖全部通知（2026-10-11 用户口径）。 */
const TYPE_TABS = [
  ['comment', '回复我的'],
  ['like', '收到的赞'],
  ['follow', '新增关注'],
  ['system', '系统通知']
]

const type = ref('comment')
const all = ref([])

const list = computed(() => all.value.filter((n) => n.type === type.value))
/** 页签上的数字 = 该类型的**未读数**（不是总数）：和行尾红点同一口径，读完即消失 */
function unreadOf(t) {
  return all.value.filter((n) => n.type === t && !n.isRead).length
}

/* 点击后去哪儿：关注类跳对方主页；其余跳关联帖子 */
function targetOf(n) {
  if (n.type === 'follow') return n.senderId ? '/user/' + n.senderId : '/'
  if (n.targetId) return '/post/' + n.targetId
  return '/'
}
function who(n) {
  return n.type === 'system' ? '系统' : ((n.sender && n.sender.nickname) || '')
}

async function load() {
  const r = await api.notifications.list()
  if (!handleRes(r, '通知加载失败')) return
  all.value = r.data.list || []
  type.value = pickDefaultTab()
}

/** 进页面时落在哪个页签：**优先「有未读的」，其次「有内容的」，最后才回落到第一个**。
 *  ⚠️ 不能写死 `'comment'`：四类里某一类可能一条都没有，写死就会让用户（和冒烟）
 *  一进来看到空白页 —— 明明有 3 条未读赞却什么都没显示。 */
function pickDefaultTab() {
  const order = TYPE_TABS.map(([v]) => v)
  return order.find((t) => all.value.some((n) => n.type === t && !n.isRead))
    || order.find((t) => all.value.some((n) => n.type === t))
    || order[0]
}

/* 点击一条：未读就先标已读（PUT /api/notifications/{id}/read）再跳转 */
async function openItem(n) {
  const target = targetOf(n)
  if (!n.isRead) {
    const r = await api.notifications.readOne(n.id)
    if (r.code === 0) {
      n.isRead = true
      noti.refresh()   /* 顶栏未读红点跟着变 */
    }
  }
  if (target) router.push(target)
}

async function readAll() {
  const r = await api.notifications.markRead(true)
  if (!handleRes(r)) return
  ui.toast('已全部标记为已读')
  await load()
  noti.refresh()
}

onMounted(() => {
  if (!requireLogin('/notifications')) return
  load()
})
</script>

<template>
  <main class="noti-wrap" id="noti-main" style="padding-bottom:40px">
    <div class="backline">
      <button class="iconbtn" aria-label="返回" style="width:32px;height:32px" type="button" @click="router.back()">
        <span v-html="ICONS.back"></span>
      </button>
      <span class="bt">消息通知</span>
      <span class="grow"></span>
      <button class="btn ghost sm" id="readall-btn" type="button" @click="readAll">全部已读</button>
    </div>

    <!-- 横排类型页签（带未读数） -->
    <nav class="uc-tabs" id="noti-chips">
      <button
        v-for="[v, label] in TYPE_TABS"
        :key="v"
        type="button"
        class="uc-tab"
        :class="{ on: type === v }"
        :data-type="v"
        @click="type = v"
      >{{ label }}<b v-if="unreadOf(v)">{{ unreadOf(v) }}</b></button>
    </nav>

    <div class="noti-list" id="noti-list">
      <div v-for="n in list" :key="n.id" class="noti-item" :class="{ unread: !n.isRead }" @click="openItem(n)">
        <span class="avatar">{{ String(who(n)).slice(0, 1) }}</span>

        <div class="body">
          <div class="line1">
            <template v-if="n.type === 'system'">
              <b>系统</b> {{ n.content || '有新的系统消息' }}
            </template>
            <template v-else>
              <b>{{ who(n) }}</b><span class="act">{{ TYPE_TXT[n.type] || n.type }}</span><span
                v-if="n.postTitle"
                class="post-t"
              >《{{ n.postTitle }}》</span><span v-else-if="n.targetId" class="body-t">（帖子已删除）</span><span v-if="n.content" class="body-t">：{{ n.content }}</span>
            </template>
          </div>
        </div>

        <div class="right">
          <span class="time">{{ fmtRelative(n.createdAt) }}</span>
          <span v-if="!n.isRead" class="dot"></span>
        </div>
      </div>

      <div v-if="!list.length" class="empty-tip">这里静悄悄的，去弹两下吧。</div>
    </div>
  </main>
</template>
