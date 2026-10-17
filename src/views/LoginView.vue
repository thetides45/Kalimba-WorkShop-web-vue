<script setup>
/* 登录 / 注册 —— 对应 V3 `web/login.html`
   与 V3 一致的两个细节：
     · 登录侧的图形验证码**默认隐藏**，只有后端返回 10004（验证码错误）才出现；
       真实后端不校验验证码，所以正常登录流程里它不出现。
     · 注册侧**始终校验**验证码（后端 /api/auth/register 由前端把守这道关），
       演示码固定 7A3K —— 与 V3 行为完全一致。 */
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { handleRes } from '@/shared/res'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const CAPTCHA_TEXT = '7A3K'
const tab = ref('login')
const submitting = ref(false)

const lg = reactive({ user: '', pass: '', cap: '' })
const rg = reactive({ user: '', pass: '', nick: '', cap: '' })
const lgErr = reactive({ user: false, pass: false, cap: false })
const rgErr = reactive({ user: false, pass: false, cap: false })
const showCaptcha = ref(false)

const lgCapSvg = ref('')
const rgCapSvg = ref('')

/* 演示验证码：SVG 手绘扭曲字（对接后端换 GET /api/auth/captcha 的 imageBase64） */
function drawCaptcha() {
  const html = () => '<svg width="86" height="34" viewBox="0 0 86 34">'
    + '<rect width="86" height="34" rx="8" fill="#F7F2E8"/>'
    + CAPTCHA_TEXT.split('').map((ch, i) =>
      '<text x="' + (14 + i * 20) + '" y="' + (23 + (i % 2 ? -2 : 2)) + '"'
      + ' font-family="Noto Serif SC,serif" font-size="19" font-weight="600" fill="#5D4432"'
      + ' text-anchor="middle" transform="rotate(' + (i % 2 ? -8 : 8) + ' ' + (14 + i * 20) + ' 17)">'
      + ch + '</text>').join('')
    + '<path d="M6 26 Q 43 ' + (10 + Math.round(Math.random() * 10)) + ' 80 12"'
    + ' stroke="#C05A3E" stroke-width="1.4" fill="none" opacity=".45"/></svg>'
  lgCapSvg.value = html()
  rgCapSvg.value = html()
}

