/* 通用工具 —— 与 V3 `web/assets/app.js` 的 esc / fmtDur 等对应 */

/** HTML 转义：仅用于 **v-html 拼接** 的场景（评论、后端口径文案等）。
 *  Vue 模板里的插值 `{{ }}` 本身已转义，不需要它 —— 不要无谓地双重转义。 */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/** 秒 → mm:ss（试听时长展示） */
export function fmtDur(sec) {
  const s = Math.round(sec)
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/** 后端时间串 "2026-10-03T10:20:30" → "2026-10-03 10:20"（管理页用） */
export function fmtTime(s) {
  return s ? String(s).slice(0, 16).replace('T', ' ') : ''
}

/** 取昵称首字（头像占位） */
export function initial(name) {
  return esc(String(name || '琴').slice(0, 1))
}

/** 消息页用的相对时间：刚刚 / N 分钟前 / N 小时前 / 昨天 HH:mm / MM-DD HH:mm。
 *  ⚠️「今天」要按**日期**比，不能用 `diff < 24h` —— 否则 23:30 的消息在次日 00:10
 *  会被说成「1 小时前」，而它其实已经跨天了，用户会对不上。 */
export function fmtRelative(iso) {
  const raw = String(iso || '')
  if (!raw) return ''
  const t = new Date(raw.replace(' ', 'T'))
  if (isNaN(t.getTime())) return raw          // 解析不了就原样显示，别显示 Invalid Date
  const now = new Date()
  const min = Math.floor((now.getTime() - t.getTime()) / 60000)
  if (min < 0) return fmtTime(raw)            // 时钟漂移出来的「未来」→ 退回绝对时间
  if (min < 1) return '刚刚'
  if (min < 60) return min + ' 分钟前'
  const day = (d) => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
  const clock = raw.slice(11, 16)
  if (day(t) === day(now)) return Math.floor(min / 60) + ' 小时前'
  if (day(t) === day(new Date(now.getTime() - 86400000))) return '昨天 ' + clock
  return raw.slice(5, 10) + ' ' + clock
}
