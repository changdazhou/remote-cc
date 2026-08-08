/**
 * app.js — 可热重启的 REST API 服务
 *
 * 通过 Unix socket /tmp/rcc-app.sock 接收来自 proxy.js 的 HTTP 请求。
 * 协议：length-prefixed JSON（4 字节大端 uint32 + JSON body）
 *
 * 安全模型：
 *   Unix socket 权限 0600，仅 proxy.js（同用户）可连接。
 *   auth（token 校验）由 proxy.js 在转发前完成，app.js 直接信任转发来的请求。
 */

'use strict';

const express = require('express');
const net     = require('net');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { v4: uuidv4 } = require('uuid');
const { getProjects, getSessions, readSession } = require('./history');
const { listDir, readFilePreview, statFile, createDirectory, writeUploadedFile, readDownloadFile, decodeUploadFilename } = require('./fs-handler');
const { getSettingsHandler, saveSettingsHandler } = require('./web-settings');
const { getAgentStatuses } = require('./agent-config');

const APP_SOCK = '/tmp/rcc-app.sock';
const RCC_DIR  = path.join(os.homedir(), '.rcc');

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// Static files
const distDir = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(distDir));

app.use(express.json());

// Docs (no auth — proxy 已在转发前放行)
const DOCS_DIR     = path.join(__dirname, '..', 'docs');
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

