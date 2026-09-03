/**
 * 全局 Express 类型扩展 — Multer 文件上传
 *
 * 补充 multer 注入的 file / files 属性类型，
 * 显式声明 req: Request 时不会报类型错误。
 */
declare global {
  namespace Express {
    interface Request {
      /** 单个上传文件（由 multer 注入） */
      file?: Express.Multer.File

      /** 多个上传文件（由 multer 注入） */
      files?:
        | Express.Multer.File[]
        | { [fieldname: string]: Express.Multer.File[] }
        | undefined
    }
  }
}

export {}