/** 兼容 V3 传过来的 next（可能形如 /post.html?id=5）：去掉 .html 后缀，补前导斜杠 */
function normalizeNext(n) {
  if (!n) return '/'
  let s = String(n)
  if (!s.startsWith('/')) s = '/' + s
  s = s.replace(/\/index\.html(?=($|[?#]))/, '/')
  s = s.replace(/\.html(?=($|[?#]))/, '')
  return s
}

const nextUrl = () => normalizeNext(route.query.next)

onMounted(() => {
  /* 已登录则直接进广场（与 V3 的 location.replace("index.html") 等价） */
  if (auth.isLogin) { router.replace('/'); return }
  drawCaptcha()
})

async function doLogin() {
  const needCaptcha = showCaptcha.value
  lgErr.user = !lg.user.trim()
  lgErr.pass = lg.pass.length < 6
  lgErr.cap = needCaptcha && lg.cap.trim().toUpperCase() !== CAPTCHA_TEXT
  if (lgErr.user || lgErr.pass || lgErr.cap) return

  submitting.value = true
  const res = await api.auth.login({
    username: lg.user.trim(),
    password: lg.pass,
    captchaId: needCaptcha ? 'c-mock' : '',
    captchaCode: needCaptcha ? lg.cap.trim() : ''
  })
  submitting.value = false

  if (res.code === 10004) {
    /* 验证码错误后前端展示验证码（文档 §1.4） */
    showCaptcha.value = true
    lgErr.cap = true
    drawCaptcha()
    return
  }
  if (!handleRes(res, '登录失败')) { drawCaptcha(); return }

  auth.set(res.data)
  ui.toast('欢迎回来，' + res.data.user.nickname)
  const target = nextUrl()
  setTimeout(() => router.push(target), 500)
}

async function doRegister() {
  const u = rg.user.trim()
  rgErr.user = !/^[A-Za-z][A-Za-z0-9_]{3,19}$/.test(u)
  rgErr.pass = rg.pass.length < 6 || rg.pass.length > 32
  rgErr.cap = rg.cap.trim().toUpperCase() !== CAPTCHA_TEXT
  if (rgErr.user || rgErr.pass || rgErr.cap) return

  submitting.value = true
  const res = await api.auth.register({
    username: u,
    password: rg.pass,
    nickname: rg.nick.trim() || u,
    captchaId: 'c-mock',
    captchaCode: rg.cap.trim()
  })
  submitting.value = false

  if (!handleRes(res, '注册失败')) { drawCaptcha(); return }
  ui.toast('注册成功，请登录')
  tab.value = 'login'
  lg.user = u
}
</script>

<template>
  <main class="auth-body">
    <section class="auth-card">
      <div class="auth-brand">
        <span class="brandmark">谷</span>
        <div class="t">欢迎来到拇指琴谷</div>
        <div class="d">找谱 · 制谱 · 分享与陪伴</div>
      </div>

      <div class="seg auth-tabs">
        <button id="tab-login" :class="{ on: tab === 'login' }" type="button" @click="tab = 'login'">登录</button>
        <button id="tab-reg" :class="{ on: tab === 'register' }" type="button" @click="tab = 'register'">注册</button>
      </div>

      <!-- 登录（POST /api/auth/login） -->
      <form id="form-login" v-show="tab === 'login'" novalidate @submit.prevent="doLogin">
        <div class="field" :class="{ invalid: lgErr.user }">
          <label>用户名</label>
          <input id="lg-user" v-model="lg.user" autocomplete="username" placeholder="你的用户名">
          <div class="err">请输入用户名</div>
        </div>
        <div class="field" :class="{ invalid: lgErr.pass }">
          <label>密码</label>
          <input id="lg-pass" v-model="lg.pass" type="password" autocomplete="current-password" placeholder="至少 6 位">
          <div class="err">密码至少 6 位</div>
        </div>
        <div v-show="showCaptcha" class="captcha-row">
          <div class="field" :class="{ invalid: lgErr.cap }">
            <label>验证码</label>
            <input id="lg-cap" v-model="lg.cap" maxlength="4" placeholder="输入右侧字符">
            <div class="err">验证码不正确</div>
          </div>
          <div class="captcha-img" title="点击刷新" @click="drawCaptcha">
            <span v-html="lgCapSvg"></span>
          </div>
        </div>
        <button class="btn primary" id="lg-btn" type="submit" style="width:100%" :disabled="submitting">
          {{ submitting ? '登录中…' : '登 录' }}
        </button>
        <div class="auth-foot">演示模式：任意用户名 + 6 位以上密码即可登录<br>需要验证码时输入 <b>7A3K</b></div>
      </form>

      <!-- 注册（POST /api/auth/register） -->
      <form id="form-reg" v-show="tab === 'register'" novalidate @submit.prevent="doRegister">
        <div class="field" :class="{ invalid: rgErr.user }">
          <label>用户名</label>
          <input id="rg-user" v-model="rg.user" autocomplete="username" placeholder="4~20 位，字母开头">
          <div class="err">用户名需 4~20 位，字母开头</div>
        </div>
        <div class="field" :class="{ invalid: rgErr.pass }">
          <label>密码</label>
          <input id="rg-pass" v-model="rg.pass" type="password" autocomplete="new-password" placeholder="6~32 位">
          <div class="err">密码需 6~32 位</div>
        </div>
        <div class="field">
          <label>昵称（选填）</label>
          <input id="rg-nick" v-model="rg.nick" placeholder="社区里展示的名字">
        </div>
        <div class="captcha-row">
          <div class="field" :class="{ invalid: rgErr.cap }">
            <label>验证码</label>
            <input id="rg-cap" v-model="rg.cap" maxlength="4" placeholder="输入右侧字符">
            <div class="err">验证码不正确</div>
          </div>
          <div class="captcha-img" title="点击刷新" @click="drawCaptcha">
            <span v-html="rgCapSvg"></span>
          </div>
        </div>
        <button class="btn primary" id="rg-btn" type="submit" style="width:100%" :disabled="submitting">
          {{ submitting ? '注册中…' : '注 册' }}
        </button>
        <div class="auth-foot">注册即代表同意社区公约 · 验证码 <b>7A3K</b></div>
      </form>
    </section>
  </main>
</template>
