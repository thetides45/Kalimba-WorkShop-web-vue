<script setup>
/* 发布 / 编辑谱帖 —— 对应 V3 `web/publish.html`
   同一页承担「新建」与「编辑」：带 /publish/:id 就是编辑态（提交走 PUT /api/posts/{id}）。

   ⚠️ 保留的已知缺陷（与 V3 行为一致，见 `缺口与待办.md` B15）：
     「从制谱工作台一键带入」调的是 `api.files.upload(null, 'score')` —— mock 时代表示
     「取本地草稿」，但真实接口层会把 null 当文件塞进 FormData，后端按 5002 拒绝，
     于是**每次带草稿进本页都会弹一次「上传失败」**。此处不做静默修复，
     以免与原版行为产生偏差（要修的话：从 localStorage.kc_draft 生成 Blob 再上传）。 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { handleRes, requireLogin } from '@/shared/res'
import { useUiStore } from '@/stores/ui'
import { ICONS } from '@/shared/icons'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

/* 编辑态 id：正式形态是路径参数 `/publish/:id`；
   同时兼容 V3 的查询串写法 `/publish?id=`（旧外链/书签不至于突然失效）。 */
const editId = computed(() => {
  const v = route.params.id || route.query.id
  return v ? String(v) : null
})

const title = ref('')
const content = ref('')
const titleErr = ref(false)
const contentErr = ref(false)
const submitting = ref(false)

/* ---------- 正文块编辑器（路线 B 第 7 步，2026-10-16） ----------
   正文从「一个 textarea」变成「一组块」：文字 / 图片 / 分隔线 / 乐谱，可增删、可上下移。
   提交时带 blocks；`content` 由文本块**自动拼出来** —— 它是后端 @NotBlank 的必填项，
   列表卡的摘要也读它（api 层 toListItem），所以不能省。

   ⚠️ `_k` 是**纯前端**的 key：v-for 需要稳定 key，光用 index 会在删除时错位；
      提交前必须剥掉（见 buildBody），别把它塞进接口。
   ⚠️ 上限 60 与后端 `PostService.BLOCK_MAX` 对齐 —— 那边超了直接 1001。 */
const blocks = ref([])
let keySeq = 0
const nextKey = () => ++keySeq

const BLOCK_LABEL = { text: '文字', image: '图片', divider: '分隔线', score: '乐谱' }
const typeLabel = (t) => BLOCK_LABEL[t] || t

function addBlock(type) {
  if (blocks.value.length >= 60) { ui.toast('正文块最多 60 个'); return }
  const b = { _k: nextKey(), type }
  if (type === 'text') b.text = ''
  if (type === 'image') { b.url = ''; b.caption = '' }
  /* 乐谱块以「页面上传的那份」为准；也允许先插块后传谱（提交前会再校验一次）。 */
  if (type === 'score') b.fileId = scoreFile.value ? String(scoreFile.value.fileId) : ''
  blocks.value.push(b)
}

function removeBlock(i) { blocks.value.splice(i, 1) }

function moveBlock(i, d) {
  const j = i + d
  const arr = blocks.value
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

/* 图片块上传：一个隐藏 input 复用给所有块，`imgTarget` 记住当前在给哪一块传。 */
const imgInput = ref(null)
let imgTarget = -1
function pickImage(i) { imgTarget = i; if (imgInput.value) imgInput.value.click() }
async function onImgPick(e) {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!f || imgTarget < 0 || !blocks.value[imgTarget]) return
  const r = await api.files.upload(f, 'image')
  if (!handleRes(r, '图片上传失败')) return
  blocks.value[imgTarget].url = r.data.url
}
/* ---- 存草稿（2026-10-14） ---- */
const draftSaving = ref(false)
/* 新建态下「存为草稿」成功后记住 id —— 否则再点一次会创建出**第二篇草稿**。
   （URL 仍停在 /publish 不带 id；草稿已落库，刷新会变回新建态，这个可接受。） */
const draftId = ref(null)
/* 编辑态原帖的状态（0 待审 / 1 正常 / 2 下架 / 3 草稿）：点「发布」时据此决定要不要推状态。 */
const postStatus = ref(1)

const tags = ref([])
const picked = ref([])

const catGroups = ref([])
const cat = reactive({ tuningType: '', keyName: '', difficulty: '', musicGenre: '' })

