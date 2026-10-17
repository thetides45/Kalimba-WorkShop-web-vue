/* =====================================================================
   拇指琴谷 · Service Worker（Vue 版 PWA）
   ---------------------------------------------------------------------
   与 V3 `web/sw.js` 同源，只按 SPA 的形态调整了**预缓存清单**：
     · V3 是多页站，预缓存了 9 个 .html；SPA 只有一个 index.html，
       其余路由由前端渲染 → 预缓存只留壳与图标
     · 构建产物的 JS/CSS 带内容哈希、文件名不可预知 → 交给运行时缓存
     · 导航兜底统一回落到 index.html（SPA 的任意路由都能由它接管）

   缓存策略（2026-10-10 按缺口 F15 收窄）：
     · 页面导航        → network-first：内容必须是新的，断网才回落缓存，最后兜底应用壳
     · 离线降级        → ★ 2026-10-15：断网打开**首页**时交回制谱器（见 navigate 分支）
     · 构建产物        → cache-first：仅 `/assets/**`（Vite 的输出目录）
     · 壳 / 图标 / 制谱器 → cache-first：下面 PRECACHE 那一小撮
     · 其余同源 GET    → **完全不接管**（直连网络、不进缓存）
     · /api/** 与跨域请求 → 一律不拦：动态数据与后端（8080）、字体 CDN 交给浏览器

   ⚠️ F15：收窄之前是对**一切同源 GET** 做 cache-first —— 本意是「构建产物带哈希，
      交给运行时缓存」，但实现比意图宽得多：dev 下的模块图（`/src/**`、`/@vite/**`、
      `/node_modules/.vite/deps/**`）也是同源 GET，于是被一起缓存
      （实测缓存 45 项里 39~40 项是 dev 模块）。后果：
        · 模块被 cache-first 命中 → 出现「壳是新的、模块是旧的」
        · 缓存无限膨胀，且 dev server 停掉后可能「壳在、模块不在」
      现在按路径白名单收窄：
        · 生产构建：模块在 `/assets/` 带内容哈希 → 照常缓存，离线**完整可用**
        · dev 开发：模块在 `/src/` 等路径 → 不进缓存，杜绝污染
      VERSION 由 v1 升到 v2，`activate` 会自动清掉旧的那份脏缓存。

   注意：Service Worker 只在 **HTTPS 或 localhost** 下生效；用 file:// 直接打开
        页面时不会注册，这是浏览器规则，不是代码问题。
   ===================================================================== */
/* ⚠️ 升版本号的判据只有一个：**只要 `PRECACHE` 里的东西变了就得升** ——
   不升的话 activate 不清旧缓存，装过 PWA 的浏览器会一直拿到旧副本。
   · v3 → v4（2026-10-16 上午）：composer.html 加了离线降级弹窗 + 注入层加了「← 回拇指琴谷」入口。
   · v4 → v5（2026-10-16 下午）：内核加了「JSON 导入」，composer.html 随之重新生成。 */
const VERSION = 'kalimba-pwa-vue-v5'

/* 预缓存「应用壳 + 制谱器 + 图标」。
   ★ 2026-10-15：**把 composer.html 加了进来**。v2 时是刻意不含的（当时的理由：280KB、
     不是门户主路径，靠导航分支"访问过就进缓存"即可）。现在要它，是因为新增的
     「PWA 离线启动直接进制谱器」这条降级路径要求它**离线时一定拿得到** ——
     只靠运行时缓存的话，从没点过制谱器的用户离线打开会落到应用壳，降级就落空了。
     代价：SW 安装时多下载约 279KB（可接受）。
   ⚠️ 改了清单**必须升 VERSION** —— activate 只清「非当前版本」的缓存，
      不升的话老用户那份 v2 缓存不会被清，新清单也就不会生效。
   它是自包含单文件（内核已内联、零外链、零 fetch —— 2026-10-15 实测），
   不带任何 dev 模块引用，所以缓存它不会造成「新壳旧模块」。 */
const PRECACHE = [
  './',
  './index.html',
  './composer.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
]

/* 上面这几件在 scope 内的绝对路径 —— 运行时用来判断「这是不是我们认识的静态家具」。 */
const SHELL_PATHS = PRECACHE.map((p) => new URL(p, self.location).pathname)

