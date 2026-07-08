const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const chapterRoutes = require('./routes/chapters');
const knowledgeRoutes = require('./routes/knowledge');
const questionRoutes = require('./routes/questions');
const mistakeRoutes = require('./routes/mistakes');
const planRoutes = require('./routes/plans');
const quizRoutes = require('./routes/quiz');
const graphRoutes = require('./routes/graph');

const app = express();
const PORT = process.env.PORT || 3000;

// 解析 JSON 请求体，方便前端用 fetch 提交数据。
app.use(express.json());

// 使用 session 保存登录状态。演示项目使用本地内存存储，正式部署建议换成 Redis 等持久化方案。
app.use(
  session({
    secret: 'discrete-math-review-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

// 暴露 public 目录下的静态页面、CSS 和 JS。
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/mistakes', mistakeRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/graph', graphRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: '离散数学复习网站服务运行中' });
});

// 让根路径默认打开首页。
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`离散数学期末复习网站已启动：http://localhost:${PORT}`);
});
