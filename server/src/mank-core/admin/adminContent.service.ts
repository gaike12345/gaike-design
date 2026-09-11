/**
 * 内容管理服务层 — 从 routes/admin.ts 提取
 * 作品/评论/功能/支付 的 CRUD 逻辑
 */

import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import {
  BusinessError,
  NotFoundError,
  ConflictError,
} from '../../mank-common/errors'

// ───────────────────── 作品管理 ─────────────────────

export async function listWorks(params: {
  type?: string; hidden?: string; keyword?: string
  page: number; pageSize: number
}) {
  const { type, hidden, keyword, page, pageSize } = params
  logger.info('SERVICE_LIST_WORKS_ENTRY', { type, hidden, keyword, page, pageSize })
  const where: any = {}
  if (type) where.type = type
  if (hidden === 'true') where.hidden = true
  if (hidden === 'false') where.hidden = false
  if (keyword) where.OR = [{ title: { contains: keyword } }, { subtype: { contains: keyword } }]

  const [works, total] = await Promise.all([
    prisma.work.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize, take: pageSize,
      include: {
        user: { select: { id: true, nickname: true, email: true, avatar: true } },
        _count: { select: { comments: true, likes: true } },
      },
    }),
    prisma.work.count({ where }),
  ])
  const result = { works, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  logger.info('SERVICE_LIST_WORKS_EXIT', { total, page, pageSize })
  return result
}

export async function setWorkHidden(id: string, hidden: boolean) {
  logger.info('SERVICE_SET_WORK_HIDDEN_ENTRY', { id, hidden })
  if (typeof hidden !== 'boolean') throw new BusinessError('hidden 必须是 boolean')
  const w = await prisma.work.findUnique({ where: { id } })
  if (!w) throw new NotFoundError('作品不存在')
  const updated = await prisma.work.update({ where: { id }, data: { hidden } })
  logger.info('SERVICE_SET_WORK_HIDDEN_EXIT', { id, hidden: updated.hidden })
  return { ok: true, hidden: updated.hidden }
}

export async function deleteWork(id: string) {
  logger.info('SERVICE_DELETE_WORK_ENTRY', { id })
  const w = await prisma.work.findUnique({ where: { id } })
  if (!w) throw new NotFoundError('作品不存在')
  await prisma.work.delete({ where: { id } })
  logger.info('SERVICE_DELETE_WORK_EXIT', { id })
  return { ok: true }
}

export async function getWorkDetail(id: string) {
  logger.info('SERVICE_GET_WORK_DETAIL_ENTRY', { id })
  const work = await prisma.work.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, nickname: true, avatar: true, email: true } },
      _count: { select: { likes: true, comments: true } },
      comments: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, nickname: true, avatar: true, email: true } } },
      },
    },
  })
  if (!work) throw new NotFoundError('作品不存在')
  logger.info('SERVICE_GET_WORK_DETAIL_EXIT', { id })
  return { work }
}

// ───────────────────── 评论管理 ─────────────────────

export async function listComments(params: {
  keyword?: string; workId?: string
  page: number; pageSize: number
}) {
  const { keyword, workId, page, pageSize } = params
  logger.info('SERVICE_LIST_COMMENTS_ENTRY', { keyword, workId, page, pageSize })
  const where: any = {}
  if (keyword) where.content = { contains: keyword }
  if (workId) where.workId = workId

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize, take: pageSize,
      include: {
        user: { select: { id: true, nickname: true, email: true, avatar: true } },
        work: { select: { id: true, title: true, type: true } },
      },
    }),
    prisma.comment.count({ where }),
  ])
  logger.info('SERVICE_LIST_COMMENTS_EXIT', { total, page, pageSize })
  return { comments, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

export async function deleteComment(id: string) {
  logger.info('SERVICE_DELETE_COMMENT_ENTRY', { id })
  const c = await prisma.comment.findUnique({ where: { id } })
  if (!c) throw new NotFoundError('评论不存在')
  await prisma.comment.delete({ where: { id } })
  logger.info('SERVICE_DELETE_COMMENT_EXIT', { id })
  return { ok: true }
}

// ───────────────────── 功能管理 ─────────────────────

const VALID_MODULES = ['novel', 'image', 'comic', 'audio', 'video']
const VALID_TYPES = ['input', 'textarea', 'slider', 'select', 'toggle', 'upload', 'color', 'custom']

export async function listFeatures(module?: string) {
  logger.info('SERVICE_LIST_FEATURES_ENTRY', { module })
  const where: { module?: string } = {}
  if (module) where.module = module
  const result = await prisma.moduleFeature.findMany({ where, orderBy: [{ module: 'asc' }, { sort: 'asc' }] })
  logger.info('SERVICE_LIST_FEATURES_EXIT', { count: result.length })
  return result
}

export async function createFeature(data: {
  module: string; featureKey: string; displayName: string; type: string
  sort?: number; config?: any
}) {
  const { module, featureKey, displayName, type, sort, config } = data
  logger.info('SERVICE_CREATE_FEATURE_ENTRY', { module, featureKey, displayName, type })
  if (!module || !featureKey || !displayName || !type) {
    throw new BusinessError('module, featureKey, displayName, type 不能为空')
  }
  if (!VALID_MODULES.includes(module)) throw new BusinessError('非法的 module 值')
  if (!VALID_TYPES.includes(type)) throw new BusinessError('非法的 type 值')

  try {
    const result = await prisma.moduleFeature.create({
      data: {
        module, featureKey, displayName, type,
        sort: sort ?? 0,
        config: config ? JSON.stringify(config) : null,
      },
    })
    logger.info('SERVICE_CREATE_FEATURE_EXIT', { id: result.id, module, featureKey })
    return result
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'P2002') throw new ConflictError('该板块下已存在此 featureKey')
    throw e
  }
}

export async function updateFeature(id: string, data: {
  displayName?: string; type?: string; status?: string
  sort?: number; config?: any
}) {
  logger.info('SERVICE_UPDATE_FEATURE_ENTRY', { id, fields: Object.keys(data) })
  const updateData: any = {}
  if (data.displayName !== undefined) updateData.displayName = data.displayName
  if (data.type !== undefined) updateData.type = data.type
  if (data.status !== undefined) updateData.status = data.status
  if (data.sort !== undefined) updateData.sort = data.sort
  if (data.config !== undefined) updateData.config = data.config ? JSON.stringify(data.config) : undefined
  const result = await prisma.moduleFeature.update({ where: { id }, data: updateData })
  logger.info('SERVICE_UPDATE_FEATURE_EXIT', { id })
  return result
}

export async function deleteFeature(id: string) {
  logger.info('SERVICE_DELETE_FEATURE_ENTRY', { id })
  await prisma.moduleFeature.delete({ where: { id } })
  logger.info('SERVICE_DELETE_FEATURE_EXIT', { id })
  return { ok: true }
}

// ───────────────────── 支付订单 ─────────────────────

export async function listPayments(operatorRole: string | undefined, params: {
  status?: string; page: number; pageSize: number
}) {
  logger.info('SERVICE_LIST_PAYMENTS_ENTRY', { operatorRole, ...params })
  if (operatorRole !== 'superadmin') {
    return { orders: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }
  }
  const { status, page, pageSize } = params
  const where: { status?: string } = {}
  if (status) where.status = status

  const [orders, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize, take: pageSize,
      include: { user: { select: { id: true, nickname: true, email: true, avatar: true } } },
    }),
    prisma.paymentOrder.count({ where }),
  ])
  logger.info('SERVICE_LIST_PAYMENTS_EXIT', { total, page, pageSize })
  return { orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}
