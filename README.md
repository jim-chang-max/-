# 离散数学期末复习网站

这是一个使用 Node.js + Express + 原生 HTML/CSS/JavaScript 搭建的离散数学期末复习网站。数据既可以保存在 JSON 文件中，也可以切换到 MySQL。

## 功能页面

- 首页：复习进度、今日任务、薄弱知识点和快捷入口
- 知识点：按章节查看离散数学核心知识
- 题库：按章节、题型、难度筛选题目，并查看答案解析
- 错题本：自动记录做错的题目，支持移出错题本
- 复习计划：根据考试日期生成每日复习任务
- 测验：随机组卷、限时答题、自动评分
- 知识图谱：用 SVG 展示章节依赖关系，点击节点查看重点和推荐题
- 登录：注册和登录后保存个人数据
- 账户中心：查看学习统计、修改密码；管理员可维护用户角色和删除账号

## 运行方式

```bash
npm install
npm start
```

启动后访问：

```text
http://localhost:3000
```

## 示例账号

```text
用户名：demo
密码：secret
```

## 使用本机 MySQL

项目默认使用 JSON，因此不配置数据库也能运行。切换到 MySQL：

1. 复制环境变量示例：

```powershell
Copy-Item .env.example .env
```

2. 打开 `.env`，填写本机 MySQL 密码，并修改：

```text
STORAGE_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的MySQL密码
DB_NAME=discrete_math_review
```

3. 创建数据库、执行迁移，并在空库中导入现有 JSON：

```bash
npm run db:init
```

4. 检查数据库连接和导入数量：

```bash
npm run db:test
```

5. 启动网站：

```bash
npm start
```

`db:init` 会自动创建 `discrete_math_review` 数据库并执行版本化迁移。只有所有业务数据表均为空时，才会导入 109 道题和现有章节、知识点、用户、错题、计划及测验记录；检测到现有数据时会跳过 JSON 播种，因此重复执行不会覆盖题目统计、错题或学习进度。使用 Navicat 连接 `127.0.0.1:3306` 后，可直接查看和编辑数据库。

以后代码增加数据库字段时，先执行：

```bash
npm run db:migrate
```

数据库版本记录在 `schema_migrations` 表。旧迁移会校验 SHA-256，已经执行的 SQL 文件不可再修改；新增迁移放在 `database/migrations/`，文件名使用 `003_说明.sql`、`004_说明.sql` 的递增格式。正式数据库执行待处理迁移前会自动创建 `pre-migration` 备份。

版本 `002` 已为错题、计划、测验、答题记录和知识进度补齐用户外键与级联删除，并把旧版匿名示例 ID `guest` 迁移到 `user-demo`。检查全部数据库关系：

```bash
npm run db:integrity
npm run test:integrity
```

`db:integrity` 只读检查 11 项父子关系是否存在孤立记录；`test:integrity` 会在事务中验证六个用户外键的级联删除，最后回滚测试数据。

主要关系表：

- `questions`：题库
- `users`：用户账号，密码使用 bcrypt 哈希保存
- `answer_records`：每次练习和测验的答题记录
- `mistakes`：每个用户独立的错题
- `review_plans`、`review_tasks`：复习计划与每日任务
- `quiz_history`、`quiz_answers`：测验结果与逐题明细
- `quiz_sessions`：随机试卷范围、有效期和交卷状态
- `topic_progress`：知识点掌握状态
- `app_documents`：章节、知识点、知识图谱等静态 JSON 数据

网站允许公开注册，新注册账号默认角色为 `student`。不同账号的错题、计划、答题记录、知识点掌握状态和测验历史相互隔离。

错题本、复习计划、正式作答和测验需要先登录。题库浏览和查看单题解析仍可公开使用。题库审核与编辑接口只允许 `admin` 角色访问，普通学生直接请求也会被服务器拒绝。

注册自己的账号后，可在项目目录中把该账号设置为管理员：

```bash
npm run user:promote -- 你的用户名
```

