import { create } from 'zustand'

export interface EditorState {
  editorFont: string
  editorFontSize: string
  editorIndent: boolean
  editorSpacing: boolean

  setEditorFont: (v: string) => void
  setEditorFontSize: (v: string) => void
  setEditorIndent: (v: boolean) => void
  setEditorSpacing: (v: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  editorFont: '默认',
  editorFontSize: '标准',
  editorIndent: true,
  editorSpacing: true,

  setEditorFont: (v) => set({ editorFont: v }),
  setEditorFontSize: (v) => set({ editorFontSize: v }),
  setEditorIndent: (v) => set({ editorIndent: v }),
  setEditorSpacing: (v) => set({ editorSpacing: v }),
}))
