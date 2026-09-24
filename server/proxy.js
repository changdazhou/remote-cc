/**
 * proxy.js — 长期常驻进程
 *
 * 职责：
 *   - 对外暴露 HTTP + WS 服务（端口 8310）
 *   - Auth 校验（token 在此进程中管理）
 *   - WS + PTY 会话管理（pty-manager 在此进程）
 *   - /api/active-sessions、/api/session-log 直接在此响应
 *   - 其余 HTTP 请求通过 Unix socket 转发给 app.js
 *   - 监听 SIGUSR2 热重载：重启 app.js，WS/PTY 不中断
 */

'use strict';

const http        = require('http');
const net         = require('net');
const { WebSocketServer } = require('ws');
const { fork }    = require('child_process');
const path        = require('path');
const fs          = require('fs');
const os          = require('os');
const { v4: uuidv4 } = require('uuid');
const {
  wsAuth,
  validateTokenExported,
  createTokenExported,
  validateCredentials,
  changePassword,
  LOCAL_TOKEN_FILE,
  writeLocalToken,
} = require('./auth');
const {
  handleMessage, closeWS, listSessions, readLog,
  registerWS, unregisterWS,
  startSessionHttp, attachSessionHttp, inputSessionHttp, resizeSessionHttp, pollSessionHttp,
  killSessionHttp, deleteSessionHttp, renameSessionHttp,
  startShellHttp, inputShellHttp, resizeShellHttp, pollShellHttp, killShellHttp,
} = require('./pty-manager');
const { handleFsUploadRequest, handleAttachmentUploadRequest, handleFsDownloadRequest } = require('./fs-handler');

const PORT = Math.max(1, Math.min(65535, parseInt(process.env.PORT) || 8310));
const APP_SOCK   = '/tmp/rcc-app.sock';
const APP_SCRIPT = path.join(__dirname, 'app.js');
const UPLOAD_DIR = path.join(os.homedir(), '.rcc', 'uploads');

// ── 单实例锁 ──────────────────────────────────────────────────────────────────
const RCC_DIR   = path.join(os.homedir(), '.rcc');
const LOCK_FILE = path.join(RCC_DIR, 'server.lock');
fs.mkdirSync(RCC_DIR, { recursive: true });

try {
  const existing = fs.existsSync(LOCK_FILE)
    ? JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
    : null;
  if (existing) {
    let alive = false;
    try { process.kill(existing.pid, 0); alive = true; } catch (_) {}
    if (alive) {
      console.error(
        `\n  ✗ RemoteCC 已在运行 (pid ${existing.pid}, port ${existing.port})\n` +
        `    如需重启，先运行: kill ${existing.pid}\n`
      );
      process.exit(1);
    }
    try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  }
} catch (_) {}

fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, port: PORT, startedAt: Date.now() }));

function removeLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

// ── app.js 子进程管理 ─────────────────────────────────────────────────────────

/** @type {import('child_process').ChildProcess | null} */
let appProcess = null;

function spawnApp() {
  try { fs.unlinkSync(APP_SOCK); } catch (_) {}

  const child = fork(APP_SCRIPT, [], {
    env: { ...process.env },
    silent: false,
  });
  child.on('exit', code => console.log(`[proxy] app.js exited (code ${code})`));
  child.on('error', err => console.error('[proxy] app.js error:', err.message));
  return child;
}

let reloadTimer = null;

function hotReload() {
  // debounce：防止 SIGUSR2 连续触发导致多个 app.js 同时启动
  if (reloadTimer) {
    clearTimeout(reloadTimer);
    reloadTimer = null;
  }
  console.log('[proxy] hot reload: restarting app.js...');
  if (appProcess) {
    try { appProcess.kill('SIGTERM'); } catch (_) {}
    appProcess = null;
  }
  reloadTimer = setTimeout(() => {
    reloadTimer = null;
    appProcess = spawnApp();
    console.log('[proxy] app.js restarted (pid', appProcess.pid, ')');
  }, 500);
}

process.on('SIGUSR2', hotReload);

