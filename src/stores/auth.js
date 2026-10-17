/* 登录态（Pinia）—— 与 V3 `web/assets/app.js` 的 Auth 完全兼容：
   同一 localStorage key `kc_auth`、同一结构（accessToken/refreshToken/user），
   所以两套前端在同一浏览器里可以互相识别登录态。 */
import { defineStore } from 'pinia'

const KEY = 'kc_auth'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch (e) { return null }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({ session: read() }),

  getters: {
    user: (s) => (s.session && s.session.user) || null,
    /** 登录令牌：V3 里兼容 accessToken / token 两种字段名，这里保持一致 */
    token: (s) => (s.session ? (s.session.accessToken || s.session.token || '') : ''),
    /**
     * 是否已登录 = **有令牌**（而不是「localStorage 里有东西」）。
     *
     * ⚠️ 原来写的是 `!!s.session` —— 只要 `kc_auth` 是任意**真值**就算登录：`{}`、`"abc"`、
     * `123`、`true`、`{"accessToken":"x"}`（有令牌没 user）全都算。而顶栏在那个分支里会读
     * `auth.user.id` → `user` 为 null 时抛 TypeError → **Vue 渲染中断、整页空白**
     * （标题还在，因为它在 index.html 里）。2026-10-10 实测：注入上述任一值，
     * 首页 `#app.innerHTML.length` 从 6996 直接掉到 **0**。
     * 改成「必须有令牌」后，那些垃圾值一律视为未登录 → 顶栏照常渲染。
     */
    isLogin: (s) => !!(s.session && (s.session.accessToken || s.session.token)),
    /** 是否为管理员（顶栏「管理」入口、后台页权限门都看它） */
    isAdmin() {
      const u = this.user
      return !!(u && u.role === 'admin')
    }
  },

  actions: {
    set(data) {
      this.session = data
      try { localStorage.setItem(KEY, JSON.stringify(data)) } catch (e) { /* ignore */ }
    },

    clear() {
      this.session = null
      try { localStorage.removeItem(KEY) } catch (e) { /* ignore */ }
    },

    /** 局部更新当前用户信息（编辑资料后用，避免整会话重取） */
    patchUser(part) {
      if (!this.session || !this.session.user) return
      Object.assign(this.session.user, part || {})
      try { localStorage.setItem(KEY, JSON.stringify(this.session)) } catch (e) { /* ignore */ }
    }
  }
})
