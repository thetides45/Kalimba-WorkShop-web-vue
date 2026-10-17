/* 未读通知数（Pinia）—— 顶栏红点、消息页「全部已读」后刷新都走它。
   与 V3 一样：只在**已登录**时查询；未登录恒为 0。 */
import { defineStore } from 'pinia'
import { api } from '@/api'

export const useNotificationStore = defineStore('notification', {
  state: () => ({ unread: 0 }),

  actions: {
    async refresh() {
      const r = await api.notifications.unreadCount()
      this.unread = (r && r.code === 0 && r.data) ? (r.data.count || 0) : 0
      return this.unread
    },

    setUnread(n) { this.unread = Number(n) || 0 }
  }
})