const vis = ref('login')
const VIS_OPTIONS = [
  ['login', '登录可下载'],
  ['favorite', '收藏后可下载'],
  ['follower', '关注后可下载'],
  ['author', '仅自己']
]
const VIS_HINT = {
  login: '任何登录用户都能下载源文件。',
  favorite: '琴友需要先收藏这篇帖才能下载源文件 —— 门槛比关注低，适合换点人气的谱。',
  follower: '只有关注了你的琴友能下载源文件；试听与谱面展示不受影响。',
  author: '只有你自己（与管理员）能下载源文件，适合还没做好的草稿谱。'
}
const VIS_TIP_IDLE = '未上传乐谱文件时此项不生效。试听不受影响，限制的只是源文件下载。'

const coverFile = ref(null)
const scoreFile = ref(null)
const coverInput = ref(null)
const scoreInput = ref(null)

const done = ref(false)
const doneIsEdit = ref(false)
const donePostId = ref('')

/* ---------- 未发布内容的「离开确认」（2026-10-14 用户要求） ----------
   文案：「内容未发布，将不会保存草稿，是否确认退出」。
   本页**没有草稿箱**（标题/正文只活在内存里，提交失败即丢），所以离开前必须拦一道。

   两条离开路径都要覆盖，缺一不可：
     ① 站内路由跳转（顶栏导航 / 点 logo / 「返回」按钮 / 浏览器后退键）→ `onBeforeRouteLeave`；
     ② 刷新、关标签、改地址栏 → `beforeunload`（**浏览器原生**弹窗，文案由浏览器给、不可定制）。

   「有内容」不靠逐个字段猜，用**基线快照比对**：
   ⚠️ 基线必须在**所有异步回填结束之后**才采（`prefill` / `loadDraft` 都是异步的）——
      否则编辑态一打开就被判成「有改动」，用户什么都没动也弹窗。
   ⚠️ `baseline === null` 表示「基线还没就绪」（加载中 / 未登录被 requireLogin 带走）——
      此时**一律不拦**：宁可漏拦一次，也不能把用户堵在页里出不去。 */
const baseline = ref(null)

function snapshot() {
  return JSON.stringify({
    t: title.value.trim(),
    /* 正文改成块之后，基线要看 **blocks**（content 是自动生成的摘要，不反映编辑）。
       `_k` 剥掉 —— 它是每次重建都会变的纯前端 key，留着会让「刚打开就算有改动」。 */
    b: blocks.value.map((x) => { const { _k, ...rest } = x; return rest }),
    /* 排序归一：话题的**点选顺序**不同不算改动 */
    p: picked.value.slice().sort(),
    cat: { ...cat },
    v: vis.value,
    cov: coverFile.value ? String(coverFile.value.url || coverFile.value.fileId || '') : '',
    sc: scoreFile.value ? String(scoreFile.value.fileId || scoreFile.value.fileName || '') : ''
  })
}

const isDirty = computed(() => {
  if (done.value) return false               // 已发布成功，随便走
  if (baseline.value === null) return false  // 基线未就绪，不拦
  return snapshot() !== baseline.value
})

const LEAVE_MSG = '内容未发布，将不会保存草稿，是否确认退出？'

/* ① 站内路由跳转：守卫返回 Promise<boolean>，false 即取消本次导航 */
onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true
  return await ui.confirm(LEAVE_MSG, '确认退出')
})

/* ② 刷新 / 关标签：`beforeunload` 里必须同时调 preventDefault 与写 returnValue，
   浏览器才会弹自己的确认框（现代浏览器已忽略自定义文案）。 */