// ── HTTP 请求处理 ─────────────────────────────────────────────────────────────

// proxy 直接处理的端点（依赖 pty-manager 内存状态）

function isSessionLogPath(url) {
  return url.startsWith('/api/session-log/');
}

function replyResult(res, fn) {
  Promise.resolve()
    .then(fn)
    .then(result => jsonReply(res, 200, result))
    .catch(err => jsonReply(res, err.status || 500, { error: err.message || 'Internal server error' }));
}

function withJsonBody(req, res, fn) {
  readJsonBody(req, body => replyResult(res, () => fn(body)));
}

function terminalHttpRoute(req, res, urlPath, query) {
  if (req.method === 'POST' && urlPath === '/api/terminal/start') {
    withJsonBody(req, res, body => startSessionHttp(body));
    return true;
  }

  const match = urlPath.match(/^\/api\/terminal\/([^/]+)\/(attach|input|resize|poll|kill|delete|rename)$/);
  if (!match) return false;

  let sessionId;
  try { sessionId = decodeURIComponent(match[1]); }
  catch (_) {
    jsonReply(res, 400, { error: 'Bad request' });
    return true;
  }
  const action = match[2];

  if (req.method === 'POST' && action === 'attach') {
    withJsonBody(req, res, body => attachSessionHttp(sessionId, body));
    return true;
  }
  if (req.method === 'POST' && action === 'input') {
    withJsonBody(req, res, body => inputSessionHttp(sessionId, body));
    return true;
  }
  if (req.method === 'POST' && action === 'resize') {
    withJsonBody(req, res, body => resizeSessionHttp(sessionId, body));
    return true;
  }
  if (req.method === 'GET' && action === 'poll') {
    replyResult(res, () => pollSessionHttp(sessionId, {
      cursor: query.searchParams.get('cursor'),
      wait: query.searchParams.get('wait'),
    }));
    return true;
  }
  if (req.method === 'POST' && action === 'kill') {
    replyResult(res, () => killSessionHttp(sessionId));
    return true;
  }
  if (req.method === 'POST' && action === 'delete') {
    replyResult(res, () => deleteSessionHttp(sessionId));
    return true;
  }
  if (req.method === 'POST' && action === 'rename') {
    withJsonBody(req, res, body => renameSessionHttp(sessionId, body));
    return true;
  }

  jsonReply(res, 405, { error: 'Method not allowed' });
  return true;
}

function shellHttpRoute(req, res, urlPath, query) {
  let shellId = '1';
  let action = '';

  const legacy = urlPath.match(/^\/api\/shell\/(start|input|resize|poll|kill)$/);
  const named = urlPath.match(/^\/api\/shell\/([^/]+)\/(start|input|resize|poll|kill)$/);
  if (legacy) {
    action = legacy[1];
  } else if (named) {
    try { shellId = decodeURIComponent(named[1]); }
    catch (_) {
      jsonReply(res, 400, { error: 'Bad request' });
      return true;
    }
    action = named[2];
  } else {
    return false;
  }

  if (req.method === 'POST' && action === 'start') {
    withJsonBody(req, res, body => startShellHttp({ ...(body || {}), shellId }));
    return true;
  }
  if (req.method === 'POST' && action === 'input') {
    withJsonBody(req, res, body => inputShellHttp({ ...(body || {}), shellId }));
    return true;
  }
  if (req.method === 'POST' && action === 'resize') {
    withJsonBody(req, res, body => resizeShellHttp({ ...(body || {}), shellId }));
    return true;
  }
  if (req.method === 'POST' && action === 'kill') {
    replyResult(res, () => killShellHttp(shellId));
    return true;
  }
  if (req.method === 'GET' && action === 'poll') {
    replyResult(res, () => pollShellHttp({
      shellId,
      cursor: query.searchParams.get('cursor'),
      wait: query.searchParams.get('wait'),
    }));
    return true;
  }
  jsonReply(res, 405, { error: 'Method not allowed' });
  return true;
}

