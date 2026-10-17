/* ============================================================
   拇指琴谷 · 演示数据与 MockAPI（Vue 版）
   ------------------------------------------------------------
   与 V3 `web/assets/app.js` 的数据层完全对应，作用有二：
     ① **未接后端的模块继续走 mock**：`users.myFavorites` / `works` / `offline`
        （后端的收藏列表、作品广场、离线包下载三个端点在 V1 接口文档里就没定义）
     ② **页面兜底演示数据**：帖子详情的谱面预览、作者简介等在没有真实数据时回退到 DB
        （V3 的 post.html / index.html / works.html 都直接用全局 `DB`，这里改为显式 import）
   ------------------------------------------------------------
   ⚠️ 与 V3 的一处**有意差异**：V3 的 `api.js` 用
      `Object.keys(Real).forEach(k => MockAPI[k] = Real[k])` **整模块替换**，
      于是 `Real.users` 覆盖掉 mock 的 `users` 后，`users.myFavorites` 被一并丢掉 ——
      个人主页「我的收藏」tab 在真实接口下会直接 TypeError。
      本版按该文件注释声明的**设计意图**改为**逐方法合并**（见 api/index.js），
      让 myFavorites 继续走 mock。
   ============================================================ */

export const DEMO_USER = {
  id: '1024', username: 'kalimba_fan', nickname: '琴友小卡',
  avatar: '', role: 'user', fanType: 17, intro: '17 键入门第 100 天'
}

