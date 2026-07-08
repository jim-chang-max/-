# 部署说明

这个项目是 `Node.js + Express` 应用，前端为原生 HTML/CSS/JavaScript，题库和学习记录先使用 JSON 文件保存。

## 当前推荐方案

优先推荐：
- Render Web Service
- Railway Web Service

暂不推荐直接使用 Vercel Serverless，因为当前版本依赖 JSON 文件写入。Serverless 环境的文件系统不适合作为持久化数据库。

## Render 免费部署

项目已提供 `render.yaml`，可以直接用 Render 的 Blueprint 或 Web Service 方式部署。

推荐配置：
- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable:
  - `NODE_ENV=production`

免费版可以正常打开网站和调用接口，但 JSON 写入属于运行容器内的临时文件状态。服务重启或重新部署后，做题记录、错题记录、复习计划完成状态可能会回到仓库里的初始 JSON 数据。

如果以后要长期保存用户数据，建议升级为：
- PostgreSQL / Supabase
- MongoDB
- SQLite + 持久化磁盘
- Render 付费实例 + Persistent Disk

## Railway

项目已提供 `railway.json`。

推荐配置：
- Start Command: `npm start`
- Environment Variable:
  - `NODE_ENV=production`

如果你在 Railway 中挂载 Volume，可以额外设置：
- `DATA_DIR=Volume 的挂载路径`

首次启动时，应用会使用仓库内置的 `data/*.json` 示例数据。

## GitHub

当前仓库已推送到：

```text
https://github.com/jim-chang-max/-.git
```

部署平台选择该仓库即可。

## 部署后检查

部署完成后访问：

```text
https://你的服务域名.onrender.com/api/health
```

如果返回 `ok: true`，说明后端已经启动成功。随后访问服务根路径即可打开首页。