/* 「站点首页」的两个等价形态：`/`（manifest 的 start_url 用的就是它）与 `/index.html`。
   部署在子路径时这两个值自带前缀，所以用 new URL 解析而不是写死字符串。 */
const SHELL_ROOT = new URL('./', self.location).pathname
const SHELL_INDEX = new URL('./index.html', self.location).pathname
function isShellRoot(pathname) {
  return pathname === SHELL_ROOT || pathname === SHELL_INDEX
}

/* F15：哪些同源 GET 才允许被 cache-first 接管？
     · `/assets/**` —— Vite 构建产物。用「路径里含 /assets/」而不是 startsWith，
       这样部署在子路径（`/myapp/assets/…`）时也成立。
     · 壳与图标 —— 上面 SHELL_PATHS 那一小撮。
   其余一律**直连网络**（见 fetch 里的说明）。 */
function isCacheablePath(pathname) {
  return /\/assets\//.test(pathname) || SHELL_PATHS.indexOf(pathname) >= 0
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((cache) =>
      /* 逐个 add 而不是 cache.addAll：addAll 是原子的，任何一个 404 会让整次安装失败，
         那样连 SW 都装不上。这里允许个别资源缺失，只跳过它。 */
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    /* 清掉所有**旧版本**缓存（含 v1 那份被 dev 模块塞满的脏缓存）。 */
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/* 页面可通过 postMessage({type:'SKIP_WAITING'}) 触发立即更新 */
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})

function putIfOk(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const copy = response.clone()
    caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {})
  }
  return response
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return                     // 写操作直连，绝不缓存

  let url
  try { url = new URL(req.url) } catch (_) { return }
  if (url.origin !== self.location.origin) return      // 后端 8080、字体 CDN：不拦
  if (url.pathname === '/api' || url.pathname.indexOf('/api/') === 0) return  // 动态数据不缓存

  /* 页面导航：先走网络（保证看到最新内容），失败再回落缓存，最后兜底应用壳。
     导航**始终**接管 —— 它正是离线兜底依赖的那一环，不能省。
     写回的是「文档本身」（每个访问过的路由各存一份），但那是 HTML 壳、
     不是 dev 模块，不违反 F15 的收窄口径。 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => putIfOk(req, res))
        .catch(() => {
          /* ★ 2026-10-15 离线降级：断网时打开**站点首页** → 把制谱器交出去。
             制谱器是本地优先的单文件工具，离线对它毫无影响；而离线状态下的首页数据全空、
             等于白开一次，远不如直接进一个能用的工具。
             ⚠️ 这段必须放在 `caches.match(req)` **之前**：首页（`./` 与 `./index.html`）
                本身就在 PRECACHE 里，先查缓存必然命中，这条分流就永远轮不到执行。
             ⚠️ **只认首页**。离线打开 /post/123、/works 时，用户想看的是那条内容本身，
                丢进制谱器属于语义错位 —— 那些路径维持原样（下面那行）。
             ⚠️ 这里是**兜底**，负责 navigator.onLine 说谎的情况（连着无网路由器时它仍是 true）。
                飞行模式/拔网线那种 onLine 立刻为 false 的场景，由 index.html 里的早期脚本
                抢先处理 —— 那条路不必等这里的网络超时。 */
          if (isShellRoot(url.pathname)) {
            return caches.match('./composer.html').then((c) => c || caches.match('./index.html'))
          }
          return caches.match(req).then((hit) => hit || caches.match('./index.html'))
        })
    )
    return
  }

  /* F15：既不是构建产物、也不在壳/图标清单里的同源资源 → 直连网络。
     这里**刻意不调用 e.respondWith** —— 等于把请求整个交回浏览器的默认行为，
     既不读缓存也不写缓存。（dev 的 /src/**、/@vite/**、/node_modules/** 走的都是这条路。） */
  if (!isCacheablePath(url.pathname)) return

  /* 构建产物与壳：缓存优先，未命中再请求并把结果写回缓存 */
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit
      return fetch(req)
        .then((res) => putIfOk(req, res))
        .catch(() => hit)
    })
  )
})