function uploadFilenameHeader(req, fallback) {
  return req.headers['x-filename-encoded'] || req.headers['x-filename'] || fallback;
}

// 文件上传/下载在 proxy 内流式处理，不经过 app.js 的 JSON IPC（大文件会占满内存并超时）
function transferRoute(req, res, urlPath, query) {
  if (req.method === 'POST' && urlPath === '/api/fs/upload') {
    handleFsUploadRequest(req, res, query.searchParams.get('path') || '/', uploadFilenameHeader(req, 'upload.bin'));
    return true;
  }
  if (req.method === 'POST' && urlPath === '/api/upload') {
    handleAttachmentUploadRequest(req, res, UPLOAD_DIR, uploadFilenameHeader(req, 'image.png'));
    return true;
  }
  if (req.method === 'GET' && urlPath === '/api/fs/download') {
    handleFsDownloadRequest(req, res, query.searchParams.get('path') || '');
    return true;
  }
  return false;
}

function handleProxyDirect(req, res) {
  const url = req.url.split('?')[0];
  const parsedUrl = new URL(req.url, 'http://localhost');

  if (transferRoute(req, res, url, parsedUrl)) return true;
  if (terminalHttpRoute(req, res, url, parsedUrl)) return true;
  if (shellHttpRoute(req, res, url, parsedUrl)) return true;

  if (url === '/api/active-sessions') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(listSessions()));
    return true;
  }

  if (isSessionLogPath(url)) {
    let sessionId;
    try { sessionId = decodeURIComponent(url.slice('/api/session-log/'.length)); }
    catch (_) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request' }));
      return true;
    }
    const log = readLog(sessionId);
    if (log === null) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } else {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(log);
    }
    return true;
  }

  return false;
}

// ── Unix socket 转发 ──────────────────────────────────────────────────────────