MySQL 模式会把登录会话保存在 `user_sessions` 表中，默认有效期为 7 天。Node 服务重启后登录状态仍然有效，退出登录会删除对应会话。生产环境必须配置随机且足够长的 `SESSION_SECRET`。

账户中心位于 `/account.html`。修改密码后，除当前浏览器外的其他登录会话会自动失效。管理员删除用户时，系统会在一个数据库事务中同步删除该用户的错题、计划、知识点进度、答题记录、测验记录和登录会话，避免产生孤立数据。

本地服务运行时，可执行账户端到端测试：

```bash
npm run test:account
```

该测试会自动创建临时管理员和学生，验证账户统计、密码修改、角色管理和关联数据删除，结束后自动清理测试数据。

验证迁移可重复执行且不会覆盖现有题目统计：

```bash
npm run test:migrations
```

测试使用随机命名的临时 MySQL 数据库，结束后自动删除，不会接触正式数据库。

## 备份、恢复与日志

创建完整 MySQL 数据备份：

```bash
npm run db:backup
```

备份文件保存在 `backups/`，包含题库、用户和全部学习数据，但不会包含登录会话。管理员也可以在账户中心点击“立即备份”。

恢复前请先停止网站服务，然后执行：

```bash
npm run db:restore -- backups/备份文件.json --confirm
```

恢复命令必须显式提供 `--confirm`，并会在覆盖数据库前自动生成一份 `pre-restore` 安全备份。恢复时会校验备份结构版本和 11 项关系完整性，兼容修复旧备份中的 `guest` 示例数据；发现未知孤立记录时整个恢复事务会回滚。恢复完成后所有旧登录会话会失效。

验证备份能够精确恢复数据库：

```bash
npm run test:backup
```

运行日志以 JSON Lines 格式保存在 `logs/app-YYYY-MM-DD.log`，默认保留 14 天，不记录密码和请求正文。管理员账户中心可以查看近期请求；保留天数可通过 `LOG_RETENTION_DAYS` 调整。

预览数据库维护候选记录（不会删除数据）：

```bash
npm run db:maintenance
```

确认预览后执行维护：

```bash
npm run db:maintenance -- --confirm
```

维护任务只立即删除过期登录会话，并删除失效超过 7 天的测验会话。测验历史、答案明细、错题、计划、知识点进度和日常答题记录默认永久保留。MySQL 模式每天凌晨 4 点自动执行维护，可用 `AUTO_DATABASE_MAINTENANCE_ENABLED`、`DATABASE_MAINTENANCE_HOUR` 和 `QUIZ_SESSION_RETENTION_DAYS` 调整；只有显式设置大于 0 的 `ANSWER_RECORD_RETENTION_DAYS` 才会清理旧日常答题记录。

验证维护预览和保留边界：

```bash
npm run test:maintenance
```

健康检查地址：

- `/api/health/live`：仅检查 Node 进程是否存活
- `/api/health/ready`：检查网站和 MySQL 是否可用
- `/api/health`：兼容的完整就绪检查

## 长期运行与同学访问

网站默认监听 `0.0.0.0:3000`。查看本机和局域网访问地址：

```bash
npm run network:info
```

同学需要和这台电脑连接同一个局域网，并通过显示的 IPv4 地址访问。电脑必须保持开机，MySQL 与网站服务也必须处于运行状态。安全响应头已默认启用；登录/注册接口限制为每个 IP 每 15 分钟 30 次写请求，其他 API 写请求限制为每分钟 180 次，可在 `.env` 中调整。

使用监督进程长期运行网站，并检查状态：

```bash
npm run service:start
npm run service:status
npm run service:stop
```

监督进程会在网站子进程异常退出后自动重启。需要关闭电脑或维护 MySQL 时，请先执行 `npm run service:stop`，让 Express 和数据库连接正常退出。MySQL 模式默认每天凌晨 3 点自动备份，普通备份保留 30 天且至少保留最新一份；可用 `AUTO_BACKUP_ENABLED`、`AUTO_BACKUP_HOUR` 和 `BACKUP_RETENTION_DAYS` 调整。

