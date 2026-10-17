/* ============================================================
   拇指琴谷 · 真实接口层（Vue 版）
   ------------------------------------------------------------
   对应 V3 `web/assets/api.js`：用真实 fetch 覆盖 MockAPI 的对应方法。
   后端：http://localhost:8080 · 统一返回体 { code, message, data }
   关键：页面期望「组装好的视图对象」（author / tags / isLiked…），
        而后端返回「扁平实体」（tagIds 字符串 / userId / records），
        故此处做结构转换（含 tag、user 的缓存与拼装）。
   ============================================================ */
import { http, rawFetch, rawBlob, token } from './http'
import { MockAPI } from './mock'

/* ---------------- 结构转换 ---------------- */

/* 乐谱 JSON（.klb）→ 页面要的形状。
   ★ 格式以**内核导出**为唯一真源（`format:'kalimba-tab'`，由 kalimba-tab/index.html 产出）：
       曲名在顶层 `title`、调号在 `key.name`、速度在 `tempo`、
       琴型在 `tuning.key`（'k17' / 'k21'）、简谱原文在顶层 `source`（**字符串**）。
   ⚠️ 另一端（`meta.songTitle` / `meta.bpm` / `source.jianpuText`）是**已归档**的
      `kalimba-score` 格式的形状，不再作为解析依据；这里仍产出 `source.jianpuText`
      只是给页面一个统一取用口径 —— 它的**内容**就是内核原文。
      少了这一步，真实帖子的谱面区会**静默空白**（不报错，最难查的一类）。
   分类（琴型/调性）不从文件里编造 —— 取不到就留空，由页面决定显不显示。 */
export function normalizeScore(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.source && typeof raw.source === 'object' && raw.source.jianpuText) return raw // 已是页面形状
  const m = raw.meta || {}
  /* 琴型：内核 tuning.key 是 'k17' / 'k21' → 页面要 17 / 21 */
  const tk = (raw.tuning && raw.tuning.key) || ''
  const kalType = /^k\d+$/.test(tk) ? Number(tk.slice(1)) : (m.kalimbaType || undefined)
  return {
    meta: {
      songTitle: raw.title || m.title || m.songTitle || '',
      kalimbaType: kalType,
      key: (raw.key && raw.key.name) || m.key || '',
      bpm: raw.tempo || m.bpm
    },
    render: raw.render || {},
    source: { jianpuText: typeof raw.source === 'string' ? raw.source : '' },
    version: raw.version
  }
}

/* ---------------- 缓存与拼装 ---------------- */
let tagCache = null
function allTags() {
  if (tagCache) return Promise.resolve(tagCache)
  return http('GET', '/api/tags').then((r) => {
    tagCache = (r.code === 0 && Array.isArray(r.data)) ? r.data : []
    return tagCache
  })
}
function tagsOfIds(idsStr, all) {
  return String(idsStr || '').split(',').filter(Boolean).map((id) => {
    const t = all.filter((x) => String(x.id) === id)[0]
    return t ? { id: String(t.id), name: t.name } : null
  }).filter(Boolean)
}
const userCache = {}
function userName(id) {
  if (userCache[id]) return Promise.resolve(userCache[id])
  return http('GET', '/api/users/' + id).then((r) => {
    const u = (r.code === 0 && r.data)
      ? { id: String(r.data.id), nickname: r.data.nickname || r.data.username, avatar: r.data.avatar || '' }
      : { id: String(id), nickname: '用户' + id, avatar: '' }
    userCache[id] = u
    return u
  })
}
/* 正文块（路线 B）：后端存的是 JSON 字符串，前端要的是数组。
   ⚠️ 解析失败一律退化成**空数组**（= 「没有块」），绝不让一条脏数据把整页打挂。
   ⚠️ 已经给数组时原样返回 —— 万一后端哪天换成 @JsonRawValue 直接吐数组，这里不用改。 */
function parseBlocks(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? a : []
  } catch (e) { return [] }
}

