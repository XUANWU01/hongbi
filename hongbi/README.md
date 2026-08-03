# 红笔 HONGBI · 企业级刷题平台

题库管理 + AI 解析 + 云端刷题 + 错题追踪

## 快速启动

```bash
npm install
npm start          # http://localhost:8712
```

**环境变量**（可选）：

| 变量 | 默认 | 说明 |
| ------ | --- | --- |
| `PORT` | 8712 | 服务端口 |
| `HOST` | 0.0.0.0 | 绑定地址 |
| `MAX_UPLOAD_MB` | 100 | 上传大小限制 |
| `MAX_QUESTIONS` | 20000 | 单题库最大题数 |

## 功能

- 📤 **题库上传** — 支持 .docx/.pdf/.txt/.md/.csv/.json，批量/ZIP
- 🤖 **智能解析** — 6 阶段管线，题型感知答案匹配（100% 覆盖率）
- 📝 **人工修正** — 逐题编辑、删除、合并
- 🎯 **多模式刷题** — 顺序/随机/每日/错题专项
- 📊 **进度追踪** — 正确率曲线、连续打卡、断点续刷
- 📚 **题库广场** — 官方精选 + 社区共享，34 个考试分类
- 👥 **多角色** — 超级管理员/管理员/用户/访客
- 🔔 **通知系统** — 审核结果通知、官方收录通知
- 📁 **导出** — JSON/CSV/Word
- 🐳 **Docker** — 一键容器化部署

## 角色权限

| 角色 | 权限 |
| ------ | --- |
| 访客 | 浏览题库广场、刷题 |
| 用户 | 访客权限 + 上传/个人题库/共享/错题本/收藏 |
| 管理员 | 用户权限 + 审核队列/解析看板 |
| 超级管理员 | 管理员权限 + 审计日志/用户管理/官方题库 |

## 备份 & 恢复

```bash
npm run backup              # 备份到 server/data/backups/
npm run restore <文件路径>   # 从备份恢复
```

## 部署

```bash
# Docker
docker compose up -d

# 或直接运行
node server/server.js
```

## 技术栈

- Node.js ≥ 22.5
- Express + node:sqlite（零原生编译）
- Vanilla JS 前端（零构建）
- pdf.js + JSZip 文档解析
- tesseract.js OCR（可选，需 canvas 模块）

## 许可

MIT
