---
name: vercel
description: Vercel 前端部署 provider
enhances: deploy
priority: high
appliesTo: [frontend, nextjs, vercel, ssr, edge]
---

# Vercel 部署 provider

> 主 skill `dev-deploy` Step 2 调度本 provider 时，按本文档命令块顺序执行。

## 必须遵守

- 部署前确保 `vercel` CLI 已登录：`vercel whoami`
- Production 部署用 `--prod`，preview 部署不带任何标志
- 环境变量通过 `vercel env pull .env.local` 拉取，不写入仓库
- 部署完成后必须抓 URL 写入 `.loop/deploy/checklist.md`

## 命令块

### Preview

```bash
vercel
```

### Staging

```bash
vercel --target=staging
```

### Production

```bash
vercel --prod
```

## 健康检查

| 项目 | 命令 |
|------|------|
| URL 200 | `curl -fsSL <url> -o /dev/null && echo OK` |
| /api/health | `curl -fsSL <url>/api/health` |
| 关键页面 | `curl -I <url>/<key-route>` |

## 反模式（禁止）

- `vercel --force` 绕过缓存
- 在脚本里硬编码 `VERCEL_TOKEN`
- Production 部署后不抓 URL