// Upload（auth 由 proxy 已校验，app.js 只处理业务逻辑）
const UPLOAD_DIR = path.join(RCC_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.post('/api/upload', (req, res) => {
  const uploadName = decodeUploadFilename(req.headers['x-filename-encoded'] || req.headers['x-filename'] || 'image.png', 'image.png');
  const ext = uploadName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .match(/\.[a-zA-Z0-9]+$/)?.[0] || '.png';
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try {
      fs.writeFileSync(filepath, Buffer.concat(chunks));
      res.json({ path: filepath, filename });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  req.on('error', e => res.status(500).json({ error: e.message }));
});

app.get('/api/agents',              (req, res) => { try { res.set('Cache-Control', 'no-store').json(getAgentStatuses()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/projects',            (req, res) => { try { res.json(getProjects(req.query.agent)); }                      catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/sessions/:projectId', (req, res) => { try { res.json(getSessions(req.params.projectId, req.query.agent)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/session/:sessionId',  (req, res) => { try { res.json(readSession(req.params.sessionId, req.query.agent)); } catch (e) { res.status(500).json({ error: e.message }); } });

// /api/active-sessions 和 /api/session-log 由 proxy 直接处理（pty-manager 在 proxy 进程）
// app.js 不处理这两个端点；proxy.js 会在转发前拦截它们

app.get('/api/settings', getSettingsHandler);
app.post('/api/settings', saveSettingsHandler);

// File system API
app.get('/api/fs/list', (req, res) => {
  try {
    res.json(listDir(req.query.path || '/', req.query.hidden === 'true'));
  } catch (e) {
    res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
  }
});
app.get('/api/fs/read', (req, res) => {
  try {
    res.json(readFilePreview(req.query.path || '', parseInt(req.query.maxBytes) || 102400));
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
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try {
      const result = writeUploadedFile(
        req.query.path || '/',
        req.headers['x-filename-encoded'] || req.headers['x-filename'] || 'upload.bin',
        Buffer.concat(chunks)
      );
      res.json(result);
    } catch (e) {
      res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
    }
  });
  req.on('error', e => res.status(500).json({ error: e.message }));
});

app.get('/api/fs/download', (req, res) => {
  try {
    const file = readDownloadFile(req.query.path || '');
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('content-length', file.size);
    res.setHeader('content-disposition', `attachment; filename="${file.name.replace(/"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.end(file.content);
  } catch (e) {
    res.status(e.message.startsWith('Access denied') ? 403 : 400).json({ error: e.message });
  }
});

// 未匹配的 /api/* 返回 404（不能让 SPA fallback 拦截 API 请求）
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// SPA fallback（只对非 API 路径）
app.get('*', (req, res) => {
  const p = path.join(distDir, 'index.html');
  fs.existsSync(p) ? res.sendFile(p) : res.status(404).send('Frontend not built.');
});

// ── Unix socket IPC 服务器 ────────────────────────────────────────────────────

try { fs.unlinkSync(APP_SOCK); } catch (_) {}

const sockServer = net.createServer(socket => {
  let recvBuf    = Buffer.alloc(0);
  let expectedLen = -1;

  socket.on('data', chunk => {
    recvBuf = Buffer.concat([recvBuf, chunk]);
    processMessages();
  });
  socket.on('error', () => {});
  socket.on('close', () => {});

  function processMessages() {
    while (true) {
      if (expectedLen === -1) {
        if (recvBuf.length < 4) break;
        expectedLen = recvBuf.readUInt32BE(0);
        recvBuf = recvBuf.slice(4);
      }
      if (recvBuf.length < expectedLen) break;

      const jsonChunk  = recvBuf.slice(0, expectedLen);
      recvBuf          = recvBuf.slice(expectedLen);
      expectedLen      = -1;

      let reqObj;
      try { reqObj = JSON.parse(jsonChunk.toString('utf8')); } catch (_) { continue; }
      handleIPCRequest(reqObj, socket);
    }
  }
});

// ── Mock req/res → Express ────────────────────────────────────────────────────

function handleIPCRequest(reqObj, socket) {
  const { id, method, url, headers, body } = reqObj;
  const bodyBuf = body ? Buffer.from(body, 'base64') : Buffer.alloc(0);

  // 构造最小 IncomingMessage-compatible 对象
  const { Readable } = require('stream');
  const mockReq = new Readable({ read() {} });
  Object.assign(mockReq, {
    method:      method || 'GET',
    url:         url    || '/',
    headers:     headers || {},
    socket:      { remoteAddress: '127.0.0.1', remotePort: 0, encrypted: false },
    connection:  { remoteAddress: '127.0.0.1' },
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    trailers: {}, rawTrailers: [], rawHeaders: [],
    complete: true,
  });
  if (bodyBuf.length) mockReq.push(bodyBuf);
  mockReq.push(null);

  // 收集响应
  const respHeaders = {};
  let   statusCode  = 200;
  const bodyChunks  = [];
  let   ended       = false;

  const mockRes = {
    statusCode:  200,
    headersSent: false,
    locals: {},
    finished: false,
    app,
    req: mockReq,

    // EventEmitter stubs — 供 stream.pipe / send 模块 / onFinished 调用
    on(ev, cb)             { return mockRes; },
    once(ev, cb)           { return mockRes; },
    emit(ev, ...args)      { return false; },
    removeListener(ev, cb) { return mockRes; },
    removeAllListeners(ev) { return mockRes; },

    writeHead(code, hdrs) {
      statusCode = code;
      mockRes.statusCode = code;
      if (hdrs) Object.assign(respHeaders, hdrs);
    },
    setHeader(k, v)  { respHeaders[k.toLowerCase()] = v; },
    getHeader(k)     { return respHeaders[k.toLowerCase()]; },
    removeHeader(k)  { delete respHeaders[k.toLowerCase()]; },
    getHeaders()     { return respHeaders; },
    hasHeader(k)     { return k.toLowerCase() in respHeaders; },

    status(code) {
      statusCode = code;
      mockRes.statusCode = code;
      return mockRes;
    },
    type(t) {
      const mime = t.includes('/')
        ? t
        : (require('mime-types').lookup(t) || 'application/octet-stream');
      mockRes.setHeader('content-type', mime);
      return mockRes;
    },
    json(obj) {
      mockRes.setHeader('content-type', 'application/json; charset=utf-8');
      mockRes.end(JSON.stringify(obj));
    },
    send(data) {
      if (ended) return mockRes;
      if (data == null) { mockRes.end(); return mockRes; }
      if (typeof data === 'object' && !Buffer.isBuffer(data)) {
        mockRes.json(data);
      } else {
        mockRes.end(data);
      }
      return mockRes;
    },
    sendFile(filePath) {
      fs.readFile(filePath, (err, data) => {
        if (err) { mockRes.status(500).end('File read error'); return; }
        const ext  = path.extname(filePath).toLowerCase();
        const mime = {
          '.html': 'text/html; charset=utf-8',
          '.js':   'application/javascript',
          '.css':  'text/css',
          '.json': 'application/json',
          '.png':  'image/png',
          '.jpg':  'image/jpeg',
          '.svg':  'image/svg+xml',
          '.ico':  'image/x-icon',
          '.woff2':'font/woff2',
          '.woff': 'font/woff',
          '.ttf':  'font/ttf',
        }[ext] || 'application/octet-stream';
        mockRes.setHeader('content-type', mime);
        mockRes.end(data);
      });
    },
    redirect(code, url) {
      if (typeof code === 'string') { url = code; code = 302; }
      statusCode = code;
      mockRes.statusCode = code;
      respHeaders['location'] = url;
      mockRes.end('');
    },
    end(data) {
      if (ended) return mockRes;
      ended = true;
      mockRes.finished = true;
      if (data !== undefined && data !== null) {
        if (Buffer.isBuffer(data)) bodyChunks.push(data);
        else bodyChunks.push(Buffer.from(String(data)));
      }
      // 使用 mockRes.statusCode：Express 可能直接赋值 res.statusCode（如 304）
      // 而不经过 writeHead/status 方法，闭包变量 statusCode 不会被更新
      sendIPCResponse(id, mockRes.statusCode, respHeaders, Buffer.concat(bodyChunks), socket);
      return mockRes;
    },
    write(data) {
      if (ended) return false;
      if (Buffer.isBuffer(data)) bodyChunks.push(data);
      else bodyChunks.push(Buffer.from(String(data)));
      return true;
    },
  };

  try {
    app(mockReq, mockRes, (err) => {
      if (err) mockRes.status(500).end('Internal error: ' + err.message);
      else     mockRes.status(404).end('Not found');
    });
  } catch (e) {
    if (!ended) sendIPCResponse(id, 500, {}, Buffer.from('Server error: ' + e.message), socket);
  }
}

function sendIPCResponse(id, status, headers, bodyBuf, socket) {
  const resp    = { id, status, headers, body: bodyBuf.length ? bodyBuf.toString('base64') : null };
  const json    = Buffer.from(JSON.stringify(resp), 'utf8');
  const lenBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(json.length, 0);
  try {
    if (!socket.destroyed) socket.write(Buffer.concat([lenBuf, json]));
  } catch (_) {}
}

sockServer.listen(APP_SOCK, () => {
  try { fs.chmodSync(APP_SOCK, 0o600); } catch (_) {}
  console.log(`[app] listening on ${APP_SOCK}`);
});
sockServer.on('error', err => {
  console.error('[app] socket error:', err.message);
  // EADDRINUSE 说明另一个 app.js 实例正在运行（热重载竞态）
  // 退出让 proxy 检测到并决定是否重新 spawn
  if (err.code === 'EADDRINUSE') process.exit(1);
});

// ── 优雅退出（不杀 PTY，PTY 在 proxy 进程中）────────────────────────────────

process.on('SIGTERM', () => {
  try { sockServer.close(); } catch (_) {}
  process.exit(0);
});
process.on('SIGINT', () => {
  try { sockServer.close(); } catch (_) {}
  process.exit(0);
});
