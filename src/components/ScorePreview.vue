<script setup>
/* =====================================================================
   帖子内嵌 · 乐谱预览组件（复用制谱内核）
   ---------------------------------------------------------------------
   与 `public/score-preview-demo.html` 是**同一套胶水逻辑**的正式版，版式已定稿。
   组件 = 「卡外播放条」+「一个承载内核单文件的 iframe」，**内核零改动**：
   谱面渲染 / 排版 / 悬浮音名 / 播放 / 竖向进度条全部是内核本尊在跑。

   数据入口：内核导出 JSON 的 `source`（简谱原文）。
   内核没有 JSON 导入 —— 它自己「重新打开一份谱」的入口就是这段原文
   （`composer.html` 里有明确注释）。**格式以内核为唯一真源。**

   版式（2026-10-13 定稿）：
     · 卡片 600 × 600（17 键）= 62 左轨（内核 RD.LEFT，留给符干/符尾）
       + 476 网格 + 62 右留白；21 键按谱面实宽自动算（见 fitToScore）。
     · 右侧那 62 是**竖向播放进度条**的落点（内核 #progBar 宽 10、贴预览区右缘）。
     · 播放按钮**在卡片外面** —— 卡片正上方一条与卡片同宽的横条里，左对齐。
       谱面上不留任何浮层：浮层会压住 svg 里画的页眉文字，位置怎么挪都要避让。
     · 内核右侧的「简谱对照带」（RD.RIGHT = 108）整体裁掉：
       连续预览下它本就是空的一块（内核宽度是写死的，勾不勾都留那 108）。

   ⚠️ 与内核的耦合点集中在本文件的 RD_* 常量与 EMBED_CSS 里 .top / #svgHost 两条 ——
      内核一改（列宽、RD 表、DOM 结构、#progBar 类名），这里要同步。
   ===================================================================== */
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  /** 内核简谱原文（导出 JSON 的 source）。空则不渲染卡内谱面。 */
  source: { type: String, default: '' },
  /** 预览区高度；宽度由谱面实宽算出 */
  height: { type: Number, default: 600 }
})

const fr = ref(null)
const btnText = ref('▶ 播放')
const cardW = ref(600)          // 依谱面实宽算出，见 fitToScore()

let doc = null                  // 内核文档（同源，可直接操作）
let win = null
let obs = null                  // 镜像 #btnPlay 文案用

/* ---------- 内核版式常量（与 kalimba-tab/index.html 的 RD 对齐）----------
   LEFT  = RD.LEFT   左轨：留给符干 / 符尾（右侧留白照它取，左右才等宽）
   RIGHT = RD.RIGHT  右侧「简谱对照带」——本组件**砍掉** */
const RD_LEFT = 62
const RD_RIGHT = 108

/* 把内核外壳剥成「只有谱面预览区」。只动**外观**，不动任何渲染逻辑。 */
const EMBED_CSS = [
  'html,body{height:100%; margin:0; background:#fff}',
  /* ★ 顶栏（连同复位 / 播放 / 停止 / 导出 / 打印那排按钮）**整条隐藏**：
     播放按钮已挪到卡片外面。⚠️ 隐藏 ≠ 失效 —— #btnPlay 仍在 DOM 里，
     卡外那颗点它时把 click 转交过去，走的还是内核原有的 play() → syncPlayBtn() 链路。 */
  '.top{display:none !important}',
  '.brand{display:none !important}',
  '.main{display:block !important; min-height:0 !important; height:100% !important}',
  '.panel.left{display:none !important}',
  '.panel.right{height:100% !important; padding:0 !important; background:#fff !important}',
  '.toolbar{display:none !important}',
  '.workRow{display:block !important; height:100% !important}',
  '.stageWrap{display:block !important; height:100% !important}',
  /* 横向 padding 归零：谱面左缘贴容器左缘，左侧留白完全由内核左轨构成 */
  '.stage{height:100% !important; max-height:none !important; border:0 !important;' +
    ' border-radius:0 !important; padding:10px 0 0 !important}',
  /* ★ 砍掉右侧「简谱对照带」：宽度由 fitToScore() 按谱面实宽写死，多出的 108 裁掉 */
  '#svgHost{overflow:hidden !important}',
  /* 隐藏内核滚动条：它在右侧占 15px，会破坏「左右留白等宽」；滚轮/触控板照常可滚 */
  '#stage::-webkit-scrollbar{width:0 !important; height:0 !important}',
  '.stage, #stage{scrollbar-width:none}',
  '.warnbox,.legend{display:none !important}',
  '#attach{display:none !important}',
  '.dlgMask{display:none !important}'
  /* 竖向进度条**接上**：内核本就有它（#progBar 的 display:none + .on{display:block}
     由 syncProg() 控制显隐），这里刻意**不写**覆盖规则，它自己就是「有谱才显示」。
     落点 right = 滚动条净宽(0) + 边框(0) + 5 = 5，正好落在右侧那 62 留白里。 */
].join('\n')

/* ---------- 装配 ---------- */
function injectCSS() {
  if (doc.querySelector('style[data-kal-embed]')) return
  const s = doc.createElement('style')
  s.setAttribute('data-kal-embed', '1')
  s.textContent = EMBED_CSS
  doc.head.appendChild(s)
}

/** 把简谱原文灌回内核的输入框，再走内核自己的「生成琴谱」路径 */
function feed() {
  const src = doc.getElementById('src')
  if (!src) return false
  src.value = props.source
  doc.getElementById('btnParse').click()      // → rebuild(true) → draw()
  return true
}