export const DB = {
  /* GET /api/auth/me · POST /api/auth/login 出参 user 对象 */
  users: {
    '1024': { id: '1024', nickname: '琴友小卡', avatar: '', intro: '17 键入门第 100 天', fanType: 17, postCount: 12, followerCount: 34, followingCount: 21, isFollowing: false },
    '2048': { id: '2048', nickname: '另一琴友', avatar: '', intro: '21 键 / 流行编配爱好者', fanType: 21, postCount: 8, followerCount: 56, followingCount: 12, isFollowing: false },
    '3001': { id: '3001', nickname: '木质琴坊', avatar: '', intro: '分享曲谱与调音心得', fanType: 17, postCount: 20, followerCount: 128, followingCount: 5, isFollowing: true }
  },
  /* GET /api/tags 出参 data.list 项 */
  tags: [
    { id: '1', name: '入门', category: '难度', postCount: 56 },
    { id: '2', name: '进阶', category: '难度', postCount: 23 },
    { id: '3', name: '儿歌', category: '曲风', postCount: 31 },
    { id: '4', name: '流行', category: '曲风', postCount: 44 },
    { id: '5', name: '跟我弹', category: '活动', postCount: 18 }
  ],
  /* GET /api/posts 出参 list 项（含 detail 内部扩展 score：乐谱 JSON，详见 §8） */
  posts: [
    {
      id: '9001', title: '《小星星》17键卡林巴谱',
      summary: '小白也能弹的入门第一首，全程只用 1-5 五个音，附慢速示范。',
      cover: '', tags: [{ id: '1', name: '入门' }, { id: '3', name: '儿歌' }, { id: '5', name: '跟我弹' }],
      hasScore: true, viewCount: 321, likeCount: 45, commentCount: 8,
      author: { id: '1024', nickname: '琴友小卡', avatar: '' },
      createdAt: '2026-09-20 14:30:00',
      content: '<p>这是每个人的第一首曲子。左手拇指负责低音，右手负责旋律，注意「5 -」的二拍要把时值弹满。</p><p>先跟原曲听一遍节奏，再开慢速试听跟着弹，一周之内一定能顺下来。</p>',
      scoreFile: {
        fileId: '7001', fileName: '小星星.kalimba.json', size: 18432, version: '1.0', previewUrl: '',
        meta: { songTitle: '小星星', key: 'C', bpm: 90, kalimbaType: 17 }
      },
      score: {
        /* ★ 乐谱 JSON 以内核导出（kalimba-tab v1）为**唯一真源**：
             · 曲名在顶层 title、调号在 key.name、速度在 tempo、琴型在 tuning.key；
             · source 是**内核简谱原文**（字符串）—— 帖子页的内嵌预览把它灌回内核
               「重新生成琴谱」，这也是内核唯一认可的「再打开一份谱」的入口；
             · meta 是页面层的摘要（真实环境里由 api 层 normalizeScore 从上面这些
               内核字段产出，这里直接给出，供列表页/详情页读取）。
           原来的 `kalimba-score` / `source.jianpuText` 那套已随 Vue SPA 归档，
           不再作为解析依据。 */
        format: 'kalimba-tab', version: 1,
        title: '小星星', key: { name: 'C', pc: 0 }, meter: [4, 4], tempo: 90,
        tuning: { key: 'k17', len: 17 }, mode: 'movable', direction: 'up', transpose: 0,
        nMeasures: 8, totalBeats: 32,
        meta: { songTitle: '小星星', key: 'C', bpm: 90, kalimbaType: 17 },
        /* 示例谱只用中音区：八度记号（低音点前置 / 高音撇后置）容易在这里写错，
           真要放带八度的谱，直接从内核「导出 json」里取原文最稳。 */
        source: [
          'title: 小星星',
          'key: 1=C',
          'meter: 4/4',
          'tempo: 90',
          'tuning: 17',
          'mode: movable',
          'direction: up',
          '',
          'M: 1 1 5 5 | 6 6 5- | 4 4 3 3 | 2 2 1- | 5 5 4 4 | 3 3 2- | 5 5 4 4 | 3 3 2- |'
        ].join('\n')
      }
    },
    {
      id: '9002', title: '《虫儿飞》完整简谱 + 手位提示',
      summary: '副歌有一处高低音切换，我把手位图画出来了，跟着练两遍就能衔接上。',
      cover: '', tags: [{ id: '1', name: '入门' }, { id: '3', name: '儿歌' }],
      hasScore: true, viewCount: 264, likeCount: 38, commentCount: 5,
      author: { id: '2048', nickname: '另一琴友', avatar: '' },
      createdAt: '2026-09-22 19:05:00',
      content: '<p>主歌和副歌手位不变，只有「1l」这个低音需要左手跨过去。谱面里所有低音点都标了小圆点。</p>',
      scoreFile: {
        fileId: '7002', fileName: '虫儿飞.kalimba.json', size: 16001, version: '1.0', previewUrl: '',
        meta: { songTitle: '虫儿飞', key: 'C', bpm: 72, kalimbaType: 17 }
      },
      score: {
        /* 内核导出格式（kalimba-tab v1），字段含义见 9001 处的说明 */
        format: 'kalimba-tab', version: 1,
        title: '虫儿飞', key: { name: 'C', pc: 0 }, meter: [4, 4], tempo: 72,
        tuning: { key: 'k17', len: 17 }, mode: 'movable', direction: 'up', transpose: 0,
        nMeasures: 8, totalBeats: 32,
        meta: { songTitle: '虫儿飞', key: 'C', bpm: 72, kalimbaType: 17 },
        source: [
          'title: 虫儿飞',
          'key: 1=C',
          'meter: 4/4',
          'tempo: 72',
          'tuning: 17',
          'mode: movable',
          'direction: up',
          '',
          'M: 1 3 5 5 | 3 2 1- | 6 1 3 3 | 1 2-- | 1 3 5 5 | 3 2 1- | 2 3 2 1 | 6-- |'
        ].join('\n')
      }
    },
    {
      id: '9003', title: '21 键《晴天》前奏，进阶编配',
      summary: '把原曲前奏压缩到一个八度内，加了装饰音，弹起来有那味儿了。',
      cover: '', tags: [{ id: '2', name: '进阶' }, { id: '4', name: '流行' }],
      hasScore: true, viewCount: 512, likeCount: 76, commentCount: 12,
      author: { id: '3001', nickname: '木质琴坊', avatar: '' },
      createdAt: '2026-09-24 11:20:00',
      content: '<p>21 键琴的音域优势在这里体现得很明显，低音伴奏和主旋律可以同时进行。</p>',
      scoreFile: {
        fileId: '7003', fileName: '晴天前奏.kalimba.json', size: 22013, version: '1.0', previewUrl: '',
        meta: { songTitle: '晴天前奏', key: 'C', bpm: 80, kalimbaType: 21 }
      },
      score: {
        /* 内核导出格式（kalimba-tab v1）—— 21 键：tuning.key = 'k21' */
        format: 'kalimba-tab', version: 1,
        title: '晴天前奏', key: { name: 'C', pc: 0 }, meter: [4, 4], tempo: 80,
        tuning: { key: 'k21', len: 21 }, mode: 'movable', direction: 'up', transpose: 0,
        nMeasures: 5, totalBeats: 20,
        meta: { songTitle: '晴天前奏', key: 'C', bpm: 80, kalimbaType: 21 },
        source: [
          'title: 晴天前奏',
          'key: 1=C',
          'meter: 4/4',
          'tempo: 80',
          'tuning: 21',
          'mode: movable',
          'direction: up',
          '',
          'M: 3 5 6 5 | 3 2 1 2 | 3 5 3 2 | 1 6 5 6 | 1 2 0 0 |'
        ].join('\n')
      }
    },
    {
      id: '9004', title: '新人报到！谈谈我第一周学琴踩的坑',
      summary: '调音器怎么夹、指甲留多长、每天练多久……把我踩过的坑都列出来了。',
      cover: '', tags: [{ id: '1', name: '入门' }, { id: '5', name: '跟我弹' }],
      hasScore: false, viewCount: 189, likeCount: 27, commentCount: 9,
      author: { id: '2048', nickname: '另一琴友', avatar: '' },
      createdAt: '2026-09-26 08:45:00',
      content: '<p>最大的坑是调音：一定要用专用的 Korg 夹式调音器，手机 App 延迟会误判。</p>',
      scoreFile: null, score: null
    },
    {
      id: '9005', title: '《欢乐颂》双琴合奏版谱',
      summary: '一人主旋律一人低音伴奏，练熟了可以和朋友一起弹。',
      cover: '', tags: [{ id: '5', name: '跟我弹' }],
      hasScore: true, viewCount: 143, likeCount: 19, commentCount: 3,
      author: { id: '1024', nickname: '琴友小卡', avatar: '' },
      createdAt: '2026-09-27 21:10:00',
      content: '<p>合奏的关键是节奏对齐，两个人都开节拍器，慢速合三次再提速。</p>',
      scoreFile: {
        fileId: '7005', fileName: '欢乐颂合奏.kalimba.json', size: 19876, version: '1.0', previewUrl: '',
        meta: { songTitle: '欢乐颂', key: 'C', bpm: 100, kalimbaType: 17 }
      },
      score: {
        /* 内核导出格式（kalimba-tab v1）。合奏版这里只留主旋律一条声部 —— 一个块里的
           多条谱行是**多声部**（同时发声），不是接着往下排。 */
        format: 'kalimba-tab', version: 1,
        title: '欢乐颂', key: { name: 'C', pc: 0 }, meter: [4, 4], tempo: 100,
        tuning: { key: 'k17', len: 17 }, mode: 'movable', direction: 'up', transpose: 0,
        nMeasures: 8, totalBeats: 32,
        meta: { songTitle: '欢乐颂', key: 'C', bpm: 100, kalimbaType: 17 },
        source: [
          'title: 欢乐颂',
          'key: 1=C',
          'meter: 4/4',
          'tempo: 100',
          'tuning: 17',
          'mode: movable',
          'direction: up',
          '',
          'M: 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 2 2- | 3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 2 1 1- |'
        ].join('\n')
      }
    },
    {
      id: '9006', title: '一次就调准音的小技巧',
      summary: '先整体降半音再逐键微调，比直接对标准音快得多。',
      cover: '', tags: [{ id: '1', name: '入门' }],
      hasScore: false, viewCount: 98, likeCount: 11, commentCount: 2,
      author: { id: '3001', nickname: '木质琴坊', avatar: '' },
      createdAt: '2026-09-28 16:40:00',
      content: '<p>新琴到手音都会偏低，先统一降下去再逐键上提，敲击力度保持一致。</p>',
      scoreFile: null, score: null
    }
  ],
  /* GET /api/posts/{id}/comments 出参 list 项（两级结构，文档 §4.7） */
  comments: {
    '9001': [
      {
        id: '5001', content: '感谢分享！孩子四岁，跟着弹了两遍就会了。',
        user: { id: '2048', nickname: '另一琴友', avatar: '' },
        likeCount: 2, isLiked: false, createdAt: '2026-09-21 09:00:00',
        replies: [
          { id: '5002', content: '不客气~ 有低音部分不清楚的随时问。', user: { id: '1024', nickname: '琴友小卡', avatar: '' }, replyToUser: { id: '2048', nickname: '另一琴友' }, createdAt: '2026-09-21 09:12:00' }
        ]
      },
      {
        id: '5003', content: '请问「5 -」的二拍要怎么数？总感觉抢拍了。',
        user: { id: '3001', nickname: '木质琴坊', avatar: '' },
        likeCount: 0, isLiked: false, createdAt: '2026-09-21 20:30:00',
        replies: []
      },
      {
        id: '5004', content: '心里默数「1 2」就行，或者开 90 的节拍器。',
        user: { id: '2048', nickname: '另一琴友', avatar: '' },
        likeCount: 1, isLiked: false, createdAt: '2026-09-22 10:05:00',
        replies: []
      }
    ],
    '9002': [], '9003': [], '9004': [], '9005': [], '9006': []
  },
  /* GET /api/hot 出参 data.list 项（文档 §4.10） */
  hot: [
    { postId: '9003', title: '21 键《晴天》前奏，进阶编配', cover: '', author: { id: '3001', nickname: '木质琴坊', avatar: '' }, heat: 986 },
    { postId: '9001', title: '《小星星》17键卡林巴谱', cover: '', author: { id: '1024', nickname: '琴友小卡', avatar: '' }, heat: 742 },
    { postId: '9002', title: '《虫儿飞》完整简谱 + 手位提示', cover: '', author: { id: '2048', nickname: '另一琴友', avatar: '' }, heat: 655 },
    { postId: '9004', title: '新人报到！谈我第一周学琴踩的坑', cover: '', author: { id: '2048', nickname: '另一琴友', avatar: '' }, heat: 431 },
    { postId: '9005', title: '《欢乐颂》双琴合奏版谱', cover: '', author: { id: '1024', nickname: '琴友小卡', avatar: '' }, heat: 318 }
  ],
  /* 作品广场数据占位 —— 接口文档 V1.0 未定义独立作品端点，
     正式版建议新增 GET /api/works（预留）；work.postId 关联上述谱帖，
     试听为前端程序合成音（V3 原型约定）。 */
  works: [
    { id: '6001', title: '《小星星》黄昏慢速版', player: '琴友小卡', postId: '9001', kind: '新手弹唱', tempo: 660 },
    { id: '6002', title: '《晴天》前奏 0.75x 跟练', player: '木质琴坊', postId: '9003', kind: '改编', tempo: 760 },
    { id: '6003', title: '《欢乐颂》清晨双琴版', player: '另一琴友', postId: '9005', kind: '合奏', tempo: 600 }
  ],
  /* GET /api/notifications 出参 data.list 项（文档 §6.1） */
  notifications: null,
  /* GET /api/offline/latest 出参 data（文档 §5.3） */
  offline: {
    version: '1.0.3', size: 1945600, changelog: '新增音位轴图例…', downloadUrl: '#',
    releasedAt: '2026-09-25 20:00:00'
  }
}

