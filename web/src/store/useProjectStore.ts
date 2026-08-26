// 项目 Store — 数据源已切换为后端 API 调用
//
// 职责：管理用户项目列表（CRUD），提供当前激活项目。
// 数据源：GET/POST/PUT/DELETE /api/projects/*
//
// payload 字段为跨板块数据流转的内存载体，不持久化到后端（后续可扩展）

import { create } from 'zustand'
import { api } from '../services/api'

export type ProjectType = 'image' | 'script' | 'comic' | 'audio' | 'video' | 'community'

export interface Project {
  id: string
  name: string
  type: ProjectType
  cover?: string
  description?: string
  createdAt: number
  updatedAt: number
  payload: {
    script?: unknown
    images?: string[]
    pages?: unknown
    audio?: unknown
    video?: unknown
  }
}

// 后端 API 返回的项目结构 → 前端 Project 映射
function mapProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.title,
    type: (raw.genre as ProjectType) || 'script',
    cover: raw.cover || undefined,
    description: raw.synopsis || undefined,
    createdAt: new Date(raw.createdAt).getTime(),
    updatedAt: new Date(raw.updatedAt).getTime(),
    payload: {},
  }
}

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean
  error: string | null

  activeProject: () => Project | null

  // CRUD（异步）
  fetchProjects: () => Promise<void>
  createProject: (name: string, type?: ProjectType, description?: string) => Promise<string>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  setActiveProject: (id: string) => void

  // 跨板块数据流转（内存，不持久化）
  updatePayload: (id: string, partial: Partial<Project['payload']>) => void

  // 初始化（向后兼容：调 fetchProjects）
  hydrate: () => void

  clearError: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,
  error: null,

  activeProject: () => {
    const { projects, activeProjectId } = get()
    return projects.find((p) => p.id === activeProjectId) ?? null
  },

  fetchProjects: async () => {
    set({ loading: true, error: null })
    try {
      const res = await api.get<{ list: any[]; total: number }>('/api/projects')
      const projects = res.list.map(mapProject)
      set((state) => ({
        projects,
        loading: false,
        activeProjectId: state.activeProjectId ?? projects[0]?.id ?? null,
      }))
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },

  createProject: async (name, type = 'script', description) => {
    set({ loading: true, error: null })
    try {
      const res = await api.post<{ project: any }>('/api/projects', {
        title: name.trim() || '未命名项目',
        genre: type,
        synopsis: description,
      })
      const project = mapProject(res.project)
      set((state) => ({
        projects: [project, ...state.projects],
        activeProjectId: project.id,
        loading: false,
      }))
      return project.id
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
      return ''
    }
  },

  renameProject: async (id, name) => {
    try {
      await api.put(`/api/projects/${id}`, { title: name.trim() })
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p,
        ),
      }))
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  deleteProject: async (id) => {
    try {
      await api.del(`/api/projects/${id}`)
      set((state) => {
        const projects = state.projects.filter((p) => p.id !== id)
        const activeProjectId =
          state.activeProjectId === id
            ? projects[0]?.id ?? null
            : state.activeProjectId
        return { projects, activeProjectId }
      })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  updatePayload: (id, partial) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id
          ? { ...p, payload: { ...p.payload, ...partial }, updatedAt: Date.now() }
          : p,
      ),
    })),

  hydrate: () => {
    // 切换为 API 调用，不再从 localStorage 读取
    get().fetchProjects()
  },

  clearError: () => set({ error: null }),
}))
