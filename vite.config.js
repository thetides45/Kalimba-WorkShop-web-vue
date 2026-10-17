import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/* 拇指琴谷 · Vue 版构建配置
   ------------------------------------------------------------
   · dev / preview 都用 **同源代理** 把 /api 转发到 8080：
     后端 CORS 白名单是按来源逐条配的（现只有 5173/其它开发端口），
     新前端跑在 5174 会被判 `Invalid CORS request`（403）。
     走代理后浏览器看到的是同源请求，与端口无关。
   · 构建产物默认**直连 8080**（与 V3 同一口径），部署时可用
     `<script>window.API_BASE='...'</script>` 或同源反代覆盖。
   · dev 端口 5174 / preview 端口 5175，刻意避开 V3 静态版的 5173，
     方便两套前端同时起、逐页对照。 */
/* 代理选项。
   ⚠️ 必须删掉 `Origin`：本代理是**同源**转发（页面在 5174、请求也打到 5174），
   但按 Fetch 规范 **POST/PUT/DELETE 即使是同源也会带 Origin 头**；
   代理原样转发后，后端的 CORS 过滤器会拿这个 Origin 去比对白名单，
   而白名单是按端口逐条配的（不含新前端端口）→ 直接 403 `Invalid CORS request`。
   删掉 Origin 后，后端视其为非跨域请求，正常处理。
   （GET 不带 Origin，所以只有写接口会踩到 —— 实测就是 `/api/auth/refresh` 报 403。） */
const proxy = {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
    configure: (proxyServer) => {
      proxyServer.on('proxyReq', (proxyReq) => {
        proxyReq.removeHeader('origin')
        proxyReq.removeHeader('referer')
      })
    }
  },
  /* ⚠️ `/uploads` **也必须代理**：帖子封面是后端静态资源的**绝对路径**（`/uploads/img/xxx.png`），
     浏览器会拿它打到**当前 origin** —— dev 下就是 5174。只代理 `/api` 的话这些图在 dev 里
     永远 404（`complete:true` 但 `naturalWidth:0`），原来缩略图只有 46×58 看不出来，
     换成大封面（`.card-big .cover`）就一眼是破图（**2026-10-11 才发现，此前一直没代理**）。
     图片是 GET、不带 Origin，所以不需要 removeHeader。 */
  '/uploads': { target: 'http://localhost:8080', changeOrigin: true }
}

export default defineConfig({
  /* Element Plus **按需引入**（不再 `app.use(ElementPlus)` + 全量 CSS）：
       · 当前页面只用函数式 API（ElMessage / ElMessageBox，见 stores/ui.js），
         由 AutoImport 注入 import 并顺带引入对应样式；
       · 将来若在模板里写 <el-table> / <el-pagination> 之类，Components 会自动接管，
         同样无需手工 import 样式。
     `dts: false` —— 纯 JavaScript 项目，不需要生成 auto-imports.d.ts。 */
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()], dts: false }),
    Components({ resolvers: [ElementPlusResolver()], dts: false })
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  /* host 固定 IPv4：默认的 `localhost` 在 Windows 上会解析成 `::1`（只监听 IPv6），
     导致访问地址与 V3（`127.0.0.1:5173`）不一致、HMR 的 WebSocket 也容易连不上。 */
  server: { host: '127.0.0.1', port: 5174, strictPort: false, proxy },
  preview: { host: '127.0.0.1', port: 5175, strictPort: false, proxy },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 }
})
