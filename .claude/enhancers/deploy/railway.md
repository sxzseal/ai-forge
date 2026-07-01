---
name: railway
description: Railway 后端 / 数据库部署 provider
enhances: deploy
priority: high
appliesTo: [backend, api, database, prisma, railway, postgres]
---

# Railway 部署 provider

> 主 skill `dev-deploy` Step 3 调度本 provider 时，按本文档命令块顺序执行。
>
> **何时启用**：项目存在 `src/app/api/` 路由或 Prisma schema 时。纯前端项目主 skill 不会选中本 enhancer。

## 必须遵守

- 部署前确保 `railway` CLI 已登录：`railway whoami`
- 项目已链接到 Railway service：`railway status` 应显示当前 service
- 数据库迁移使用 `railway run` 在远端环境执行，**不在本地直连生产 DB**
- 部署完成后健康检查 `/api/health` 必须返回 200

## 命令块

### 检查链接

```bash
railway status
# 未链接则：railway link
```

### 部署后端

```bash
railway up
```

### 数据库迁移（如存在 Prisma）

```bash
railway run npx prisma migrate deploy
# 然后：
railway run npx prisma generate
```

### 查看日志

```bash
railway logs --service <service-name> --tail 100
```

## 健康检查

| 项目 | 命令 |
|------|------|
| Service running | `railway status` 显示 RUNNING |
| /api/health | `curl -fsSL <railway-url>/api/health` |
| 数据库连通 | `railway run node -e "..."`（项目特定） |

## 反模式（禁止）

- 在本地用生产 `DATABASE_URL` 跑 `prisma migrate`（绕过 Railway 环境隔离）
- `railway up --detach` 后立刻退出不等部署完成（健康检查会拿到中间状态）
- 把 `RAILWAY_TOKEN` 写进 git 跟踪的文件
