# MankTV API Console · API Contract (v2)

Base URL 开发: http://localhost:3000
认证: Authorization: Bearer <API_KEY>
统一响应: { ok, data, meta, error } · Content-Type application/json

## 1. 健康检查
GET /api/health → 200 { ok:true, service:"MankTV API", time:ISO }

## 2. Community 社区广场
GET  /api/community/works                列表 query:{type,subtype,sort,page,limit,search}
GET  /api/community/works/:id            作品详情 (含 tags, recentComments, author)
GET  /api/community/works/:id/comments   评论列表分页
POST /api/community/works/:id/like       点赞切换 → { likes, liked }
POST /api/community/works/:id/comments   发表评论 body:{content,replyTo?}

WorkPayload: { id,type,subtype,title,summary,cover,author:{id,name,avatar},
  likes,commentCount,status,createdAt,tags[],recentComments[] }

## 3. 工作区 (type ∈ novel|image|comic|audio|video)
POST /api/:type/generate   提交生成 body:{prompt,model,params} → {jobId}
GET  /api/:type/jobs/:id   任务状态 → {status,progress,result[]}
GET  /api/:type/models     模型列表 + 路由供应商 (Pollinations/智谱/通义/Seedance/可灵)
POST /api/:type/save       保存到用户空间 → {workId}
GET  /api/:type/me/works   我的作品分页

## 4. 认证 Auth
POST /api/auth/login     body:{email,password} → {token, user:{id,name,email,role}}
POST /api/auth/register  body:{name,email,password} → {token, user}
GET  /api/auth/me        当前用户资料

## 5. 密钥 Keys
GET  /api/keys           ApiKey[] {id,name,tokenPrefix,scopes[],used,quota,createdAt,status}
POST /api/keys           body:{name,scopes,expiresAt} → ApiKey & token(仅首次)
POST /api/keys/:id/recycle  作废密钥

## 6. 管理控制台
GET /api/admin/kpi       → {calls,works,users,credits}
GET /api/admin/health    → Endpoint 健康 [{group,method,path,status,avgMs}]
GET /api/admin/requests  → 最近请求 [{id,method,path,statusCode,ms,at}]
GET /api/admin/works     → 作品管理 (含 status 过滤)

## 7. 错误码
200 OK · 400 参数错误(error.details) · 401 未认证 · 403 scope 不足
404 不存在 · 429 限流 (Retry-After) · 500 服务端错误(error.traceId)
451 Unavailable · 审核未通过 (含 in/out 字段)

## 8. 限流 Header
X-RateLimit-Limit · X-RateLimit-Remaining · X-RateLimit-Reset

## 9. 内容审核双链路
/:type/generate 与 /:type/save 在入模型路由前：先「输入审核」→ 生成后「输出审核」→ 任一失败 451


