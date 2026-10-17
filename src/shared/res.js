/* 统一错误处理 —— 与 V3 `web/assets/app.js` 的 handleRes 语义一致。
   ⚠️ 后端的「未登录/登录已过期」错误码是 **2001**（ErrorCode.UNAUTHORIZED），
      而旧文档写的是 40100 / 40102（后端从没返回过）。
      api 层会先尝试**静默续期**；续期也失败才会走到这里，因此这时确实该去登录。
      带上 next= 便于登录后回到原页。 */
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { router } from '@/router'

const AUTH_CODES = [2001, 40100, 40102]

/**
 * @param {object} res  接口返回体 { code, message, data }
 * @param {string} fallbackMsg 兜底文案
 * @returns {boolean} 是否成功（code === 0）
 */
export function handleRes(res, fallbackMsg) {
  if (!res) {
    useUiStore().toast(fallbackMsg || '服务异常，请稍后重试')
    return false
  }
  if (res.code === 0) return true

  if (AUTH_CODES.includes(res.code)) {
    useAuthStore().clear()
    router.push({
      path: '/login',
      query: { next: router.currentRoute.value.fullPath }
    })
    return false
  }

  useUiStore().toast(res.message || fallbackMsg || '服务异常，请稍后重试')
  return false
}

/** 「请先登录，否则跳登录页」——对应 V3 的 requireLogin()。
 *  @returns {boolean} 已登录为 true；未登录会提示并跳转，返回 false */
export function requireLogin(next) {
  const auth = useAuthStore()
  if (auth.isLogin) return true
  useUiStore().toast('请先登录')
  const target = next || router.currentRoute.value.fullPath
  setTimeout(() => {
    router.push({ path: '/login', query: { next: target } })
  }, 600)
  return false
}
