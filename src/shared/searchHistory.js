/* ---------------- 搜索历史（纯本地，不上服务器） ----------------
   只存关键词字符串，最多 MAX 条、新的在前、重复的提到最前。
   与 V3 `web/assets/app.js` 的 SearchHistory 同源，含**代际计数**处理竞态：
   搜索是**异步**的 ——「点热词发起搜索 → 立刻点清空」时，那次搜索的 .then
   会在清空之后才落地，把刚清掉的词又写回来（2026-10-03 实测复现）。
   调用方在**发请求前**记下 generation()，落地时对不上就丢弃这次写入。
   ------------------------------------------------------------ */
export const SearchHistory = {
  KEY: 'kc_search_history',
  MAX: 10,
  _gen: 0,

  generation() { return this._gen },

  get() {
    try {
      const a = JSON.parse(localStorage.getItem(this.KEY) || '[]')
      return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()) : []
    } catch (e) { return [] }
  },

  add(kw) {
    const k = String(kw == null ? '' : kw).trim()
    if (!k) return this.get()
    const list = this.get().filter((x) => x !== k)
    list.unshift(k)
    const out = list.slice(0, this.MAX)
    try { localStorage.setItem(this.KEY, JSON.stringify(out)) } catch (e) { /* 隐私模式等写不了，忽略 */ }
    return out
  },

  clear() {
    this._gen++   /* 见上方说明：让在途搜索的写入失效 */
    try { localStorage.removeItem(this.KEY) } catch (e) { /* ignore */ }
  }
}