function toListItem(p, all) {
  return userName(p.userId).then((author) => ({
    id: String(p.id), title: p.title,
    summary: p.content ? String(p.content).replace(/\s+/g, ' ').slice(0, 60) : '',
    cover: p.cover || '', tags: tagsOfIds(p.tagIds, all),
    hasScore: !!p.scoreFileId, viewCount: p.viewCount || 0, likeCount: p.likeCount || 0,
    commentCount: 0, author, createdAt: p.createdAt,
    /* ★ 2026-10-14：帖子状态 0 待审 / 1 正常 / 2 下架 / 3 草稿。
       卡片靠它给草稿打角标。注意列表里**只有自己的帖子**才会出现 0 和 3（后端 list 的口径）。 */
    status: p.status == null ? 1 : Number(p.status)
  }))
}

/* ---------------- 真实实现 ---------------- */
export const Real = {
  auth: {
    /* 后端暂无图形验证码：返回空 captchaId，前端逻辑会自动跳过校验 */
    captcha() { return Promise.resolve({ code: 0, message: 'ok', data: { captchaId: '', imageBase64: '' } }) },
    login(body) {
      return http('POST', '/api/auth/login', { username: body.username, password: body.password }).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            accessToken: d.token, refreshToken: d.token,
            user: { id: String(d.userId), username: d.username, nickname: d.nickname, avatar: d.avatar || '', role: d.role }
          }
        }
      })
    },
    register(body) {
      return http('POST', '/api/auth/register', { username: body.username, password: body.password, nickname: body.nickname }).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return { code: 0, message: 'ok', data: { userId: String(d.userId || ''), username: d.username || body.username } }
      })
    },
    logout() { return Promise.resolve({ code: 0, message: 'ok', data: null }) }
  },

  users: {
    profile(id) {
      return http('GET', '/api/users/' + id).then((r) => {
        if (r.code !== 0) return r
        const u = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            id: String(u.id), username: u.username, nickname: u.nickname, avatar: u.avatar || '',
            /* 这四项与三格统计 2026-10-02 起由后端真给（此前是写死的 ''/17/0/0/0）。
               仍保留兜底默认值，只为兼容尚未迁移的旧后端。 */
            intro: u.intro || '', fanType: u.fanType == null ? 17 : u.fanType,
            postCount: u.postCount || 0, followerCount: u.followerCount || 0,
            followingCount: u.followingCount || 0, isFollowing: !!u.isFollowing,
            createdAt: u.createdAt
          }
        }
      })
    },
    editMe(body) {
      /* intro / fanType 一起发；后端是部分更新，只发 nickname+avatar 也不受影响。 */
      return http('PUT', '/api/users/me', {
        nickname: body.nickname, avatar: body.avatar,
        intro: body.intro, fanType: body.fanType
      }).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            id: String(d.userId), username: d.username, nickname: d.nickname, avatar: d.avatar || '', role: d.role
          }
        }
      })
    },
    follow(id, on) {
      return http(on ? 'POST' : 'DELETE', '/api/users/' + id + '/follow').then(() => (
        { code: 0, message: 'ok', data: { followerCount: 0 } }
      ))
    }
  },

  posts: {
    list(params) {
      params = params || {}
      const q = new URLSearchParams()
      q.set('page', params.page || 1)
      q.set('size', params.size || 10)
      if (params.tagId) q.set('tagId', params.tagId)
      /* 多标签**并集**（逗号分隔）。作品广场要「曲谱分享/教程/翻弹/原创」四选一，
         单标签的 tagId 表达不了 —— 由服务端 find_in_set OR 出来，别在前端拉全量再 filter。 */
      if (params.tagIds) q.set('tagIds', params.tagIds)
      if (params.sort) q.set('sort', params.sort)
      if (params.keyword) q.set('keyword', params.keyword)
      /* userId 走**服务端**过滤。此前是「拉一页全站帖再前端 filter」——
         那样「我的谱帖」只能看到恰好落在首页 10 条里的自己的帖，且 total 是错的。 */
      if (params.userId) q.set('userId', params.userId)
      return http('GET', '/api/posts?' + q.toString()).then((r) => {
        if (r.code !== 0) return r
        return allTags().then((all) => {
          const d = r.data || {}
          const recs = d.records || []
          return Promise.all(recs.map((p) => toListItem(p, all))).then((list) => ({
            code: 0, message: 'ok',
            data: { list, total: d.total || list.length, page: d.page || 1, size: d.size || list.length }
          }))
        })
      })
    },
    detail(id) {
      return http('GET', '/api/posts/' + id).then((r) => {
        if (r.code !== 0) return r
        const p = r.data || {}
        return Promise.all([
          allTags(), userName(p.userId), http('GET', '/api/posts/' + id + '/interaction')
        ]).then((a) => {
          const iv = (a[2] && a[2].code === 0 && a[2].data) ? a[2].data : {}
          return {
            code: 0, message: 'ok', data: {
              id: String(p.id), title: p.title, content: p.content, tags: tagsOfIds(p.tagIds, a[0]),
              viewCount: p.viewCount || 0, likeCount: p.likeCount || 0, commentCount: 0,
              isLiked: !!iv.isLiked, isFavorited: !!iv.isFavorited,
              author: a[1], createdAt: p.createdAt,
              /* ★ 2026-10-14 补两个一直漏映射的字段：
                 · cover  —— 后端 post.cover 早就在存（列表卡也在用），但详情页从来没取过，
                             这正是「帖子顶部看不到封面图」的唯一原因；
                 · status —— 0 待审 / 1 正常 / 2 下架 / 3 草稿，详情页靠它给作者显示状态提示条。 */
              cover: p.cover || '',
              status: p.status == null ? 1 : Number(p.status),
              /* ★ 正文块（路线 B，2026-10-16）：JSON 字符串 → 数组，交给 BlockRenderer 渲染。 */
              blocks: parseBlocks(p.blocks),
              scoreFile: p.scoreFileId ? { fileId: String(p.scoreFileId) } : null
            }
          }
        })
      })
    },
    create(body) {
      return http('POST', '/api/posts', {
        /* ⚠️ 兼容两种字段名：页面传的是 coverUrl，后端 PostReq 叫 cover。
           2026-10-03 前这里只读 body.cover → **封面从未保存成功**（静默丢失）。 */
        title: body.title, content: body.content, cover: body.cover || body.coverUrl || null,
        tagIds: body.tagIds || [], scoreFileId: body.scoreFileId || null,
        /* ★ 2026-10-14：true = 存草稿（后端落 status=3）。
           严格判 `=== true`，别写 `!!body.draft` —— 页面一旦传字符串 'false' 会被判成草稿。 */
        draft: body.draft === true,
        /* ★ 2026-10-16 正文块（路线 B）。undefined 会被 JSON.stringify 丢掉 ⇒
           「不传」= 后端不改动，正是更新语义要的。 */
        blocks: body.blocks
      }).then((r) => {
        if (r.code !== 0) return r
        return { code: 0, message: 'ok', data: { postId: String(r.data && r.data.id) } }
      })
    },
    /* 编辑帖子（PUT /api/posts/{id}，仅作者/管理员） */
    update(id, body) {
      return http('PUT', '/api/posts/' + id, {
        title: body.title, content: body.content, cover: body.cover || body.coverUrl || null,
        tagIds: body.tagIds || [], scoreFileId: body.scoreFileId || null,
        /* blocks：**undefined = 本次不改动**（编辑老帖时不带这个字段），[] = 清空。 */
        blocks: body.blocks
      }).then((r) => {
        if (r.code !== 0) return r
        return { code: 0, message: 'ok', data: { postId: String((r.data && r.data.id) || id) } }
      })
    },
    /* 作者侧状态流转（PUT /api/posts/{id}/status，仅作者/管理员）。
       ⚠️ **只接受 1（发布）/ 3（转草稿）** —— 后端会拒绝 0 与 2（0 是管理端的审核队列、
          2 是下架）。也别和管理端的 api.admin.setPostStatus 混用，那个要求 admin 角色。 */
    setStatus(id, status) {
      return http('PUT', '/api/posts/' + id + '/status?status=' + status).then((r) => {
        if (r.code !== 0) return r
        return { code: 0, message: 'ok', data: { postId: String(id), status: Number(r.data && r.data.status != null ? r.data.status : status) } }
      })
    },
    /* 删除帖子（DELETE /api/posts/{id}，仅作者/管理员）。
       草稿走的就是这一条 —— 删帖不判状态（requireOwned 只看「是不是作者/管理员」），
       而草稿没有评论、也没进热榜，所以级联与清热榜这两步天然是空操作，无需分支。 */
    remove(id) {
      return http('DELETE', '/api/posts/' + id).then((r) => (r.code !== 0 ? r : { code: 0, message: 'ok', data: null }))
    },
    /* 删除评论（DELETE /api/posts/{postId}/comments/{id}，本人/管理员） */
    removeComment(postId, commentId) {
      return http('DELETE', '/api/posts/' + postId + '/comments/' + commentId)
        .then((r) => (r.code !== 0 ? r : { code: 0, message: 'ok', data: null }))
    },
    like(id, on) {
      /* ⚠️ 点赞是**复数** /likes，收藏是**单数** /favorite —— 后端就这么设计的，别写反。 */
      return http(on ? 'POST' : 'DELETE', '/api/posts/' + id + '/likes')
        .then(() => ({ code: 0, message: 'ok', data: null }))
    },
    favorite(id, on) {
      return http(on ? 'POST' : 'DELETE', '/api/posts/' + id + '/favorite')
        .then(() => ({ code: 0, message: 'ok', data: null }))
    },
    comments(id) {
      return http('GET', '/api/posts/' + id + '/comments?page=1&size=50').then((r) => {
        if (r.code !== 0) return r
        const recs = (r.data && r.data.records) || []
        const list = recs.map((c) => ({
          id: String(c.id), content: c.content,
          user: { id: String(c.userId), nickname: '用户' + c.userId, avatar: '' },
          likeCount: 0, isLiked: false, createdAt: c.createdAt, replies: []
        }))
        return { code: 0, message: 'ok', data: { list, total: list.length, page: 1, size: list.length } }
      })
    },
    addComment(id, body) {
      return http('POST', '/api/posts/' + id + '/comments', { content: body.content, parentId: body.parentId || null }).then((r) => {
        if (r.code !== 0) return r
        const c = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            id: String(c.id || ''), content: c.content,
            user: { id: String(c.userId || ''), nickname: '我', avatar: '' },
            likeCount: 0, isLiked: false, createdAt: c.createdAt || '', replies: []
          }
        }
      })
    }
  },

  tags: {
    list() {
      return allTags().then((all) => {
        const list = all.map((t) => ({ id: String(t.id), name: t.name, category: t.category, postCount: 0 }))
        return { code: 0, message: 'ok', data: { list, total: list.length, page: 1, size: list.length } }
      })
    }
  },

  hot: {
    /* ⚠️ 热榜路径是 GET /api/hot（**没有** /posts 后缀），写成 /api/hot/posts 会得 2001 */
    list(limit) {
      return http('GET', '/api/hot?limit=' + (limit || 10)).then((r) => {
        if (r.code !== 0) return r
        const arr = Array.isArray(r.data) ? r.data : []
        return allTags().then((all) => Promise.all(arr.map((p) => toListItem(p, all))).then((list) => ({
          code: 0, message: 'ok', data: {
            list: list.map((x) => ({
              postId: x.id, title: x.title, author: x.author,
              keys: (x.tags[0] && x.tags[0].name) || 17,
              level: (x.tags[1] && x.tags[1].name) || '入门', notes: x.summary
            }))
          }
        })))
      })
    }
  },

  notifications: {
    list() {
      return http('GET', '/api/notifications?page=1&size=50').then((r) => {
        if (r.code !== 0) return r
        const recs = (r.data && r.data.records) || []
        return Promise.all(recs.map((n) => {
          const base = {
            id: String(n.id), type: n.type,
            isRead: n.isRead === 1 || n.isRead === true,
            createdAt: n.createdAt, content: n.content || '',
            targetId: n.targetId != null ? String(n.targetId) : '',
            senderId: n.senderId != null ? String(n.senderId) : '',
            /* 服务端批量补齐的目标帖子标题（2026-10-11 起）。帖子已删时为 null —— 
               页面据此**不显示书名号**，别去拼「《null》」。 */
            postTitle: n.postTitle || ''
          }
          /* ⚠️ 后端是扁平实体（senderId/targetId），页面要的是嵌套 sender。
             system 类通知的 senderId 为 null（系统发出），昵称固定「系统」，不去查用户表。 */
          if (!base.senderId) return Object.assign(base, { sender: { id: '', nickname: '系统', avatar: '' } })
          return userName(base.senderId).then((u) => Object.assign(base, { sender: u }))
        })).then((list) => ({ code: 0, message: 'ok', data: { list, total: list.length, page: 1, size: list.length } }))
      })
    },
    unreadCount() {
      return http('GET', '/api/notifications/unread').then((r) => {
        if (r.code !== 0) return r
        const d = r.data
        const n = (typeof d === 'number') ? d : (d && d.count !== undefined ? d.count : 0)
        return { code: 0, message: 'ok', data: { count: n } }
      })
    },
    markRead() {
      return http('PUT', '/api/notifications/read-all').then(() => ({ code: 0, message: 'ok', data: null }))
    },
    readOne(id) {
      return http('PUT', '/api/notifications/' + id + '/read').then((r) => (r.code !== 0 ? r : { code: 0, message: 'ok', data: null }))
    }
  },

  /* 分类字典（GET /api/meta/categories）
     返回「帖子标签 + 曲谱四组结构化分类」两套并行体系。 */
  meta: {
    categories() {
      return http('GET', '/api/meta/categories').then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            postTags: d.postTags || [], tuningTypes: d.tuningTypes || [], keyNames: d.keyNames || [],
            difficulties: d.difficulties || [], musicGenres: d.musicGenres || []
          }
        }
      })
    }
  },

  /* 举报：POST /api/reports { targetType, targetId, reason } */
  reports: {
    submit(body) {
      return http('POST', '/api/reports', {
        targetType: body.targetType, targetId: String(body.targetId), reason: body.reason || ''
      })
    }
  },

  /* 综合搜索：GET /api/search?keyword=&type=all|post|user|tag&page=&size= */
  search: {
    query(params) {
      params = params || {}
      const kw = (params.keyword || '').trim()
      const type = params.type || 'all'
      const page = params.page || 1
      const size = params.size || 10
      const empty = {
        code: 0, message: 'ok', data: {
          keyword: kw, type,
          posts: { list: [], total: 0, page, size }, users: [], tags: []
        }
      }
      if (!kw) return Promise.resolve(empty)   /* 空关键词不发请求，也不命中全表 */
      const u = new URLSearchParams()
      u.set('keyword', kw); u.set('type', type); u.set('page', page); u.set('size', size)
      return http('GET', '/api/search?' + u.toString()).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        const pg = d.posts || {}
        return {
          code: 0, message: 'ok', data: {
            keyword: d.keyword || kw,
            type,
            posts: {
              list: (pg.records || []).map((p) => ({
                id: String(p.id), title: p.title, summary: p.summary || '', cover: p.cover || '',
                tags: (p.tags || []).map((t) => ({ id: String(t.id), name: t.name })),
                author: p.author
                  ? { id: String(p.author.id), nickname: p.author.nickname || p.author.username, avatar: p.author.avatar || '' }
                  : { id: '', nickname: '匿名', avatar: '' },
                likeCount: p.likeCount || 0, viewCount: p.viewCount || 0, commentCount: 0,
                hasScore: !!p.scoreFileId, matchedIn: p.matchedIn || [], createdAt: p.createdAt || ''
              })),
              total: pg.total || 0, page: pg.page || page, size: pg.size || size
            },
            users: (d.users || []).map((x) => ({
              id: String(x.id), nickname: x.nickname || x.username, username: x.username || '', avatar: x.avatar || ''
            })),
            tags: (d.tags || []).map((t) => ({ id: String(t.id), name: t.name, category: t.category || '' }))
          }
        }
      })
    },
    /* 热搜词：GET /api/search/hot?limit=&days= → [{keyword,count}] */
    hot(params) {
      params = params || {}
      const u = new URLSearchParams()
      u.set('limit', params.limit || 8)
      u.set('days', params.days || 7)
      return http('GET', '/api/search/hot?' + u.toString()).then((r) => {
        if (r.code !== 0) return r
        return { code: 0, message: 'ok', data: (r.data || []).map((x) => ({ keyword: x.keyword, count: x.count || 0 })) }
      })
    }
  },

  /* 管理端：全部走 /api/admin/**，后端拦截器已做 admin 角色校验 */
  admin: {
    stats() { return http('GET', '/api/admin/stats') },

    pendingPosts(page, size) {
      return http('GET', '/api/admin/posts/pending?page=' + (page || 1) + '&size=' + (size || 20)).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        const rows = d.records || []
        return Promise.all(rows.map((p) => userName(p.userId).then((a) => ({
          id: String(p.id), title: p.title,
          summary: p.content ? String(p.content).replace(/\s+/g, ' ').slice(0, 90) : '',
          userId: String(p.userId), author: a, status: p.status, createdAt: p.createdAt || ''
        })))).then((list) => ({
          code: 0, message: 'ok',
          data: { list, total: d.total || list.length, page: d.page || 1, size: d.size || 20 }
        }))
      })
    },

    /* 改帖子状态：1 通过/恢复，2 下架 */
    setPostStatus(id, status) { return http('PUT', '/api/admin/posts/' + id + '/status?status=' + status) },

    reports(page, size, status) {
      const u = new URLSearchParams()
      u.set('page', page || 1); u.set('size', size || 20)
      if (status !== undefined && status !== null && status !== '') u.set('status', status)
      return http('GET', '/api/admin/reports?' + u.toString()).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return Promise.all((d.records || []).map((x) => userName(x.reporterId).then((a) => ({
          id: String(x.id), reporterId: String(x.reporterId), reporter: a,
          targetType: x.targetType, targetId: String(x.targetId),
          reason: x.reason || '', status: x.status, createdAt: x.createdAt || ''
        })))).then((list) => ({
          code: 0, message: 'ok',
          data: { list, total: d.total || 0, page: d.page || 1, size: d.size || 20 }
        }))
      })
    },

    /* 处理举报：1 已处理，2 已驳回 */
    handleReport(id, status) { return http('PUT', '/api/admin/reports/' + id + '?status=' + status) },

    users(page, size, keyword) {
      const u = new URLSearchParams()
      u.set('page', page || 1); u.set('size', size || 20)
      if (keyword) u.set('keyword', keyword)
      return http('GET', '/api/admin/users?' + u.toString()).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            list: (d.records || []).map((x) => ({
              id: String(x.id), username: x.username, nickname: x.nickname,
              avatar: x.avatar || '', role: x.role, status: x.status, createdAt: x.createdAt || ''
            })),
            total: d.total || 0, page: d.page || 1, size: d.size || 20
          }
        }
      })
    },

    /* 用户封禁/解除：1 正常，0 封禁 */
    setUserStatus(id, status) { return http('PUT', '/api/admin/users/' + id + '/status?status=' + status) },

    logs(page, size, opt) {
      opt = opt || {}
      const u = new URLSearchParams()
      u.set('page', page || 1); u.set('size', size || 20)
      if (opt.action) u.set('action', opt.action)
      if (opt.keyword) u.set('keyword', opt.keyword)
      if (opt.success !== undefined && opt.success !== null && opt.success !== '') u.set('success', opt.success)
      return http('GET', '/api/admin/logs?' + u.toString()).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            list: (d.records || []).map((x) => ({
              id: String(x.id),
              userId: x.userId != null ? String(x.userId) : '',
              username: x.username || '', action: x.action || '',
              method: x.method || '', uri: x.uri || '',
              success: x.success, errorMsg: x.errorMsg || '',
              durationMs: (x.durationMs === null || x.durationMs === undefined) ? null : x.durationMs,
              createdAt: x.createdAt || ''
            })),
            total: d.total || 0, page: d.page || 1, size: d.size || 20
          }
        }
      })
    },

    /* 日志里出现过的操作类型（渲染筛选 chip）。从数据反查，前端不硬编码常量。 */
    logActions() {
      return http('GET', '/api/admin/logs/actions').then((r) => (
        r.code !== 0 ? r : { code: 0, message: 'ok', data: r.data || [] }
      ))
    },

    /* 评论列表（B8）。后端一次把**作者昵称**与**所属帖子标题**都补齐了 ——
       不再像待审帖子 / 举报那样让前端逐个 userName() 去拼（还省掉「帖标题」那一轮查询）。 */
    comments(page, size, opt) {
      opt = opt || {}
      const u = new URLSearchParams()
      u.set('page', page || 1); u.set('size', size || 20)
      if (opt.keyword) u.set('keyword', opt.keyword)
      if (opt.status !== undefined && opt.status !== null && opt.status !== '') u.set('status', opt.status)
      return http('GET', '/api/admin/comments?' + u.toString()).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            list: (d.records || []).map((x) => ({
              id: String(x.id), content: x.content || '',
              postId: x.postId != null ? String(x.postId) : '',
              postTitle: x.postTitle || '',
              userId: x.userId != null ? String(x.userId) : '',
              nickname: x.nickname || '',
              parentId: x.parentId != null ? String(x.parentId) : '',
              status: x.status, createdAt: x.createdAt || ''
            })),
            total: d.total || 0, page: d.page || 1, size: d.size || 20
          }
        }
      })
    },

    /* 评论下架(0) / 恢复(1)：走 B2 的软删接口，与「物理删除」是两条路径 */
    setCommentStatus(id, status) {
      return http('PUT', '/api/admin/comments/' + id + '/status?status=' + status)
    }
  },

  files: {
    /* 上传。bizType='score' 时可带 meta：
         · 曲谱分类 tuningType / keyName / difficulty / musicGenre
         · 下载分级 visibility（login / favorite / follower / author，缺省后端按 login）
       后端 /api/files/score 用**查询参数**接收并落到 score_file 上。 */
    upload(file, bizType, meta) {
      const fd = new FormData()
      fd.append('file', file)
      let path = (bizType === 'score') ? '/api/files/score' : '/api/files/image'
      if (bizType === 'score' && meta) {
        const q = new URLSearchParams()
        if (meta.tuningType) q.set('tuningType', meta.tuningType)
        if (meta.keyName) q.set('keyName', meta.keyName)
        if (meta.difficulty) q.set('difficulty', meta.difficulty)
        if (meta.musicGenre) q.set('musicGenre', meta.musicGenre)
        if (meta.visibility) q.set('visibility', meta.visibility)
        if (q.toString()) path += '?' + q.toString()
      }
      return http('POST', path, fd, true).then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            fileId: d.id != null ? String(d.id) : '',
            url: d.filePath || d.url || '',
            fileName: d.fileName || (file ? file.name : ''),
            size: d.size || 0,
            /* 回传分类与分级，供发布页回显（编辑态预填用） */
            visibility: d.visibility || '',
            tuningType: d.tuningType || '', keyName: d.keyName || '',
            difficulty: d.difficulty || '', musicGenre: d.musicGenre || ''
          }
        }
      })
    },

    /* 附件元信息 + **当前访问者**的可查看性 / 可下载性（GET /api/files/{id}/meta）。
       ⚠️ 这个接口**公开**（匿名可读）—— 帖子页要靠它决定「渲染谱面」还是「显示锁定卡片」。
       viewable / viewReason 是**查看**口径（login 档匿名也 true）；
       downloadable / reason 是**下载**口径（必须登录 + 四档），两者刻意分开。 */
    meta(id) {
      return http('GET', '/api/files/' + id + '/meta').then((r) => {
        if (r.code !== 0) return r
        const d = r.data || {}
        return {
          code: 0, message: 'ok', data: {
            fileId: String(d.id != null ? d.id : id),
            fileName: d.fileName || '', size: d.size || 0,
            visibility: d.visibility || 'login',
            visibilityLabel: d.visibilityLabel || '',
            viewable: !!d.viewable,
            viewReason: d.viewReason || '',
            downloadable: !!d.downloadable,
            reason: d.reason || '',
            needsFollow: !!d.needsFollow,
            needsFavorite: !!d.needsFavorite,
            ownerId: d.ownerId != null ? String(d.ownerId) : '',
            categories: d.categories || {}
          }
        }
      })
    },

    /* 改附件的下载分级（PUT /api/files/{id}/visibility，仅作者/管理员）。
       改权限与传文件是两件事 —— 不用重传。 */
    setVisibility(id, visibility) {
      return http('PUT', '/api/files/' + id + '/visibility?visibility=' + encodeURIComponent(visibility))
        .then((r) => (r.code !== 0 ? r : { code: 0, message: 'ok', data: { fileId: String(id), visibility } }))
    },

    /* 读取乐谱内容用于**内嵌预览 / 试听**（GET /api/files/{id}/content）—— 用 rawFetch。
       ★ 与 download()（真下载）分开：本接口**公开**，login 档匿名也能读，
         帖子页靠它渲染谱面（此前借用下载接口，导致匿名连谱都看不到）。
       ⚠️ 判定失败时后端返回的是 **HTTP 200 + R{code:2001/5003}**，
          它**也是合法 JSON** —— 不判一下就会被当「乐谱文件」解析，
          页面于是渲染出一个**空白谱面区**（不报错，最难查）。
          错误体特征：带 code 且没有 format；乐谱文件反之。 */
    view(id) {
      return rawFetch('/api/files/' + id + '/content').then((text) => {
        let raw
        try { raw = JSON.parse(text) } catch (e) { return { code: -1, message: '乐谱文件不是合法 JSON', data: null } }
        if (raw && raw.code !== undefined && raw.format === undefined) {
          return { code: raw.code, message: raw.message || '乐谱读取失败', data: null }
        }
        return { code: 0, message: 'ok', data: normalizeScore(raw) }
      }).catch((e) => ({ code: -1, message: '乐谱读取失败：' + e.message, data: null }))
    },

    /* 把附件存到本地（浏览器下载）。因为要带鉴权头，只能 fetch 成 Blob 再触发下载。 */
    save(id, fileName) {
      return rawBlob('/api/files/' + id).then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName || ('score-' + id + '.json')
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => { URL.revokeObjectURL(url) }, 3000)
        return { code: 0, message: 'ok', data: null }
      }).catch((e) => ({ code: -1, message: '下载失败：' + e.message, data: null }))
    }
  }
}

/* ---------------- 合并：真实实现覆盖 mock，但**逐方法**合并 ----------------
   V3 是整模块替换（`MockAPI[k] = Real[k]`），会顺带丢掉 mock 里 Real 没有的方法
   （最典型：`users.myFavorites`）。这里改成 Object.assign 逐方法合并，
   未实现的模块（works / offline）与未实现的方法继续走 mock，符合原注释声明的意图。 */
export const api = {}
Object.keys(MockAPI).forEach((k) => { if (!k.startsWith('_')) api[k] = MockAPI[k] })
Object.keys(Real).forEach((k) => { api[k] = Object.assign({}, MockAPI[k] || {}, Real[k]) })

export { token }