/* 内存态：登录用户互动状态（对接后端后由服务端持久化） */
export const State = { liked: {}, favorited: {}, follows: {}, lastCommentId: 6000 }

/* ---------------- MockAPI（仅未接后端的模块会被真正调用） ---------------- */
export const MockAPI = {
  _ok(data) { return Promise.resolve({ code: 0, message: 'ok', data }) },

  auth: {
    captcha() { return MockAPI._ok({ captchaId: 'c-mock-' + Date.now() % 10000, imageBase64: '' }) },
    login(body) {
      if (!body.username || !body.password) return Promise.resolve({ code: 400, message: '用户名与密码不能为空', data: null })
      return MockAPI._ok({
        accessToken: 'mock-at-' + Date.now(), refreshToken: 'mock-rt-' + Date.now(),
        user: Object.assign({}, DEMO_USER, { username: body.username })
      })
    },
    register(body) {
      return MockAPI._ok({ userId: '9024', username: body.username })
    },
    logout() { return MockAPI._ok(null) }
  },

  users: {
    profile(id) {
      const u = DB.users[id]
      if (!u) return Promise.resolve({ code: 40400, message: '用户不存在', data: null })
      return MockAPI._ok(Object.assign({}, u))
    },
    editMe(body) {
      const me = DB.users[DEMO_USER.id]
      ;['nickname', 'intro', 'fanType'].forEach((k) => { if (body[k] !== undefined) me[k] = body[k] })
      return MockAPI._ok(Object.assign({}, DEMO_USER, me))
    },
    follow(id, on) {
      const u = DB.users[id]
      if (u) u.isFollowing = on
      State.follows[id] = on
      return MockAPI._ok({ followerCount: (u ? u.followerCount : 0) + (on ? 1 : 0) })
    },
    /* ★ 这个端点后端**没有**（V1 文档未定义 GET /api/users/me/favorites），继续走 mock */
    myFavorites() {
      const ids = Object.keys(State.favorited).filter((k) => State.favorited[k])
      const list = (ids.length ? ids : ['9003', '9001'])
        .map((pid) => DB.posts.find((p) => p.id === pid))
        .filter(Boolean)
        .map((p) => ({
          id: p.id, title: p.title, summary: p.summary, cover: p.cover, tags: p.tags,
          hasScore: p.hasScore, viewCount: p.viewCount, likeCount: p.likeCount,
          commentCount: p.commentCount, author: p.author, createdAt: p.createdAt
        }))
      return MockAPI._ok({ list, total: list.length, page: 1, size: 10 })
    }
  },

  posts: {
    list(params) {
      params = params || {}
      let list = DB.posts.map((p) => MockAPI._listItem(p))
      if (params.userId) list = list.filter((p) => p.author.id === params.userId)
      if (params.tagId) list = list.filter((p) => p.tags.some((t) => t.id === params.tagId))
      if (params.keyword) list = list.filter((p) => (p.title + p.summary).includes(params.keyword))
      if (params.sort === 'hot') list = list.slice().sort((a, b) => (b.viewCount + b.likeCount * 4) - (a.viewCount + a.likeCount * 4))
      if (params.sort === 'mostLiked') list = list.slice().sort((a, b) => b.likeCount - a.likeCount)
      return MockAPI._ok({ list, total: list.length, page: params.page || 1, size: params.size || list.length })
    },
    detail(id) {
      const p = DB.posts.find((x) => x.id === id)
      if (!p) return Promise.resolve({ code: 40400, message: '帖子不存在或已下架', data: null })
      return MockAPI._ok({
        id: p.id, title: p.title, content: p.content, tags: p.tags,
        viewCount: p.viewCount + 1, likeCount: p.likeCount, commentCount: p.commentCount,
        isLiked: !!State.liked[p.id], isFavorited: !!State.favorited[p.id],
        author: p.author, createdAt: p.createdAt, scoreFile: p.scoreFile
      })
    },
    create(body) {
      if (!body.title || !body.title.trim()) return Promise.resolve({ code: 400, message: '标题不能为空', data: null })
      if (!body.content || !body.content.trim()) return Promise.resolve({ code: 400, message: '正文不能为空', data: null })
      return MockAPI._ok({ postId: String(9000 + DB.posts.length + 1) })
    },
    like(id, on) {
      const p = DB.posts.find((x) => x.id === id)
      State.liked[id] = on
      if (p) p.likeCount += on ? 1 : -1
      return MockAPI._ok({ likeCount: p ? p.likeCount : 0, isLiked: on })
    },
    favorite(id, on) {
      State.favorited[id] = on
      return MockAPI._ok({ favoriteCount: 12, isFavorited: on })
    },
    comments(id) {
      const list = DB.comments[id] || []
      return MockAPI._ok({ list, total: list.length, page: 1, size: 10 })
    },
    addComment(id, body) {
      const item = {
        id: String(++State.lastCommentId), content: body.content,
        user: { id: DEMO_USER.id, nickname: DEMO_USER.nickname, avatar: '' },
        likeCount: 0, isLiked: false, createdAt: '2026-09-29 16:00:00', replies: []
      }
      ;(DB.comments[id] = DB.comments[id] || []).unshift(item)
      return MockAPI._ok(item)
    }
  },

  tags: { list() { return MockAPI._ok({ list: DB.tags, total: DB.tags.length, page: 1, size: 50 }) } },
  hot: { list(limit) { return MockAPI._ok({ list: DB.hot.slice(0, limit || 10) }) } },

  /* ★ 作品广场：接口文档 V1.0 无该端点，预留 GET /api/works，继续走 mock */
  works: { list() { return MockAPI._ok({ list: DB.works, total: DB.works.length }) } },

  notifications: {
    list(params) { return MockAPI._ok({ list: [], total: 0, page: 1, size: 50 }) },
    unreadCount() { return MockAPI._ok({ count: 0 }) },
    markRead() { return MockAPI._ok(null) },
    readOne() { return MockAPI._ok(null) }
  },

  files: {
    upload(file, bizType) {
      return MockAPI._ok({
        fileId: 'f' + Date.now(), url: 'mock://' + bizType + '/' + (file ? file.name : 'draft'),
        fileName: file ? file.name : (bizType === 'score' ? '未命名.kalimba.json' : '图片'),
        size: file ? file.size : 1024
      })
    }
  },

  /* ★ 离线包：后端无该端点，继续走 mock */
  offline: { latest() { return MockAPI._ok(DB.offline) } },

  _listItem(p) {
    return {
      id: p.id, title: p.title, summary: p.summary, cover: p.cover, tags: p.tags,
      hasScore: p.hasScore, viewCount: p.viewCount, likeCount: p.likeCount, commentCount: p.commentCount,
      author: p.author, createdAt: p.createdAt
    }
  }
}
