// 积分不足弹窗全局状态
//
// 用法：
//   import { useQuotaModalStore } from '../store/useQuotaModalStore'
//
//   // 打开弹窗
//   useQuotaModalStore.getState().open({
//     need: 5000,
//     remaining: 1200,
//     message: '积分额度不足，请先充值后再使用',
//   })
//
//   // 关闭弹窗
//   useQuotaModalStore.getState().close()

import { create } from 'zustand'

interface QuotaModalState {
  open: boolean
  need?: number
  remaining?: number
  message?: string

  openModal: (info?: { need?: number; remaining?: number; message?: string }) => void
  closeModal: () => void
}

export const useQuotaModalStore = create<QuotaModalState>((set) => ({
  open: false,
  need: undefined,
  remaining: undefined,
  message: undefined,

  openModal: (info) => set({
    open: true,
    need: info?.need,
    remaining: info?.remaining,
    message: info?.message,
  }),

  closeModal: () => set({ open: false }),
}))