监督进程的启动、重复启动、网站子进程退出、自动重启和正常停止都会写入 `logs/app-YYYY-MM-DD.log`。管理员可在账户中心直接查看这些事件，并确认当前是否处于受监督运行状态及本次重启次数。

管理员账户中心还会显示数据库自动维护时间、最近完成时间和清理数量。维护成功或失败都会写入结构化日志。

Windows 开机启动和防火墙脚本位于 `scripts/windows/`。先用 `-WhatIf` 预览，确认后再执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/install-startup-task.ps1 -WhatIf
powershell -ExecutionPolicy Bypass -File scripts/windows/open-private-firewall.ps1 -WhatIf
```

实际开放防火墙时需使用管理员 PowerShell。规则只允许“专用网络”中的本地子网访问 TCP 3000，不面向公网。取消设置可运行 `uninstall-startup-task.ps1` 和 `close-private-firewall.ps1`。

执行只读主机诊断：

```bash
npm run host:check
```

该命令检查 MySQL 连接和迁移版本、会话密钥强度、监督进程、本机与局域网访问、磁盘空间、最新备份、数据库维护、近期错误，以及 Windows 开机任务、防火墙和网络类型。诊断不会输出数据库密码或会话密钥，也不会修改 Windows 设置。需要机器可直接解析的结果时可运行 `npm run host:check -- --json`。

首页通过 `/api/dashboard` 一次读取当前用户的知识点进度、今日任务、错题数量和薄弱章节。未登录时只展示公共题库统计，并提示登录。

知识点页面在未登录时把掌握状态暂存在浏览器中。用户注册或登录后再次打开知识点页面，这些本地记录会自动迁移到 MySQL，并在刷新或重新登录后继续保留。

## Render 在线演示

`render.yaml` 将 Render 服务固定为 JSON 演示模式，并自动生成独立的 `SESSION_SECRET`。不要在 Render 中把 `DB_HOST` 设置为 `127.0.0.1` 后启用 MySQL，因为该地址指向 Render 容器自身，无法访问这台电脑上的 MySQL。

Render 免费服务的本地文件不是可靠的长期数据库，实例重建后注册账号和学习记录可能丢失。因此，本机 MySQL 版本是正式学习数据源，Render 版本只用于在线预览。若现有服务不是通过 Blueprint 管理，请在 Render 的 Environment 页面手动添加长度至少 32 位的 `SESSION_SECRET`；程序在 Render 缺少该变量时会生成安全的实例临时密钥以保证启动，但实例重启后已有登录会失效。

计算题、证明题和简答题采用用户自评：提交后先显示参考答案和解析，用户选择“我答对了”或“需要复习”后才记录结果。测验中的主观题全部完成自评后才会正式计分，同一份试卷不能重复交卷。

## JSON 数据文件

所有示例数据都在 `data/` 目录下：

- `chapters.json`：章节数据
- `knowledge.json`：知识点数据
- `questions.json`：题库数据
- `question_bank.json`：完整题库包，支持 `metadata` 与 `questions` 结构
- `mistakes.json`：错题数据
- `plans.json`：复习计划数据
- `users.json`：用户数据
- `quizHistory.json`：测验记录
- `graph.json`：知识图谱节点、连线和章节摘要

JSON 模式下手动加题主要修改 `data/questions.json`。MySQL 模式下可在 Navicat 中编辑 `questions` 表，或修改 JSON 后重新运行 `npm run db:init`。

## 题库字段

每道题包含：

```js
{
  id,
  chapter,
  knowledgePoints,
  type,
  difficulty,
  title,
  options,
  answer,
  analysis,
  tags,
  source,
  reviewStatus,
  wrongCount,
  correctCount,
  needsReview
}
```

题库页面支持按章节、题型、难度、审核状态和关键词筛选。`needsReview=true` 的题目可在 `/review.html` 中人工审核和编辑。
