// 排版导出工具
//
// Phase 1：仅支持 PNG 单页导出（基于 Konva stage.toDataURL）
// Phase 2 将扩展：PDF 多页、长图拼接

import type Konva from 'konva'
import { jsPDF } from 'jspdf'

// PNG 单页导出（浏览器下载）
export function exportStagePNG(
  stage: Konva.Stage | null,
  filename = `manjvquan_${Date.now()}.png`,
  pixelRatio = 1
): boolean {
  if (!stage) return false
  try {
    const dataURL = stage.toDataURL({ mimeType: 'image/png', pixelRatio })
    const a = document.createElement('a')
    a.href = dataURL
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return true
  } catch (e) {
    console.error('[layoutApi] PNG 导出失败', e)
    return false
  }
}

// 复用：把 stage 转 canvas（供 PDF 多页使用）
export async function stageToCanvas(
  stage: Konva.Stage | null,
  pixelRatio = 1
): Promise<HTMLCanvasElement | null> {
  if (!stage) return null
  return stage.toCanvas({ pixelRatio })
}

// Phase 2 预留：多页 PDF 导出（一次导出所有 page）
export async function exportPagesPDF(
  stages: (Konva.Stage | null)[],
  filename = `manjvquan_${Date.now()}.pdf`
): Promise<boolean> {
  if (stages.length === 0) return false
  try {
    const canvases = await Promise.all(
      stages.map((s) => (s ? stageToCanvas(s, 1) : Promise.resolve(null)))
    )
    const first = canvases.find(Boolean)
    if (!first) return false

    const orientation = first.width >= first.height ? 'l' : 'p'
    const pdf = new jsPDF({
      orientation,
      unit: 'px',
      format: [first.width, first.height],
    })

    canvases.forEach((canvas, i) => {
      if (!canvas) return
      if (i > 0) pdf.addPage([canvas.width, canvas.height], orientation)
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        0,
        canvas.width,
        canvas.height
      )
    })

    pdf.save(filename)
    return true
  } catch (e) {
    console.error('[layoutApi] PDF 导出失败', e)
    return false
  }
}
