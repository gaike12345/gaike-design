/**
 * 时间相关工具函数
 */

/**
 * 等待指定毫秒数（常用于轮询间隔、重试退避、进度模拟）
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