function onBeforeUnload(e) {
  if (!isDirty.value) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

/* 下载权限提示：附件的存在性决定文案（与 V3 的 syncVisTip 一致） */
const visTip = computed(() => (scoreFile.value ? VIS_HINT[vis.value] : VIS_TIP_IDLE))

/**
 * 档位顺序 = 门槛从宽到严（与后端 ScoreVisibility 的声明顺序一致，别随手调）。
 * 分级只约束别人：作者本人与管理员永远可下（后端 FileService.accessOf）。
 */
function setVis(v) {
  vis.value = VIS_HINT[v] ? v : 'login'
}

/* 曲谱分类：**纯单选**（组内点中新的，旧的自动取消），与 V3 `publish.html` 的
   `classList.toggle('on', x === c)` 语义一致 —— 注意**不是**反选开关：
   再点一次已选中的不会取消（V3 就是如此，别按「更顺手」去改成可反选）。 */
function pickCat(groupKey, code) {
  cat[groupKey] = code
}

function toggleTag(t) {
  const id = String(t.id)
  const i = picked.value.indexOf(id)
  if (i > -1) { picked.value.splice(i, 1); return }
  if (picked.value.length >= 5) { ui.toast('最多选择 5 个话题'); return }
  picked.value.push(id)
}

async function loadTags() {
  const r = await api.tags.list()
  if (r.code !== 0) return
  tags.value = r.data.list || []
}

/* 曲谱结构化分类（琴型 / 调性 / 难度 / 曲风），四组各单选 */
async function loadCategories() {
  const r = await api.meta.categories()
  if (r.code !== 0) return
  catGroups.value = [
    ['tuningType', '琴型', r.data.tuningTypes],
    ['keyName', '调性', r.data.keyNames],
    ['difficulty', '难度', r.data.difficulties],
    ['musicGenre', '曲风', r.data.musicGenres]
  ]
}

/* 编辑态预填（GET /api/posts/{id}） */
async function prefill(id) {
  const r = await api.posts.detail(id)
  if (r.code !== 0) { ui.toast('帖子加载失败，已按新建处理'); return }
  const p = r.data
  postStatus.value = p.status == null ? 1 : Number(p.status)
  title.value = p.title || ''
  /* ★ 第 8 步（2026-10-16）：正文块回填。
     有 blocks 就照搬；**没有（老帖子）就用 content 初始化一个文字块** —— 否则
     「编辑老帖 → 正文区空着 → 一保存内容就没了」（原来的 prefill 只把 content 剥成纯文本）。 */
  blocks.value = (Array.isArray(p.blocks) && p.blocks.length)
    ? p.blocks.map((b) => ({ ...b, _k: nextKey() }))
    : [{ _k: nextKey(), type: 'text', text: String(p.content || '').replace(/<[^>]+>/g, '').trim() }]
  const ids = []
  ;(p.tags || []).forEach((t) => { if (ids.length < 5) ids.push(String(t.id)) })
  picked.value = ids

  /* 沿用原乐谱附件：不重传也保留（分类与下载分级存在后端，改分级走 PUT /api/files/{id}/visibility） */
  if (p.scoreFile && p.scoreFile.fileId) {
    scoreFile.value = { fileId: String(p.scoreFile.fileId), fileName: '', size: 0, visibility: vis.value }
    const mr = await api.files.meta(p.scoreFile.fileId)
    if (mr.code !== 0) return
    scoreFile.value.fileName = mr.data.fileName
    scoreFile.value.size = mr.data.size
    setVis(mr.data.visibility)
    const mc = mr.data.categories || {}
    Object.keys(cat).forEach((k) => { if (mc[k]) cat[k] = mc[k] })
  }
}

async function onCoverPick(e) {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!f) return
  const r = await api.files.upload(f, 'image')
  if (!handleRes(r, '上传失败')) return
  coverFile.value = r.data
}

async function onScorePick(e) {
  const f = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!f) return
  /* 乐谱上传带上曲谱分类（琴型/调性/难度/曲风）与**下载分级**，后端一并落到 score_file 上 */
  const meta = Object.assign({ visibility: vis.value }, cat)
  const r = await api.files.upload(f, 'score', meta)
  if (!handleRes(r, '上传失败')) return
  scoreFile.value = r.data
}

/* 制谱工作台一键带入：草稿转乐谱附件（见文件头关于 B15 的说明） */
async function loadDraft() {
  const raw = localStorage.getItem('kc_draft')
  if (!raw) return
  try {
    const d = JSON.parse(raw)
    if (d.title) {
      title.value = '《' + d.title + '》卡林巴谱'
      /* 正文走块编辑器之后，这里改成塞一个文字块（原来直接赋 content 已经不起作用了）。 */
      blocks.value = [{ _k: nextKey(), type: 'text', text: '从制谱工作台带来的一首谱，欢迎大家试听交流。' }]
    }
    const r = await api.files.upload(null, 'score')
    if (r.code !== 0) return
    scoreFile.value = r.data
  } catch (e) {
    localStorage.removeItem('kc_draft')
  }
}

