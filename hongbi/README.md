# 红笔 HONGBI · 服务器化刷题平台

把题目，写进红笔里。一个**服务器化**的刷题平台：上传题库文档（Word/PDF/TXT 等）→ 服务器解析 → 共享审核 → 刷题、错题本、收藏、统计全部云端同步。支持多用户与跨设备进度。

## 功能

1. **上传题库**：支持 .docx / .pdf / .txt / .md / .csv / .tsv / .json（最大 100MB，可配），由**服务器解析**（PDF 用 pdfjs-dist，Word 用 jszip，文本状态机适配 10+ 种格式：同行选项、全角点、正确答案/【答案】、判断题、多选题等）。
2. **共享审核**：上传时选择「同意共享」→ 进入审核队列 → 管理员批准后进公共主题库；驳回必填原因反馈给上传者。不同意则进个人私库。
3. **账号体系**：设备匿名登录（免打扰）或用户名+密码注册；登录自动合并设备数据。三级角色：超级管理员 / 管理员 / 用户（首位注册自动成为超级管理员，或配置 `HONGBI_ADMIN_KEY` 升级）。
4. **刷题引擎**：顺序 / 随机 / 每日一练 / 错题专项四种模式；选择题即时判对；简答/填空可**输入作答**，自动判分提示（要点命中率），对照参考答案后自评。
5. **错题本**：按答错次数排序（≥3 次标「加急」），回显你当时的作答，支持已掌握/专项重刷。
6. **收藏 / 统计**：题目收藏（F 键）；累计作答、正确率、近 7 天趋势。
7. **导出**：Word(.docx) / PDF(打印) / JSON / CSV，大题库分页拉取完整导出。
8. **多主题**：暗夜科技 / 纸墨经典 / 晨雾 / 赛博脉冲 四套界面风格自由切换。
9. **自适应**：桌面宽屏到 225px 极窄窗口全适配，移动端底部导航。

## 运行

需要 Node.js ≥ 22.5（使用内置 SQLite，无需数据库服务）。

```bash
npm install
node server/server.js
```

访问 <http://localhost:8712>（默认监听 0.0.0.0，局域网内其他设备访问 `http://本机IP:8712`）。

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | 8712 | 端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `MAX_UPLOAD_MB` | 100 | 上传大小上限 |
| `MAX_QUESTIONS` | 20000 | 单套题库题数上限 |
| `HONGBI_ADMIN_KEY` | 无 | 设置后可用密钥将账号升级为超级管理员 |
| `HONGBI_DB` | server/data/hongbi.db | 数据库路径 |

## API 概览

- 认证：`/api/auth/device|register|login|logout|me`
- 题库：`GET/POST/PATCH/DELETE /api/sets`、`GET /api/sets/:id`（题目分页）、`POST /api/sets/:id/questions`（追加）
- 上传解析：`POST /api/upload`（返回 jobId）、`GET /api/upload/:id`（轮询）
- 刷题：`POST /api/quiz/answer`、`GET /api/wrong`、`GET/POST/DELETE /api/favorites`、`GET /api/stats/me`
- 审核：`GET /api/admin/reviews`、`POST /api/admin/reviews/:id/approve|reject`
- 导出：`POST /api/export/docx`（Word 文档）、`POST /api/import`（旧数据迁移）

## 目录结构

```
hongbi/
├── index.html / css/ / js/        # 前端（原生 JS，零构建）
│   ├── core.js                    # 工具 + 请求封装 + 主题系统
│   ├── api.js                     # 服务端 API 客户端
│   ├── views.js                   # 视图 + 刷题引擎
│   └── app.js                     # 路由 / 事件 / 登录
├── server/
│   ├── server.js                  # Express 入口 + 数据库迁移
│   ├── db.js                      # SQLite schema
│   ├── auth.js                    # 认证与角色
│   ├── parser/                    # 服务器端解析器（docx/pdf/文本）
│   ├── routes/                    # upload/sets/quiz/admin 路由
│   └── seed.js                    # 官方种子题库
├── docs/                          # 项目设计文档
└── examples/                      # 示例题库
```

## 技术栈

Node.js + Express + SQLite（node:sqlite，零原生编译）+ 原生 JS 前端。前端依赖：pdfjs-dist、jszip（服务器端解析用）。

## 文档

- [项目设计书 v2](docs/01-项目设计书.md)
- [服务器化设计（定稿）](docs/02-服务器化设计.md)
