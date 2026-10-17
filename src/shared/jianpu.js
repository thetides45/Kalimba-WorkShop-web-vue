/* ============================================================
   简谱解析 + 试听内核（WebAudio，纯前端本地）
   ------------------------------------------------------------
   与 V3 `web/assets/app.js` 的 SCALE / parseJianpu / scoreDuration /
   Player / scoreRows 完全对应，行为不变：
     · 记号约定：`1`~`7` 数字音，`-` 延长上一音一拍，`0` 休止，
       `h` 高八度、`l` 低八度（如 `5h`、`6l`）
     · 试听时长（秒）= Σb × tempo(ms/拍) / 1000，真实计算（设计规范附注）
   ============================================================ */

export const SCALE = { 1: 261.63, 2: 293.66, 3: 329.63, 4: 349.23, 5: 392.0, 6: 440.0, 7: 493.88 }

/** 简谱文本 → 音符序列 [{d: 数字, oct: 'h'|'l'|'', f: 频率|null, b: 拍数}] */
export function parseJianpu(text) {
  const notes = []
  ;(text || '').trim().split(/\s+/).forEach((tok) => {
    if (tok === '-') { if (notes.length) notes[notes.length - 1].b++; return }
    if (tok === '0') { notes.push({ d: '0', oct: '', f: null, b: 1 }); return }
    const m = tok.match(/^([1-7])(h|l)?$/)
    if (!m) return
    const f = SCALE[+m[1]] * (m[2] === 'h' ? 2 : m[2] === 'l' ? 0.5 : 1)
    notes.push({ d: m[1], oct: m[2] || '', f, b: 1 })
  })
  return notes
}

/** 试听时长（秒）= Σb × tempo(ms/拍) / 1000 */
export function scoreDuration(notes, tempo) {
  return notes.reduce((s, n) => s + n.b, 0) * (tempo || 600) / 1000
}

/** 乐谱 JSON → 谱面行（每行 8 个音位，契约见接口文档 §8） */
export function scoreRows(score) {
  if (!score || !score.source || !score.source.jianpuText) return { rows: [], notes: [], tempo: 600 }
  const notes = parseJianpu(score.source.jianpuText)
  const tempo = 60000 / (score.meta.bpm || 100)
  const rows = []
  for (let i = 0; i < notes.length; i += 8) rows.push(notes.slice(i, i + 8))
  return { rows, notes, tempo }
}

/* ---------------- 试听器（WebAudio，模块级单例） ----------------
   注意 Player 是**全局唯一**的：详情页与作品广场共用它，
   所以「播放新的」之前必须 stop()，否则两段音会叠在一起。 */
export const Player = {
  ctx: null,
  playing: false,
  stopFns: [],

  beep(f, dur, t0) {
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (!f) return
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'sine'
    o.frequency.value = f
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.22, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur * 0.95)
    o.connect(g)
    g.connect(this.ctx.destination)
    o.start(t0)
    o.stop(t0 + dur)
  },

  /** 按拍播放 note 序列；onIdx(i) 回调高亮，onEnd 结束回调。返回总时长(ms)。 */
  play(notes, tempo, onIdx, onEnd) {
    if (this.playing) this.stop()
    this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)()
    const ctx = this.ctx
    const unit = (tempo || 600) / 1000
    this.playing = true
    let t = ctx.currentTime + 0.06
    notes.forEach((n, i) => {
      if (n.f) this.beep(n.f, n.b * unit * 0.92, t)
      if (n.f || i === 0) {
        const i0 = i
        this.stopFns.push(setTimeout(() => onIdx && onIdx(i0), (t - ctx.currentTime) * 1000))
      }
      t += n.b * unit
    })
    const total = (t - ctx.currentTime) * 1000
    this.stopFns.push(setTimeout(() => {
      this.playing = false
      onEnd && onEnd()
    }, total))
    return total
  },

  stop() {
    this.stopFns.forEach((fn) => clearTimeout(fn))
    this.stopFns = []
    this.playing = false
  }
}
