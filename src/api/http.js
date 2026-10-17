/* ============================================================
   拇指琴谷 · HTTP 层（Vue 版）
   ------------------------------------------------------------
   与 V3 `web/assets/api.js` 的 http / rawFetch / tryRefresh 语义**一一对应**：
     · 鉴权走**自定义请求头 `sa-token`**（不是 Bearer，也不是 Cookie）
     · 本项目业务错误**一律 HTTP 200**，判据只在 body.code，不看 HTTP 状态码
     · `code === 2001` → 先**静默续期一次**再重放，避免「只是过期」被当成「被踢下线」
     · `isForm = true` 时不设 Content-Type，交给浏览器生成 multipart boundary
     · 附件接口（/api/files/{id}）**不走** R{code,message,data} 包裹 → 用 rawFetch
   ------------------------------------------------------------
   登录态由 `setAuthAdapter()` 注入，避免 http 层反向依赖 Pinia store。
   ============================================================ */

/** 后端基址。
 *  · 显式 `window.API_BASE` 优先（部署时的覆盖入口，与 V3 同一约定）
 *  · dev 环境返回 ''（同源）：请求走 Vite 的 /api 代理 → 8080，
 *    绕开后端按来源逐条配置的 CORS 白名单（新端口不在名单里会 403）
 *  · 构建产物回落直连 http://localhost:8080（与 V3 完全一致） */
export function base() {
  if (typeof window !== 'undefined' && window.API_BASE) return window.API_BASE
  try {
    if (import.meta.env && import.meta.env.DEV) return ''
  } catch (e) { /* 非 Vite 运行时（如单测）忽略 */ }
  return 'http://localhost:8080'
}

/* 登录态适配器：由 main.js 注入（读 token / 写会话 / 清会话） */
let A = {
  getToken: () => '',
  setSession: () => {},
  clear: () => {}
}
export function setAuthAdapter(a) {
  if (a) A = a
}

export function token() {
  try { return A.getToken() || '' } catch (e) { return '' }
}

/* ---- 令牌静默续期 ----
   同一个请求只续期**一次**（http 的 retried 标记），续期本身再失败就清会话跳登录 ——
   否则「令牌过期」会退化成「无限重试」。 */
let refreshing = null
export function tryRefresh() {
  if (refreshing) return refreshing
  refreshing = fetch(base() + '/api/auth/refresh', { method: 'POST', headers: { 'sa-token': token() } })
    .then((res) => res.json().catch(() => ({ code: -1 })))
    .then((r) => {
      if (r && r.code === 0 && r.data) {
        A.setSession({
          accessToken: r.data.token,
          refreshToken: r.data.token,
          user: {
            id: String(r.data.userId), username: r.data.username,
            nickname: r.data.nickname, avatar: r.data.avatar || '', role: r.data.role
          }
        })
      }
      return r
    })
    .catch(() => ({ code: -1 }))
  return refreshing
}

/**
 * 统一请求：自动带 sa-token；统一拆解 R{code,message,data}。
 * @param {string} method
 * @param {string} path  形如 '/api/posts'
 * @param {*} body      普通请求为对象（会被 JSON.stringify）；isForm 时为 FormData
 * @param {boolean} isForm
 * @param {boolean} retried  true 表示这次是「续期后重放」，不再二次续期
 */
export function http(method, path, body, isForm, retried) {
  const headers = {}
  const t = token()
  if (t) headers['sa-token'] = t
  let payload
  if (isForm) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  return fetch(base() + path, { method, headers, body: payload })
    .then((res) => res.json().catch(() => ({ code: res.status, message: 'HTTP ' + res.status, data: null })))
    .then((data) => {
      if (data && data.code === 2001) {
        if (!retried) {
          return tryRefresh().then((rf) => {
            if (rf && rf.code === 0) return http(method, path, body, isForm, true)
            A.clear()
            return data
          })
        }
        A.clear()
      }
      return data
    })
    .catch((e) => ({ code: -1, message: '网络错误：' + e.message, data: null }))
}

/** 原始请求：用于**非** R{code,...} 包裹的接口（如乐谱附件直出文件）。
 *  ⚠️ 必须带 sa-token —— 附件接口 2026-10-03 起需登录，
 *  所以不能靠 <a href> 直接下载（<a> 发不出自定义头），只能 fetch 成 Blob 再存。 */
export function rawFetch(path) {
  const headers = {}
  const t = token()
  if (t) headers['sa-token'] = t
  return fetch(base() + path, { headers }).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.text()
  })
}

/** 带鉴权头取二进制（下载用：fetch → Blob → 触发浏览器下载） */
export function rawBlob(path) {
  const headers = {}
  const t = token()
  if (t) headers['sa-token'] = t
  return fetch(base() + path, { headers }).then((res) => {
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.blob()
  })
}
