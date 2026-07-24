require('dotenv').config({ quiet: true });

const express = require('express');
const session = require('express-session');
const path = require('path');
const {
  closePool,
  isMysqlEnabled,
  testConnection
} = require('./services/mysqlClient');
const MysqlSessionStore = require('./services/mysqlSessionStore');
const {
  cleanupOldLogs,
  logEvent,
  requestLogger
} = require('./services/appLogger');
const {
  createRateLimiter,
  securityHeaders
} = require('./middleware/security');
const { accessUrls } = require('./services/networkInfo');
const { startBackupScheduler } = require('./services/backupScheduler');
const {
  startDatabaseMaintenanceScheduler
} = require('./services/databaseMaintenanceScheduler');

const authRoutes = require('./routes/auth');
const chapterRoutes = require('./routes/chapters');
const knowledgeRoutes = require('./routes/knowledge');
const questionRoutes = require('./routes/questions');
const mistakeRoutes = require('./routes/mistakes');
const planRoutes = require('./routes/plans');
const quizRoutes = require('./routes/quiz');
const graphRoutes = require('./routes/graph');
const progressRoutes = require('./routes/progress');
const dashboardRoutes = require('./routes/dashboard');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 7;
let httpServer = null;
let backupScheduler = null;
let databaseMaintenanceScheduler = null;
let shutdownPromise = null;

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('生产环境必须配置 SESSION_SECRET');
}

app.use(securityHeaders);

// 限制请求体大小，避免异常输入占用过多内存。
app.use(express.json({ limit: '100kb', strict: true }));

const sessionOptions = {
  name: 'dmreview.sid',
  secret: process.env.SESSION_SECRET || 'discrete-math-review-local-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE
  }
};

// MySQL 模式下把登录会话一并持久化，重启 Node 服务后无需重新登录。
if (isMysqlEnabled()) {
  sessionOptions.store = new MysqlSessionStore();
}

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(session(sessionOptions));
app.use(requestLogger);

const writeLimiter = createRateLimiter({
  prefix: 'write',
  windowMs: 60 * 1000,
  max: Number(process.env.WRITE_RATE_LIMIT_MAX || 180),
  methods: ['POST', 'PUT', 'PATCH', 'DELETE']
});
const authLimiter = createRateLimiter({
  prefix: 'auth',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 30),
  methods: ['POST']
});

app.use('/api', writeLimiter);

// 浏览器会自动请求站点图标；当前没有品牌图标时返回空响应，避免无意义的 404。
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 暴露 public 目录下的静态页面、CSS 和 JS。
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/chapters', chapterRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/mistakes', mistakeRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/graph', graphRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/health', healthRoutes);

// 让根路径默认打开首页。
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  const isMalformedJson = error.type === 'entity.parse.failed';
  logEvent(
    isMalformedJson ? 'warn' : 'error',
    isMalformedJson ? 'request_parse_error' : 'request_error',
    {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    userId: req.session?.userId || null,
    message: String(error.message || '未知错误').slice(0, 1000)
    }
  ).catch((logError) => {
    console.error(`写入错误日志失败：${logError.message}`);
  });

  if (res.headersSent) {
    return next(error);
  }

  if (isMalformedJson) {
    res.status(400).json({ message: 'JSON 请求格式不正确' });
    return;
  }

  res.status(500).json({ message: '服务器处理请求时出现错误' });
});

async function startServer() {
  if (httpServer) return httpServer;
  await cleanupOldLogs();

  if (isMysqlEnabled()) {
    await testConnection();
    console.log('MySQL 数据库连接成功');
  }

  httpServer = await new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST);
    const handleError = (error) => {
      httpServer = null;
      reject(error);
    };
    server.once('error', handleError);
    server.once('listening', () => {
      server.off('error', handleError);
      resolve(server);
    });
  });

  const urls = accessUrls(PORT, HOST);
  console.log(`离散数学期末复习网站已启动：${urls.join('，')}`);
  await logEvent('info', 'server_started', {
    port: Number(PORT),
    host: HOST,
    accessUrls: urls,
    storageDriver: isMysqlEnabled() ? 'mysql' : 'json',
    nodeVersion: process.version
  }).catch(() => {});

  backupScheduler = startBackupScheduler();
  databaseMaintenanceScheduler = startDatabaseMaintenanceScheduler();
  return httpServer;
}

async function stopServer(reason = 'shutdown') {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    backupScheduler?.stop();
    backupScheduler = null;
    databaseMaintenanceScheduler?.stop();
    databaseMaintenanceScheduler = null;
    const server = httpServer;
    httpServer = null;

    if (server) {
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          server.closeAllConnections?.();
          resolve();
        }, 10000);
        timeout.unref?.();
        server.close(() => {
          clearTimeout(timeout);
          resolve();
        });
        server.closeIdleConnections?.();
      });
    }

    await logEvent('info', 'server_stopped', { reason }).catch(() => {});
    await closePool();
  })().finally(() => {
    shutdownPromise = null;
  });

  return shutdownPromise;
}

function installProcessHandlers() {
  let exiting = false;
  const finish = async (code, reason, error) => {
    if (exiting) return;
    exiting = true;
    if (error) {
      console.error(error);
      await logEvent('error', 'process_failure', {
        reason,
        message: String(error.message || error).slice(0, 1000)
      }).catch(() => {});
    }
    await stopServer(reason).catch((shutdownError) => {
      console.error(`停止网站服务失败：${shutdownError.message}`);
    });
    process.exit(code);
  };

  process.once('SIGINT', () => finish(0, 'SIGINT'));
  process.once('SIGTERM', () => finish(0, 'SIGTERM'));
  process.once('uncaughtException', (error) => finish(1, 'uncaughtException', error));
  process.once('unhandledRejection', (error) => finish(1, 'unhandledRejection', error));
  process.on('message', (message) => {
    if (message?.type === 'shutdown') {
      finish(0, 'supervisor_shutdown');
    }
  });
}

if (require.main === module) {
  installProcessHandlers();
  startServer().catch((error) => {
    console.error(`网站启动失败：${error.message}`);
    stopServer('startup_failed')
      .catch(() => {})
      .finally(() => process.exit(1));
  });
}

module.exports = {
  app,
  HOST,
  PORT,
  startServer,
  stopServer
};
