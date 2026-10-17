/* 全局反馈（Pinia）：toast / 确认框 / 输入框 —— 统一走 Element Plus，
   并套上 V3 的外观口径（自定义 class，样式在 styles/element-theme.css 里覆盖）：
     · toast   → ElMessage + .kc-toast      ⇒ 还原 V3 底部深色胶囊
     · confirm → ElMessageBox + .kc-modal   ⇒ 还原 V3 木质圆角模态
   这样「用了 Element Plus」与「看起来还是拇指琴谷」两件事同时成立。 */
import { defineStore } from 'pinia'

/* ⚠️ 这里**故意不写** `import { ElMessage, ElMessageBox } from 'element-plus'`：
   它们由 unplugin-auto-import 在编译期按需注入（顺带引入对应样式）。
   一旦显式 import，插件就会跳过它，样式也就不会自动带上 —— 组件将「能跑但没样式」。 */

export const useUiStore = defineStore('ui', {
  state: () => ({
    /** PWA 安装卡片是否已被用户关掉（与 V3 同一 localStorage key） */
    pwaDismissed: (() => { try { return localStorage.getItem('kc_pwa_dismissed') === '1' } catch (e) { return false } })()
  }),

  actions: {
    /** 轻提示：等价 V3 的 toast()，2200ms 自动消失 */
    toast(message) {
      ElMessage({
        message: String(message == null ? '' : message),
        duration: 2200,
        customClass: 'kc-toast',
        grouping: true
      })
    },

    /** 确认框：等价 V3 的 window.confirm，返回 boolean（取消不抛错） */
    async confirm(message, title) {
      try {
        await ElMessageBox.confirm(message, title || '确认操作', {
          customClass: 'kc-modal',
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          closeOnClickModal: true,
          showClose: false,
          distinguishCancelAndClose: false
        })
        return true
      } catch (e) { return false }
    },

    /** 输入框：等价 V3 的 window.prompt（举报原因用），取消返回空串 */
    async prompt(message, title, placeholder) {
      try {
        const r = await ElMessageBox.prompt(message, title || '请输入', {
          customClass: 'kc-modal',
          confirmButtonText: '提交',
          cancelButtonText: '取消',
          inputPlaceholder: placeholder || '',
          inputType: 'textarea',
          inputValidator: (v) => (v && v.trim() ? true : '内容不能为空')
        })
        return (r && r.value ? r.value : '').trim()
      } catch (e) { return '' }
    },

    dismissPwa() {
      this.pwaDismissed = true
      try { localStorage.setItem('kc_pwa_dismissed', '1') } catch (e) { /* ignore */ }
    }
  }
})