/* 下载分级同步：附件已存在（上传过 / 编辑态沿用）而选择的档位与库里不一致时才发请求。
   这样「传完再改权限」和「编辑态只改权限不重传」两种情况都覆盖到。 */
function syncVisibility() {
  const sf = scoreFile.value
  if (!sf || !sf.fileId) return Promise.resolve({ code: 0, message: 'ok' })
  if (sf.visibility === vis.value) return Promise.resolve({ code: 0, message: 'ok' })
  return api.files.setVisibility(sf.fileId, vis.value).then((r) => {
    if (r.code === 0) sf.visibility = vis.value
    return r
  })
}

/** blocks 非空时，用文本块拼出 content。
    · content 是后端 @NotBlank 的必填项（老逻辑没变）；
    · 列表卡的 summary 也读它（api 层 toListItem），所以不能省。
    截 200 字即可 —— 它是**摘要**，不是正文。 */
function contentFromBlocks() {
  return blocks.value
    .filter((b) => b.type === 'text' && b.text && b.text.trim())
    .map((b) => b.text.trim())
    .join('\n')
    .slice(0, 200)
}

/** 组装请求体 —— 「发布」与「存草稿」共用，避免两处字段各自漂移。 */
function buildBody() {
  const hasBlocks = blocks.value.length > 0
  return {
    title: title.value.trim(),
    /* 有块时 content 自动生成；一个文字块都没有就退回标题，保证非空（后端必填）。 */
    content: hasBlocks ? (contentFromBlocks() || title.value.trim()) : content.value.trim(),
    /* ⚠️ 剥掉纯前端的 `_k`。空 url 的图片块、没 fileId 的乐谱块在 prepare() 里已经拦下了。 */
    blocks: hasBlocks ? blocks.value.map((b) => { const { _k, ...rest } = b; return rest }) : [],
    tagIds: picked.value.slice(),
    coverUrl: coverFile.value ? coverFile.value.url : '',
    scoreFileId: scoreFile.value ? scoreFile.value.fileId : null
  }
}

/* ---------- 提交出错时：**先定位到出问题的那一栏，再报原因** ----------
   背景（2026-10-16 用户反馈）：点提交只弹一句「参数不合法」，用户完全不知道该改哪里。

   后端现在把定位信息放在 `data` 里（见 `R.fail` 的三参重载与 `PostService#blockError`）：
     { field: 'blocks', index: 2 }   ← 第 3 个正文块（⚠️ index 是 **0 基**）
     { field: 'title' }              ← 标题那一栏
   前端据此滚动过去并短暂框出来。 */
const FLASH_MS = 1800

/** 当前"被框出"的目标：'' / 'title' / 'content' / 'blocks' / 'blocks:2'。
    ⚠️ 必须用**响应式**（模板里的 `:class`）而不是 `el.classList.add` ——
      那些元素都带着 `:class` 绑定，Vue 一重渲染就会按绑定值重设 class，
      手动加的类**当场被抹掉**（第一版就是这么翻车的：toast 和滚动都对，框却没画出来）。 */
const flashField = ref('')
let flashTimer = null

/* 兜底：正常情况字段名走 data；万一拿到的是老格式 message（"title 标题过长"），也从里面抠一下。 */
function guessFieldFromMessage(msg) {
  const m = /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s+\S/.exec(String(msg || ''))
  return m ? m[1] : ''
}

/* 滚动到出错的那一栏并框出来。
   ⚠️ 用 `data-field` / `.be-item` 定位，而不是 template ref：
      正文块是 v-for 出来的，ref 只对写死的元素好用。 */
function focusField(field, index) {
  if (!field) return
  const hasIdx = field === 'blocks' && Number.isInteger(index) && index >= 0
  const key = hasIdx ? ('blocks:' + index) : field
  let el = null
  if (hasIdx) el = document.querySelectorAll('.be-item')[index] || null
  if (!el) el = document.querySelector('[data-field="' + field + '"]')
  if (!el && field === 'blocks') el = document.querySelector('.blk-editor')
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flashField.value = key
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flashField.value = '' }, FLASH_MS)
}

/* 提交失败的统一出口：定位 + 提示。
   ⚠️ 登录态过期（2001）转交 handleRes —— 它会清会话并跳登录页，那是另一条路，
      而且这种响应里没有 field，定位也无从谈起。 */
