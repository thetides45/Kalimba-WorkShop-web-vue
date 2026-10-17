import { createApp } from 'vue'
import { createPinia } from 'pinia'

/* 样式加载顺序：
   ① V3 全站样式（原 web/assets/style.css **原样搬来**，保证视觉一致）
   ② Element Plus 主题覆盖（把组件库拉回木质暖色口径）
   ⚠️ **不再引 `element-plus/dist/index.css`**（那份是全量样式，约 400KB）——
      组件样式由按需引入插件在编译期自动注入，见 vite.config.js 的
      AutoImport / Components。 */
import '@/styles/v3.css'
import '@/styles/element-theme.css'

import App from './App.vue'
import router from './router'
import { setAuthAdapter } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)
/* ⚠️ 不要 `app.use(ElementPlus)` —— 全量注册会把整个组件库拉进包，抵消按需引入。
   用到的组件/API 由 vite 插件在编译期自动引入（含样式）。 */

/* 把登录态注入 HTTP 层 —— http.js 不反向 import store，避免循环依赖 */
const auth = useAuthStore()
setAuthAdapter({
  getToken: () => auth.token,
  setSession: (s) => auth.set(s),
  clear: () => auth.clear()
})

app.mount('#app')
