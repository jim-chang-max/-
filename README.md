# 离散数学期末复习网站

这是一个使用 Node.js + Express + 原生 HTML/CSS/JavaScript 搭建的离散数学期末复习网站骨架。

## 功能页面

- 首页：复习进度、今日任务、薄弱知识点和快捷入口
- 知识点：按章节查看离散数学核心知识
- 题库：按章节、题型、难度筛选题目，并查看答案解析
- 错题本：自动记录做错的题目，支持移出错题本
- 复习计划：根据考试日期生成每日复习任务
- 测验：随机组卷、限时答题、自动评分
- 知识图谱：用 SVG 展示章节依赖关系，点击节点查看重点和推荐题
- 登录：注册和登录后保存个人数据

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

## 数据文件

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

后续手动加题时，主要修改 `data/questions.json`。

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