function showSubmitError(res, fallback) {
  if (res && res.code === 2001) { handleRes(res); return }
  const d = (res && res.data) || {}
  focusField(d.field || guessFieldFromMessage(res && res.message), Number.isInteger(d.index) ? d.index : -1)
  ui.toast((res && res.message) || fallback || '提交失败')
}

/** 提交前的公共闸门：必填校验 + 附件下载权限同步。返回 false = 已中断，调用方直接 return。
    ⚠️ 草稿与发布走**同一套校验**：后端 PostReq 的 @NotBlank/@Size 对草稿一视同仁
       （草稿 ≠ 可以空标题），在这里先拦一道，用户才看到具体缺哪一项。
    ⚠️ 正文的校验口径**变了**：不再是「textarea 非空」，而是「至少有一个**内容**块」
       （文字块要有字，或者有图片 / 乐谱 / 分隔线）。 */
async function prepare() {
  titleErr.value = !title.value.trim()
  const hasText = blocks.value.some((b) => b.type === 'text' && b.text && b.text.trim())
  const hasMedia = blocks.value.some((b) => b.type === 'image' || b.type === 'score' || b.type === 'divider')
  contentErr.value = !(hasText || hasMedia)
  /* ⚠️ 本地校验也要**先定位再提示** —— 否则和"参数不合法"一样让人摸不着头脑。 */
  if (titleErr.value) { focusField('title'); ui.toast('标题不能为空'); return false }
  if (contentErr.value) { focusField('content'); ui.toast('正文不能为空'); return false }
  /* 乐谱块必须先有附件（否则 fileId 传出去会被后端白名单挡下）—— 定位到**那一块**，别泛泛提示。 */
  const badScore = blocks.value.findIndex((b) => b.type === 'score' && !scoreFile.value)
  if (badScore >= 0) {
    focusField('blocks', badScore)
    ui.toast('第 ' + (badScore + 1) + ' 个块是乐谱块 —— 请先在下面「乐谱文件」里上传一份')
    return false
  }
  const vr = await syncVisibility()
  if (!handleRes(vr, '下载权限保存失败')) return false
  return true
}

async function submit() {
  if (!(await prepare())) return
  submitting.value = true
  const id = editId.value || draftId.value
  const res = id ? await api.posts.update(id, buildBody()) : await api.posts.create(buildBody())
  /* 编辑一篇**草稿**时点「发布」：内容先落地，再把状态推到 1
     （pre 模式下后端会自动落 0 待审，所以这里统一传 1 即可）。 */
  const needPublish = res.code === 0 && !!id && postStatus.value === 3
  const fin = needPublish ? await api.posts.setStatus(id, 1) : res
  submitting.value = false
  /* ⚠️ 这里**不用 handleRes** —— 那个只弹一句后端文案，用户不知道该改哪里。
     走 showSubmitError：先滚动定位到出错那一栏并框出来，再报原因。 */
  if (fin.code !== 0) { showSubmitError(fin, id ? '保存失败' : '发布失败'); return }

  localStorage.removeItem('kc_draft')
  donePostId.value = needPublish ? String(id) : res.data.postId
  doneIsEdit.value = !!id
  done.value = true
}

/* 存草稿（2026-10-14）：与发布**只差最终状态**，其余完全共用 prepare() / buildBody()。
   成功后**不跳转**（留在页面继续写），只重置「未保存」基线、并记下 draftId 防重复创建。 */
async function saveDraft() {
  if (!(await prepare())) return
  draftSaving.value = true
  const id = editId.value || draftId.value
  let res, pid = id
  if (id) {
    res = await api.posts.update(id, buildBody())
    if (res.code === 0) res = await api.posts.setStatus(id, 3)
  } else {
    res = await api.posts.create(Object.assign(buildBody(), { draft: true }))
    if (res.code === 0) pid = res.data.postId
  }
  draftSaving.value = false
  if (res.code !== 0) { showSubmitError(res, '保存草稿失败'); return }

  draftId.value = pid ? String(pid) : draftId.value
  postStatus.value = 3
  localStorage.removeItem('kc_draft')
  /* 存完即重置基线：内容已经安全落库，此时离开不该再弹「内容未发布」。 */
  baseline.value = snapshot()
  ui.toast('草稿已保存，仅你自己可见')
}