function proxyToApp(req, res) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const bodyBuf = Buffer.concat(chunks);
    const reqId   = uuidv4();

    const reqObj = {
      id:      reqId,
      method:  req.method,
      url:     req.url,
      headers: req.headers,
      body:    bodyBuf.length ? bodyBuf.toString('base64') : null,
    };
    const reqJson = Buffer.from(JSON.stringify(reqObj), 'utf8');
    const lenBuf  = Buffer.allocUnsafe(4);
    lenBuf.writeUInt32BE(reqJson.length, 0);
    const frame   = Buffer.concat([lenBuf, reqJson]);

    let retries  = 0;
    let handled  = false;  // 防止 timeout 和 error 双触发
    const MAX_RETRIES = 8;

    function tryConnect() {
      const sock = net.createConnection(APP_SOCK);
      sock.setTimeout(10000);

      sock.on('connect', () => { sock.write(frame); });

      let recvBuf     = Buffer.alloc(0);
      let expectedLen = -1;

      sock.on('data', chunk => {
        recvBuf = Buffer.concat([recvBuf, chunk]);
        while (true) {
          if (expectedLen === -1) {
            if (recvBuf.length < 4) break;
            expectedLen = recvBuf.readUInt32BE(0);
            recvBuf = recvBuf.slice(4);
          }
          if (recvBuf.length < expectedLen) break;

          const jsonChunk = recvBuf.slice(0, expectedLen);
          recvBuf     = recvBuf.slice(expectedLen);
          expectedLen = -1;

          let resp;
          try { resp = JSON.parse(jsonChunk.toString('utf8')); } catch (_) {
            if (!handled) { handled = true; res.writeHead(502); res.end('Bad gateway'); }
            sock.destroy();
            return;
          }

          if (!handled) {
            handled = true;
            const hdrs = resp.headers || {};
            res.writeHead(resp.status || 200, hdrs);
            if (resp.body) res.end(Buffer.from(resp.body, 'base64'));
            else           res.end();
          }
          sock.destroy();
          return;
        }
      });

      sock.on('timeout', () => {
        sock.destroy();
        if (!handled) {
          handled = true;
          res.writeHead(504); res.end('Gateway timeout');
        }
      });

      sock.on('error', () => {
        if (handled) return;
        retries++;
        if (retries <= MAX_RETRIES) {
          setTimeout(tryConnect, 500);
        } else {
          handled = true;
          res.writeHead(503); res.end('Service unavailable (app not ready)');
        }
      });
    }

    tryConnect();
  });
  req.on('error', () => {
    try { res.writeHead(500); res.end(); } catch (_) {}
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function jsonReply(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > 64 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {}
    cb(body);
  });
  req.on('error', () => cb({}));
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // ── POST /api/login：在 proxy 侧处理，token 登记到 proxy 的 auth 实例 ──────
  if (req.method === 'POST' && urlPath === '/api/login') {
    readJsonBody(req, body => {
      const { username, password } = body;
      if (validateCredentials(username, password)) {
        jsonReply(res, 200, { token: createTokenExported() });
      } else {
        jsonReply(res, 401, { error: 'Invalid credentials' });
      }
    });
    return;
  }

  // ── 静态资源 / SPA / docs：无需 auth，直接转发 ──────────────────────────────
  if (!urlPath.startsWith('/api/')) {
    return proxyToApp(req, res);
  }

  // ── /api/* Auth 校验 ───────────────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const tok = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : new URL(req.url, 'http://localhost').searchParams.get('token') || '';

  if (!validateTokenExported(tok)) {
    jsonReply(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/change-password') {
    readJsonBody(req, body => {
      try {
        changePassword(body.currentPassword, body.newPassword);
        jsonReply(res, 200, { ok: true });
      } catch (e) {
        jsonReply(res, e.status || 400, { error: e.message || 'Bad request' });
      }
    });
    return;
  }

  // ── proxy 直接处理的端点（依赖 pty-manager 内存状态）─────────────────────
  if (handleProxyDirect(req, res)) return;

  // ── 其余转发给 app.js ──────────────────────────────────────────────────────
  proxyToApp(req, res);
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!wsAuth(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const wsId = uuidv4();
  registerWS(wsId, ws);
  ws.send(JSON.stringify({ type: 'session_list', sessions: listSessions() }));
  ws.on('message', data => handleMessage(ws, wsId, data.toString()));
  ws.on('close',   ()   => { closeWS(wsId); unregisterWS(wsId); });
  ws.on('error',   err  => {
    console.error(`WS [${wsId}]:`, err.message);
    closeWS(wsId); unregisterWS(wsId);
  });
});

// ── 启动 ──────────────────────────────────────────────────────────────────────

appProcess = spawnApp();

// local.token 守护：每 5s 检查文件是否存在，被外部删除时自动重写
// 确保 rcc-tui 等本地工具始终能读取到有效 token
setInterval(() => {
  try { require('fs').accessSync(LOCAL_TOKEN_FILE); }
  catch (_) { writeLocalToken(); }
}, 5000).unref();

server.on('error', err => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`[proxy] port ${PORT} is already in use. Stop the process using it or change PORT.`);
  } else {
    console.error('[proxy] server error:', err && err.message ? err.message : err);
  }
  shutdown(1);
});

// 大文件上传/下载可能持续很久，不能套用默认的 5 分钟整请求超时
server.requestTimeout = 0;

server.listen(PORT, () => {
  // 确认端口监听成功后才写入 local.token，避免 watchdog 重试的失败进程覆盖 token
  writeLocalToken();
  console.log(`RemoteCC  http://0.0.0.0:${PORT}  [proxy]`);
  console.log(`Auth: RC_USER=${process.env.RC_USER || 'admin'}`);
});

// ── 退出清理 ──────────────────────────────────────────────────────────────────

function shutdown(code = 0) {
  removeLock();
  try { if (appProcess) appProcess.kill('SIGTERM'); } catch (_) {}
  process.exit(code);
}

// exit 事件一定执行（包括 pty-manager 的 SIGTERM handler 调用 process.exit 的情况）
// 确保 app.js 子进程不泄漏、锁文件被清理
process.on('exit', () => {
  removeLock();
  try { if (appProcess) appProcess.kill('SIGTERM'); } catch (_) {}
});

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
