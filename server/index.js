const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { httpAuth, wsAuth, wsToken, loginHandler, changePasswordHandler, onTokensInvalidated, validateTokenExported, writeLocalToken } = require('./auth');
const { getProjects, getSessions, readSession } = require('./history');
const { getAgentStatuses } = require('./agent-config');
const {
  handleMessage, closeWS, listSessions, readLog, registerWS, unregisterWS,
  startSessionHttp, attachSessionHttp, inputSessionHttp, resizeSessionHttp, pollSessionHttp,
  killSessionHttp, deleteSessionHttp, renameSessionHttp,
  startShellHttp, inputShellHttp, resizeShellHttp, pollShellHttp, killShellHttp,
} = require('./pty-manager');
const { listDir, readFilePreview, statFile, createDirectory, handleFsUploadRequest, handleAttachmentUploadRequest, handleFsDownloadRequest } = require('./fs-handler');
const { getSettingsHandler, saveSettingsHandler } = require('./web-settings');

const PORT = parseInt(process.env.PORT || 3000);

// ── 单实例锁：同一机器只允许运行一个 remotecc 服务 ─────────────────────────────────
const RCC_DIR  = path.join(os.homedir(), '.rcc');
const LOCK_FILE = path.join(RCC_DIR, 'server.lock');
fs.mkdirSync(RCC_DIR, { recursive: true });

// PID 可能已被系统复用给无关进程（重启机器/容器后很常见）：仅凭 kill(pid,0) 会误判“已在运行”，
// 导致 watchdog 反复拉起又立即退出。Linux 上再核对 cmdline 是否真是 RemoteCC 服务进程。
function isRccServerPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try { process.kill(pid, 0); } catch (e) { if (e.code !== 'EPERM') return false; }
  if (process.platform !== 'linux') return true;
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return /(?:^|[\/\0])(?:proxy|index)\.js(?:\0|$)/.test(cmdline);
  } catch (_) {
    return true;   // 读不到 /proc 时保守按存活处理
  }
}

// 写入锁文件（含 pid 和端口），启动时检测已有实例
try {
  const existing = fs.existsSync(LOCK_FILE)
    ? JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
    : null;

  if (existing) {
    if (isRccServerPid(existing.pid)) {
      console.error(
        `\n  ✗ RemoteCC 已在运行 (pid ${existing.pid}, port ${existing.port})\n` +
        `    如需重启，先运行: kill ${existing.pid}\n`
      );
      process.exit(1);
    }
    // 旧进程已死，清除锁
    fs.unlinkSync(LOCK_FILE);
  }
} catch (_) {}

// 写入当前锁
fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, port: PORT, startedAt: Date.now() }));

// 进程退出时删除锁
function removeLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}
process.on('exit',   removeLock);
process.on('SIGTERM', () => { removeLock(); process.exit(0); });
process.on('SIGINT',  () => { removeLock(); process.exit(0); });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// ── Static (no auth) ──────────────────────────────────────────────────────────
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir));

// ── API ───────────────────────────────────────────────────────────────────────
app.use(express.json());
app.post('/api/login', loginHandler);