onMounted(async () => {
  if (!requireLogin(editId.value ? '/publish/' + editId.value : '/publish')) return
  if (editId.value) document.title = '编辑谱帖 · 拇指琴谷'
  await Promise.all([loadCategories(), loadTags()])
  if (editId.value) await prefill(editId.value)
  /* ⚠️ 这里原本是 fire-and-forget 的 `loadDraft()`，改成 await —— 基线必须等它回填完再采，
     否则「带草稿进来」会被算成用户改动（见上面 baseline 的说明）。 */
  await loadDraft()
  baseline.value = snapshot()
})
</script>

<template>
  <main class="pub-wrap" id="pub-main" style="padding-bottom:40px">
    <!-- 成功态（绿色圆环，与设计规范一致） -->
    <div v-if="done" class="success-body">
      <div class="okring">
        <span v-html="ICONS.check.replace('width=&quot;20&quot; height=&quot;20&quot;', 'width=&quot;40&quot; height=&quot;40&quot;')"></span>
      </div>
      <div class="t">{{ doneIsEdit ? '修改已保存' : '发布成功' }}</div>
      <div class="d">
        <template v-if="doneIsEdit">这篇谱帖的内容已更新。</template>
        <template v-else>你的谱帖已进入「最新」列表，琴友们可以听到你的弹奏了。<br>后续的试听、点赞和评论都会通过消息通知告诉你。</template>
      </div>
      <div class="btns">
        <RouterLink class="btn primary" :to="'/post/' + donePostId">查看帖子</RouterLink>
        <RouterLink class="btn ghost" to="/">回广场</RouterLink>
      </div>
    </div>

    <template v-else>
      <div class="backline" style="margin-bottom:16px">
        <button class="iconbtn" aria-label="返回" style="width:32px;height:32px" type="button" @click="router.back()">
          <span v-html="ICONS.back"></span>
        </button>
        <span class="bt">{{ editId ? '编辑谱帖' : '发布谱帖' }}</span>
      </div>

      <div class="pub-card">
        <div class="field" data-field="title" :class="{ invalid: titleErr, flash: flashField === 'title' }">
          <label>标题</label>
          <input id="pub-title" v-model="title" maxlength="80" placeholder="一句话说明你的谱子，如：《小星星》17键入门谱">
          <div class="err">标题不能为空（80 字以内）</div>
        </div>

        <div class="field" data-field="content" :class="{ invalid: contentErr, flash: flashField === 'content' }">
          <label>正文（可混排文字 / 图片 / 分隔线 / 乐谱）</label>
          <div class="blk-editor" id="blk-editor" :class="{ flash: flashField === 'blocks' }">
            <div v-for="(blk, i) in blocks" :key="blk._k" class="be-item"
                 :class="{ flash: flashField === 'blocks:' + i }" :data-type="blk.type">
              <div class="be-bar">
                <span class="be-type">{{ typeLabel(blk.type) }}</span>
                <span class="grow"></span>
                <button class="be-btn" type="button" :disabled="i === 0" title="上移" @click="moveBlock(i, -1)">↑</button>
                <button class="be-btn" type="button" :disabled="i === blocks.length - 1" title="下移" @click="moveBlock(i, 1)">↓</button>
                <button class="be-btn" type="button" title="删除这一块" @click="removeBlock(i)">✕</button>
              </div>

              <textarea v-if="blk.type === 'text'" v-model="blk.text" rows="3" placeholder="写点什么…"></textarea>

              <div v-else-if="blk.type === 'image'" class="be-body">
                <img v-if="blk.url" :src="blk.url" class="be-thumb" alt="">
                <button class="btn ghost sm" type="button" @click="pickImage(i)">{{ blk.url ? '更换图片' : '选择图片' }}</button>
                <input v-if="blk.url" v-model="blk.caption" class="be-cap" maxlength="120" placeholder="图片说明（选填）">
              </div>

              <div v-else-if="blk.type === 'divider'" class="be-body be-divider">— 分隔线 —</div>

              <div v-else-if="blk.type === 'score'" class="be-body be-score">
                <template v-if="scoreFile">将内嵌可播放谱面：{{ scoreFile.fileName || '已上传的乐谱' }}</template>
                <template v-else>请先在下面「乐谱文件」里上传一份 —— 插入的乐谱块才会生效。</template>
              </div>
            </div>

            <div v-if="!blocks.length" class="be-empty">还没有正文块 —— 从下面加一个吧。</div>

            <div class="be-add">
              <button class="btn ghost sm" type="button" @click="addBlock('text')">+ 文字</button>
              <button class="btn ghost sm" type="button" @click="addBlock('image')">+ 图片</button>
              <button class="btn ghost sm" type="button" @click="addBlock('divider')">+ 分隔线</button>
              <button class="btn ghost sm" type="button" @click="addBlock('score')">+ 乐谱</button>
            </div>
          </div>
          <input ref="imgInput" type="file" accept="image/jpeg,image/png" style="display:none" @change="onImgPick">
          <div class="err">正文不能为空</div>
        </div>

        <div class="field">
          <label>选择话题（最多 5 个）</label>
          <div class="tag-pick" id="tag-pick">
            <span
              v-for="t in tags"
              :key="t.id"
              class="chip"
              :class="{ on: picked.includes(String(t.id)) }"
              @click="toggleTag(t)"
            >{{ t.name }}</span>
          </div>
        </div>

        <div class="field">
          <label>曲谱分类（琴型 / 调性 / 难度 / 曲风）</label>
          <div id="cat-pick">
            <div v-for="g in catGroups" :key="g[0]" class="field-inline">
              <label>{{ g[1] }}</label>
              <div class="tag-pick" :data-cat="g[0]">
                <span
                  v-for="o in (g[2] || [])"
                  :key="o.code"
                  class="chip"
                  :class="{ on: cat[g[0]] === o.code }"
                  :data-code="o.code"
                  @click="pickCat(g[0], o.code)"
                >{{ o.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="field">
          <label>封面图片（选填）</label>
          <div class="up-box" :class="{ done: !!coverFile }" id="up-cover" @click="coverInput.click()">
            <span class="ic" v-html="coverFile ? ICONS.check : ''"></span>
            <span class="tt">{{ coverFile ? coverFile.fileName : '上传封面' }}</span>
            <span class="dd">{{ coverFile ? (coverFile.size / 1024).toFixed(1) + ' KB · 点击更换' : '支持 jpg / png，≤ 5MB' }}</span>
            <span class="ok-mark"><span v-html="ICONS.check"></span></span>
          </div>
          <input ref="coverInput" type="file" accept="image/jpeg,image/png" style="display:none" @change="onCoverPick">
        </div>

        <div class="field">
          <label>乐谱文件（选填，.kalimba.json）</label>
          <div class="up-box" :class="{ done: !!scoreFile }" id="up-score" @click="scoreInput.click()">
            <span class="ic" v-html="scoreFile ? ICONS.check : ''"></span>
            <span class="tt">{{ scoreFile ? (scoreFile.fileName || '沿用原乐谱附件') : '上传乐谱 JSON' }}</span>
            <span class="dd">{{ scoreFile ? ((scoreFile.size || 0) / 1024).toFixed(1) + ' KB · 点击更换' : '可从制谱工作台一键带入' }}</span>
            <span class="ok-mark"><span v-html="ICONS.check"></span></span>
          </div>
          <input ref="scoreInput" type="file" accept=".json,application/json" style="display:none" @change="onScorePick">
        </div>

        <div class="field">
          <label>下载权限（乐谱附件的下载条件）</label>
          <div class="tag-pick" id="vis-pick">
            <span
              v-for="[v, label] in VIS_OPTIONS"
              :key="v"
              class="chip"
              :class="{ on: vis === v }"
              :data-v="v"
              @click="setVis(v)"
            >{{ label }}</span>
          </div>
          <div class="tip" id="vis-tip">{{ visTip }}</div>
        </div>

        <div class="pub-actions">
          <button class="btn ghost" id="pub-draft" type="button" :disabled="submitting || draftSaving" @click="saveDraft">
            {{ draftSaving ? '保存中…' : '存为草稿' }}
          </button>
          <button class="btn primary" id="pub-btn" type="button" :disabled="submitting || draftSaving" @click="submit">
            {{ submitting ? (editId ? '保存中…' : '发布中…') : (editId ? (postStatus === 3 ? '发布' : '保存修改') : '发布谱帖') }}
          </button>
        </div>
      </div>
    </template>
  </main>
</template>
