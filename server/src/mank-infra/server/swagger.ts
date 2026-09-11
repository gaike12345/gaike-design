/**
 * Swagger / OpenAPI 配置
 * ======================
 *
 * 功能：
 *   - 自动扫描 routes/ 下所有 .ts 文件中的 @openapi JSDoc 注解
 *   - 提供 Swagger UI 页面（/api/docs）
 *   - 统一安全方案（JWT Bearer）
 *   - 通用错误响应 schema
 */

import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import { Express } from 'express'
import path from 'path'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Man TV API',
      version: '1.0.0',
      description: 'AI 驱动的全能创作平台 — 后端接口文档\n\n## 角色说明\n- **superadmin**：超级管理员（唯一，admin@manktv.com）\n- **admin**：管理员\n- **user**：普通用户\n\n## 认证方式\n除标注为 `公开` 的接口外，所有接口均需在请求头携带 JWT Bearer Token：\n```\nAuthorization: Bearer <token>\n```',
      contact: {
        name: 'Man TV',
        email: 'admin@manktv.com',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API 基础路径',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer Token 认证。登录/注册成功后获取。',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: '错误信息' },
          },
        },
        Ok: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
          },
        },
        Paginated: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: '总记录数' },
            page: { type: 'integer', description: '当前页码' },
            pageSize: { type: 'integer', description: '每页条数' },
            totalPages: { type: 'integer', description: '总页数' },
          },
        },
        AuthResult: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT Token' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                uid: { type: 'integer' },
                nickname: { type: 'string' },
                avatar: { type: 'string', nullable: true },
                role: { type: 'string', enum: ['user', 'admin', 'superadmin'] },
              },
            },
          },
        },
        Placeholder: {
          type: 'object',
          properties: {
            placeholder: { type: 'boolean', description: 'Demo 模式标记', example: true },
            comingSoon: { type: 'boolean', description: '功能即将上线', example: true },
            contactAdmin: { type: 'boolean', description: '请联系管理员', example: true },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: [path.resolve(__dirname, '../../routes/*.ts')],
}

const swaggerSpec = swaggerJsdoc(options)

/** 在 Express 应用上挂载 Swagger UI */
export function setupSwagger(app: Express): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Man TV API 文档',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      defaultModelsExpandDepth: -1,
    },
  }))

  // OpenAPI JSON 端点（便于 CI/CD 校验和 SDK 生成）
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })
}

export default swaggerSpec