/** 按谱面实宽定卡片宽：砍掉 108 简谱对照带，右侧再留 62 给进度条 */
function fitToScore() {
  const host = doc.getElementById('svgHost')
  const svgEl = host && host.querySelector('svg')
  if (!host || !svgEl) return
  const full = parseFloat(svgEl.getAttribute('width')) || 646    // 17 键 → 646、21 键 → 695
  const hostW = Math.max(0, full - RD_RIGHT)                      // 17 键 → 538
  host.style.width = hostW + 'px'
  cardW.value = hostW + RD_LEFT                                   // 17 键 → 600
}

/** 只读化：悬浮音名保留，去掉「点某一列试听」的点击效果 */
function readOnlyAxis() {
  const axis = doc.getElementById('axisBar')
  if (!axis) return
  axis.style.pointerEvents = 'none'
  axis.style.cursor = 'default'
  axis.removeAttribute('title')      // 提示语写着「可试听」，去掉免得误导
}

/** 单栏连续预览：默认即是（paged=false），这里显式兜一次底 */
function singleColumn() {
  const paged = doc.getElementById('optPaged')
  if (paged) paged.checked = false
  if (typeof win.draw === 'function') win.draw()
}

/** 卡外播放按钮 = 内核 #btnPlay 的**镜像**：
    点击转交 .click()（走内核原有事件链路，行为零重写）；
    文案用 MutationObserver 照抄内核，不做二次判断（内核改措辞/图标会自动跟上）。
    ⚠️ #btnPlay 此刻 display:none，但 .click() 对隐藏元素照样派发事件。 */
function mirrorPlay() {
  const src = doc.getElementById('btnPlay')
  if (!src) return
  const pull = () => { btnText.value = src.textContent }
  if (obs) obs.disconnect()
  obs = new MutationObserver(pull)
  obs.observe(src, { childList: true, characterData: true, subtree: true })
  pull()
}

function onPlayClick() {
  const b = doc && doc.getElementById('btnPlay')
  if (b) b.click()
}

function apply() {
  if (!doc || !props.source) return
  try {
    injectCSS()
    if (!feed()) return
    fitToScore()
    readOnlyAxis()
    singleColumn()
    mirrorPlay()
  } catch (e) {
    /* 不吞错：这个组件一旦半途失败，页面会**静默**停在内核自带的样例谱上
       （看起来「有谱」，其实根本不是这篇帖的）—— 必须留下痕迹。 */
    console.error('[ScorePreview] 装配内核失败：', e)
  }
}

/* 内核就绪的重试计数（见 setup()） */
let tries = 0

function setup() {
  const f = fr.value
  if (!f) return
  let d = null
  try { d = f.contentDocument } catch (e) { d = null; }
  /* ⚠️ 不能只装配一次：`load` 触发时 iframe 里可能**还是空文档**（内核的 HTML 尚未成为
     当前文档），此时 `#src` 取不到。2026-10-13 匿名复核实测到过一次，表现是页面停在
     内核自带样例谱、`.top` 也没被隐藏 —— 而且**不报任何错**。所以这里重试到内核就绪。 */
  if (!d || !d.getElementById('src')) {
    if (tries++ < 40) setTimeout(setup, 150)
    return
  }
  tries = 0
  doc = d
  win = f.contentWindow
  doc.title = '乐谱预览'
  apply()
}

/* 内核就绪：优先用 load 事件；若已 complete（缓存 / 二次挂载）则直接装。
   ⚠️ 两条路都走 setup()，由它自己保证「内核没就绪就重试」。 */
function onLoad() {
  tries = 0
  setup()
}

watch(() => props.source, () => { if (doc) apply() })

onBeforeUnmount(() => {
  tries = 999            // 停掉可能还在排队的重试
  if (obs) { obs.disconnect(); obs = null }
})
</script>

<template>
  <div class="sp" :style="{ width: cardW + 'px' }">
    <!-- 卡外播放条：在卡片**外面**、卡片正上方，与卡片同宽，按钮左对齐 -->
    <div class="sp-bar">
      <button class="sp-play" type="button" @click="onPlayClick">{{ btnText }}</button>
    </div>

    <div class="sp-card" :style="{ height: height + 'px' }">
      <!-- allow="autoplay"：播放按钮在**父页**，若用户激活不向同源子框传播，
           子框的 AudioContext 就可能起不来；两边都不靠运气。 -->
      <iframe
        ref="fr"
        src="/composer.html"
        allow="autoplay"
        title="乐谱预览（只读）"
        @load="onLoad"
      ></iframe>
    </div>
  </div>
</template>

<style scoped>
.sp { max-width: 100%; }

/* ── 外置播放条 ─────────────────────────────────────────────────────────
   条与卡片**同宽**、紧贴卡片上沿；条本身透明（页面底色），
   视觉上就是一颗浮在卡外的按钮。 */
.sp-bar { height: 44px; display: flex; align-items: center; }

/* 与内核 #btnPlay（木色主按钮）同一套观感：--wood 底 + 米白字 + radius 10 */
.sp-play {
  font-family: var(--sans, inherit); font-size: 13px; line-height: 1.55;
  padding: 8px 18px; border-radius: 10px; cursor: pointer;
  white-space: nowrap; min-width: 82px; text-align: center;
  border: 1px solid var(--wood, #5D4432);
  background: var(--wood, #5D4432); color: #F7F2E8;
  transition: .14s background, .14s border-color;
}
.sp-play:hover { background: var(--wood-deep, #4A3627); border-color: var(--wood-deep, #4A3627); }
.sp-play:active { transform: translateY(.5px); }

.sp-card {
  position: relative; overflow: hidden; background: #fff;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--hairline, #EDE7DE), 0 10px 30px rgba(62, 43, 30, .07);
}
.sp-card iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
</style>
