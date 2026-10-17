/* 路由表 —— 与 V3 的 11 个 .html 一一对应：
     /            ← index.html
     /works       ← works.html
     /composer    ← composer.html（内嵌制谱内核，见 ComposerView）
     /login       ← login.html
     /post/:id    ← post.html?id=
     /publish/:id?← publish.html（带 id 即编辑态）
     /user/:id?   ← user.html?id=
     /notifications ← notifications.html
     /search      ← search.html（keyword/type 走 query）
     /admin       ← admin.html
     /404         ← 404.html，其余全部重定向到这里
   组件一律懒加载：既减小首屏，也避免 store/api 与 router 形成模块循环依赖。 */
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { title: '拇指琴谷 · 卡林巴琴谱社区' } },
  { path: '/works', name: 'works', component: () => import('@/views/WorksView.vue'), meta: { title: '作品广场 · 拇指琴谷' } },
  { path: '/composer', name: 'composer', component: () => import('@/views/ComposerView.vue'), meta: { title: '在线制谱 · 拇指琴谷' } },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: '登录 / 注册 · 拇指琴谷' } },
  { path: '/post/:id', name: 'post', component: () => import('@/views/PostView.vue'), meta: { title: '帖子详情 · 拇指琴谷' } },
  { path: '/publish/:id?', name: 'publish', component: () => import('@/views/PublishView.vue'), meta: { title: '发布谱帖 · 拇指琴谷' } },
  { path: '/user/:id?', name: 'user', component: () => import('@/views/UserView.vue'), meta: { title: '个人主页 · 拇指琴谷' } },
  { path: '/notifications', name: 'notifications', component: () => import('@/views/NotificationsView.vue'), meta: { title: '消息通知 · 拇指琴谷' } },
  { path: '/search', name: 'search', component: () => import('@/views/SearchView.vue'), meta: { title: '搜索 · 拇指琴谷' } },
  { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { title: '后台管理 · 拇指琴谷' } },
  /* 404 与首页一样不显示页脚（对齐 V3 的 404.html：只有顶栏，没有 site-foot） */
  { path: '/404', name: 'notFound', component: () => import('@/views/NotFoundView.vue'), meta: { title: '404 · 拇指琴谷', noFooter: true } },
  { path: '/:pathMatch(.*)*', redirect: '/404' }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 }
  }
})

/* 标题：默认取 meta.title；详情页等会在组件内再覆盖一次（与 V3 的 document.title 行为一致） */
router.afterEach((to) => {
  if (to.meta && to.meta.title) document.title = to.meta.title
})

export default router