// ── 文档接口（无需 auth，供帮助页读取）────────────────────────────────────────
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const ALLOWED_DOCS = ['usage.md', 'installation.md', 'api.md', 'architecture.md', 'development.md'];
app.use('/docs/assets', express.static(path.join(DOCS_DIR, 'assets')));
app.get('/docs/:name', (req, res) => {
  const name = req.params.name;
  if (!ALLOWED_DOCS.includes(name)) return res.status(404).json({ error: 'Not found' });
  const p = path.join(DOCS_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Not found' });
  res.type('text/plain; charset=utf-8').sendFile(p);
});
app.get('/docs', (req, res) => {
  res.json(ALLOWED_DOCS.map(f => ({ name: f, title: f.replace('.md', '') })));
});

app.use(httpAuth);

// ── 图片上传（存到 ~/.rcc/uploads/，返回服务器路径供 claude 使用）──────────
const UPLOAD_DIR = path.join(RCC_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.post('/api/upload', (req, res) => {
  handleAttachmentUploadRequest(req, res, UPLOAD_DIR, req.headers['x-filename-encoded'] || req.headers['x-filename'] || 'image.png');
});

app.get('/api/agents',                 (req, res) => { try { res.set('Cache-Control', 'no-store').json(getAgentStatuses()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/projects',               (req, res) => { try { res.json(getProjects(req.query.agent)); }                     catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/sessions/:projectId',    (req, res) => { try { res.json(getSessions(req.params.projectId, req.query.agent)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/session/:sessionId',     (req, res) => { try { res.json(readSession(req.params.sessionId, req.query.agent)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/active-sessions',        (req, res) => res.json(listSessions()));
app.get('/api/session-log/:sessionId', (req, res) => {
  const log = readLog(req.params.sessionId);
  if (log === null) return res.status(404).json({ error: 'Not found' });
  res.type('text/plain').send(log);
});

function routeResult(res, fn) {
  Promise.resolve()
    .then(fn)
    .then(result => res.set('Cache-Control', 'no-store').json(result))
    .catch(err => res.set('Cache-Control', 'no-store').status(err.status || 500).json({ error: err.message || 'Internal server error' }));
}

// ── HTTP terminal fallback（直接运行 index.js 时也支持）────────────────────────
app.post('/api/terminal/start', (req, res) => {
  routeResult(res, () => startSessionHttp(req.body || {}));
});
app.post('/api/terminal/:sessionId/attach', (req, res) => {
  routeResult(res, () => attachSessionHttp(req.params.sessionId, req.body || {}));
});
app.post('/api/terminal/:sessionId/input', (req, res) => {
  routeResult(res, () => inputSessionHttp(req.params.sessionId, req.body || {}));
});
app.post('/api/terminal/:sessionId/resize', (req, res) => {
  routeResult(res, () => resizeSessionHttp(req.params.sessionId, req.body || {}));
});
app.post('/api/terminal/:sessionId/kill', (req, res) => {
  routeResult(res, () => killSessionHttp(req.params.sessionId));
});
app.post('/api/terminal/:sessionId/delete', (req, res) => {
  routeResult(res, () => deleteSessionHttp(req.params.sessionId));
});
app.post('/api/terminal/:sessionId/rename', (req, res) => {
  routeResult(res, () => renameSessionHttp(req.params.sessionId, req.body || {}));
});
app.get('/api/terminal/:sessionId/poll', (req, res) => {
  routeResult(res, () => pollSessionHttp(req.params.sessionId, {
    cursor: req.query.cursor,
    wait: req.query.wait,
  }));
});

app.post('/api/shell/start', (req, res) => {
  routeResult(res, () => startShellHttp(req.body || {}));
});
app.post('/api/shell/input', (req, res) => {
  routeResult(res, () => inputShellHttp(req.body || {}));
});
app.post('/api/shell/resize', (req, res) => {
  routeResult(res, () => resizeShellHttp(req.body || {}));
});
app.post('/api/shell/kill', (req, res) => {
  routeResult(res, killShellHttp);
});
app.get('/api/shell/poll', (req, res) => {
  routeResult(res, () => pollShellHttp({
    cursor: req.query.cursor,
    wait: req.query.wait,
  }));
});
app.post('/api/shell/:shellId/start', (req, res) => {
  routeResult(res, () => startShellHttp({ ...(req.body || {}), shellId: req.params.shellId }));
});
app.post('/api/shell/:shellId/input', (req, res) => {
  routeResult(res, () => inputShellHttp({ ...(req.body || {}), shellId: req.params.shellId }));
});
app.post('/api/shell/:shellId/resize', (req, res) => {
  routeResult(res, () => resizeShellHttp({ ...(req.body || {}), shellId: req.params.shellId }));
});
app.post('/api/shell/:shellId/kill', (req, res) => {
  routeResult(res, () => killShellHttp(req.params.shellId));
});
app.get('/api/shell/:shellId/poll', (req, res) => {
  routeResult(res, () => pollShellHttp({
    shellId: req.params.shellId,
    cursor: req.query.cursor,
    wait: req.query.wait,
  }));
});

app.post('/api/change-password', changePasswordHandler);
app.get('/api/settings', getSettingsHandler);
app.post('/api/settings', saveSettingsHandler);

// ── 文件系统 API ───────────────────────────────────────────────────────────────
app.get('/api/fs/list', (req, res) => {
  try {
    const result = listDir(req.query.path || '/', req.query.hidden === 'true');
    res.json(result);
  } catch (e) {
    res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
  }
});

app.get('/api/fs/read', (req, res) => {
  try {
    const maxBytes = parseInt(req.query.maxBytes) || 102400;
    const result = readFilePreview(req.query.path || '', maxBytes);
    res.json(result);
  } catch (e) {
    res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
  }
});

app.get('/api/fs/stat', (req, res) => {
  try {
    res.json(statFile(req.query.path || ''));
  } catch (e) {
    res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
  }
});

app.post('/api/fs/mkdir', (req, res) => {
  try {
    const body = req.body || {};
    res.json(createDirectory(body.path || req.query.path || '/', body.name || req.query.name || ''));
  } catch (e) {
    res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
  }
});

app.post('/api/fs/upload', (req, res) => {
  handleFsUploadRequest(req, res, req.query.path || '/', req.headers['x-filename-encoded'] || req.headers['x-filename'] || 'upload.bin');
});

app.get('/api/fs/download', (req, res) => {
  handleFsDownloadRequest(req, res, req.query.path || '');
});

// 未匹配的 /api/* 返回 404
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const p = path.join(distDir, 'index.html');
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).send('Frontend not built.');
});

// 兜底错误处理：Express 默认会把错误堆栈（含服务器绝对路径）以 HTML 返回给客户端
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('HTTP error:', err.message);
  if (res.headersSent) { try { res.end(); } catch (_) {} return; }
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : (err.expose && err.message) || 'Bad request' });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  // 只接受 origin-form；畸形目标（如 //[ ）直接丢弃（与 proxy.js 一致）
  if (!req.url.startsWith('/') || req.url.startsWith('//')) { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return; }
  if (!wsAuth(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (ws, req) => {
  const wsId = uuidv4();
  ws._rccToken = wsToken(req);
  ws._rccAlive = true;
  ws.on('pong', () => { ws._rccAlive = true; });
  registerWS(wsId, ws);
  // Send current session list immediately
  ws.send(JSON.stringify({ type: 'session_list', sessions: listSessions() }));
  ws.on('message', data => {
    try { handleMessage(ws, wsId, data.toString()); }
    catch (e) { console.error(`WS [${wsId}] message error:`, e.message); }
  });
  ws.on('close',   ()   => { closeWS(wsId); unregisterWS(wsId); });
  ws.on('error',   err  => { console.error(`WS [${wsId}]:`, err.message); closeWS(wsId); unregisterWS(wsId); });
});

// 改密码后断开持有旧 token 的 WS；心跳回收半开连接（与 proxy.js 一致）
onTokensInvalidated(() => {
  for (const ws of wss.clients) {
    if (!validateTokenExported(ws._rccToken)) ws.close(4001, 'Unauthorized');
  }
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws._rccAlive) { ws.terminate(); continue; }
    ws._rccAlive = false;
    try { ws.ping(); } catch (_) {}
  }
}, 30000).unref();

// 大文件上传/下载可能持续很久，不能套用默认的 5 分钟整请求超时
server.requestTimeout = 0;

// 与 proxy.js 一致：端口被占用时给出明确提示，而不是抛未捕获异常
server.on('error', err => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use. Stop the process using it or change PORT.`);
  } else {
    console.error('server error:', err && err.message ? err.message : err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  // 监听成功后才写 local.token（remotecc / rcc-tui 靠它鉴权；失败的进程不能覆盖已生效的 token）
  writeLocalToken();
  console.log(`RemoteCC  http://0.0.0.0:${PORT}`);
  console.log(`Auth: RC_USER=${process.env.RC_USER || 'admin'}`);
});
