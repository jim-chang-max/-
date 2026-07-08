# 部署说明

这个项目是 `Node.js + Express` 后端应用，并且会把刷题记录、错题、复习计划写入 JSON 文件。

## 推荐方案

优先推荐：

- Render Web Service
- Railway Web Service

暂不推荐直接使用 Vercel Serverless，因为当前版本依赖本地 JSON 文件写入。Serverless 环境的文件系统不适合作为持久化数据库。

## Render

项目已提供 `render.yaml`。

建议配置：

- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable:
  - `NODE_ENV=production`
  - `DATA_DIR=/var/data`
- Disk:
  - Mount Path: `/var/data`

首次启动时，应用会把仓库内置的 `data/*.json` 示例数据复制到 `DATA_DIR`。

## Railway

项目已提供 `railway.json`。

建议配置：

- Start Command: `npm start`
- Environment Variable:
  - `NODE_ENV=production`
  - `DATA_DIR=/app/data`

如果你在 Railway 上挂载 Volume，可以把 `DATA_DIR` 改成 Volume 的挂载路径。

## GitHub

先推送代码到 GitHub，然后在 Render 或 Railway 中选择对应仓库部署。

```bash
git remote add origin https://github.com/你的用户名/discrete-math-review.git
git push -u origin master
```

## 后续升级

如果以后要部署到 Vercel 或多个实例，建议把 JSON 存储换成数据库，例如：

- SQLite + 持久化磁盘
- PostgreSQL
- MongoDB
- Supabase
