const pty = require('node-pty');
const net = require('net');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { normalizeAgent, findAgentBin, getAgentConfig, buildAgentEnv, withoutHostSessionEnv, parseExtraArgs } = require('./agent-config');

const IS_WIN = process.platform === 'win32';
const MAX_SESSIONS = 20;
const SCROLLBACK_LIMIT = 500 * 1024; // 500KB
const HTTP_POLL_DEFAULT_WAIT = 5000;
const HTTP_POLL_MAX_WAIT = 8000;
const MAX_HTTP_INPUT_BYTES = 64 * 1024;

const RCC_DIR    = path.join(os.homedir(), '.rcc');
const LOG_DIR    = path.join(RCC_DIR, 'logs');
const SOCK_DIR   = IS_WIN ? '\\\\.\\pipe\\rcc' : path.join(RCC_DIR, 'sockets');
const META_FILE  = path.join(RCC_DIR, 'sessions.json');

if (!IS_WIN) {
  for (const d of [LOG_DIR, path.join(RCC_DIR, 'sockets')]) fs.mkdirSync(d, { recursive: true });
} else {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 启动时清除所有旧 log 和 socket 文件（Unix only，Windows pipe 自动清理）
try {
  for (const f of fs.readdirSync(LOG_DIR)) fs.unlinkSync(path.join(LOG_DIR, f));
  if (!IS_WIN) {
    const sockDir = path.join(RCC_DIR, 'sockets');
    for (const f of fs.readdirSync(sockDir)) fs.unlinkSync(path.join(sockDir, f));
  }
} catch (_) {}

// 获取 socket/pipe 路径
function getSocketPath(sessionId) {
  if (IS_WIN) return `\\\\.\\pipe\\rcc-${sessionId}`;
  return path.join(RCC_DIR, 'sockets', `${sessionId}.sock`);
}

function expandHome(input) {
  if (!input || input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) return path.join(os.homedir(), input.slice(2));
  return input;
}

/**
 * sessions: Map<sessionId, {
 *   name, workingDir,
 *   ptyProcess | null,
 *   clients: Set<Client>,   // 所有订阅者（WS 或 Unix socket）
 *   buffer,                 // in-memory scrollback
 *   bufferBase,             // absolute cursor offset for trimmed buffer
 *   logPath, logStream,
 *   socketPath, socketServer,
 *   exitCode | null,
 *   createdAt, lastActiveAt,
 * }>
 *
 * Client interface: { send(data: string), sendJSON(obj), close(), type: 'ws'|'unix' }
 */
const sessions = new Map();
const wsToSession = new Map(); // wsId → { sessionId, client }
const allWS = new Map();       // wsId → ws  (所有已连接的 WS，无论是否 attach 了 session)
const wsToShellClient = new Map(); // wsId → { shellId, client }
const shellSessions = new Map();   // shellId → shared shell PTY

function apiError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ── Client wrappers ───────────────────────────────────────────────────────────

function wsClient(ws) {
  return {
    type: 'ws',
    id: uuidv4(),
    cols: 80, rows: 24,   // 该客户端上报的终端尺寸
    send(data)    { try { if (ws.readyState === 1) ws.send(data); } catch (_) {} },
    sendJSON(obj) { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (_) {} },
    close()       { try { ws.close(); } catch (_) {} },
    _ws: ws,
  };
}

function unixClient(socket) {
  return {
    type: 'unix',
    id: uuidv4(),
    cols: 80, rows: 24,   // 该客户端上报的终端尺寸（通过 OOB RESIZE 帧更新）
    send(data)    { try { if (!socket.destroyed) socket.write(data); } catch (_) {} },
    sendJSON(_)   {},
    close()       { try { socket.destroy(); } catch (_) {} },
    _socket: socket,
  };
}

// ── Broadcast helpers ─────────────────────────────────────────────────────────

function broadcastData(session, data) {
  for (const c of session.clients) c.send(data);
}

function broadcastJSON(session, obj) {
  for (const c of session.clients) c.sendJSON(obj);
}

function broadcastSessionList() {
  const list = JSON.stringify({ type: 'session_list', sessions: getSessionList() });
  // Send to ALL connected WS clients (not just those attached to a session)
  for (const [, ws] of allWS) {
    try { if (ws.readyState === 1) ws.send(list); } catch (_) {}
  }
}

function registerWS(wsId, ws)   { allWS.set(wsId, ws); }
function unregisterWS(wsId)     { allWS.delete(wsId); }

function bufferCursor(holder) {
  return (holder.bufferBase || 0) + (holder.buffer ? holder.buffer.length : 0);
}

function trimBuffer(holder) {
  if (!holder || !holder.buffer || holder.buffer.length <= SCROLLBACK_LIMIT) return;
  const drop = holder.buffer.length - SCROLLBACK_LIMIT;
  holder.buffer = holder.buffer.slice(drop);
  holder.bufferBase = (holder.bufferBase || 0) + drop;
}

function readBufferSince(holder, cursor) {
  const base = holder.bufferBase || 0;
  const end = bufferCursor(holder);
  let requested = Number(cursor);
  if (!Number.isFinite(requested) || requested < 0) requested = base;
  let reset = false;
  if (requested < base) {
    requested = base;
    reset = true;
  }
  if (requested > end) requested = end;
  const output = (holder.buffer || '').slice(requested - base);
  return { output, cursor: end, reset };
}

function normalizePollWait(wait) {
  const value = Number(wait);
  if (!Number.isFinite(value) || value < 0) return HTTP_POLL_DEFAULT_WAIT;
  return Math.min(HTTP_POLL_MAX_WAIT, Math.floor(value));
}

function waitersFor(holder) {
  if (!holder.httpWaiters) holder.httpWaiters = new Set();
  return holder.httpWaiters;
}

function notifyHttpWaiters(holder) {
  if (!holder?.httpWaiters) return;
  const waiters = [...holder.httpWaiters];
  holder.httpWaiters.clear();
  for (const wake of waiters) {
    try { wake(); } catch (_) {}
  }
}

function pollBuffer(holder, cursor, wait, meta) {
  const initial = readBufferSince(holder, cursor);
  if (initial.output || !meta().alive) return Promise.resolve({ ...meta(), ...initial });

  const waitMs = normalizePollWait(wait);
  if (waitMs <= 0) return Promise.resolve({ ...meta(), ...initial });

  return new Promise(resolve => {
    let settled = false;
    const waiters = waitersFor(holder);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      waiters.delete(finish);
      const next = readBufferSince(holder, cursor);
      resolve({ ...meta(), ...next });
    };
    const timer = setTimeout(finish, waitMs);
    waiters.add(finish);
  });
}

function normalizeSize(cols, rows) {
  const c = Math.max(2, Math.min(500, parseInt(cols, 10) || 80));
  const r = Math.max(1, Math.min(300, parseInt(rows, 10) || 24));
  return { cols: c, rows: r };
}

function normalizeInput(data) {
  if (typeof data !== 'string') throw apiError(400, 'data must be a string');
  if (Buffer.byteLength(data, 'utf8') > MAX_HTTP_INPUT_BYTES) throw apiError(413, 'input too large');
  return data;
}

// ── Meta persistence ──────────────────────────────────────────────────────────

function saveMeta() {
  const data = [];
  for (const [id, s] of sessions) {
    data.push({
      sessionId: id, name: s.name, workingDir: s.workingDir, agent: s.agent || 'claude',
      alive: s.exitCode === null && !!s.ptyProcess,
      exitCode: s.exitCode, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt,
      logPath: s.logPath, socketPath: s.socketPath,
    });
  }
  try { fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}

function restoreDeadSessions() {
  // 每次启动清除所有历史 session（不恢复）
  try { fs.writeFileSync(META_FILE, '[]'); } catch (_) {}
}
restoreDeadSessions();

// ── Unix socket server per session ────────────────────────────────────────────

function startSocketServer(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const sockPath = getSocketPath(sessionId);
  if (!IS_WIN) { try { fs.unlinkSync(sockPath); } catch (_) {} }

  const server = net.createServer(socket => {
    // Send scrollback on connect
    if (session.buffer) socket.write(session.buffer);

    const client = unixClient(socket);
    session.clients.add(client);

    let inBuf = '';
    socket.on('data', buf => {
      inBuf += buf.toString('binary');
      // Parse out-of-band resize frames: \x00RESIZE:<cols>:<rows>\n
      let processed;
      do {
        processed = false;
        const nullIdx = inBuf.indexOf('\x00');
        if (nullIdx !== -1) {
          // pass everything before \x00 as PTY input
          if (nullIdx > 0 && session.ptyProcess) {
            session.ptyProcess.write(Buffer.from(inBuf.slice(0, nullIdx), 'binary').toString());
          }
          const rest = inBuf.slice(nullIdx + 1);
          const nlIdx = rest.indexOf('\n');
          if (nlIdx !== -1) {
            const frame = rest.slice(0, nlIdx);
            inBuf = rest.slice(nlIdx + 1);
            if (frame.startsWith('RESIZE:')) {
              const parts = frame.slice(7).split(':');
              const cols = parseInt(parts[0], 10);
              const rows = parseInt(parts[1], 10);
              if (cols > 0 && rows > 0) {
                // 更新该 unix client 记录的尺寸
                client.cols = cols;
                client.rows = rows;
                if (session.ptyProcess) {
                  try { session.ptyProcess.resize(cols, rows); } catch (_) {}
                }
              }
            }
            processed = true;
          } else {
            // incomplete frame, wait for more data
            inBuf = '\x00' + rest;
          }
        } else {
          if (inBuf && session.ptyProcess) {
            // 输入时 resize 到该 unix client 的尺寸
            try { session.ptyProcess.resize(client.cols || 80, client.rows || 24); } catch (_) {}
            session.ptyProcess.write(Buffer.from(inBuf, 'binary').toString());
            session.lastActiveAt = Date.now();
          }
          inBuf = '';
        }
      } while (processed && inBuf.length > 0);
    });

    socket.on('close', () => session.clients.delete(client));
    socket.on('error', () => session.clients.delete(client));
  });

  server.listen(sockPath, () => {
    if (!IS_WIN) { try { fs.chmodSync(sockPath, 0o600); } catch (_) {} }
  });
  server.on('error', err => console.error(`Socket server [${sessionId}]:`, err.message));

  session.socketPath  = sockPath;
  session.socketServer = server;
  saveMeta();
}

// ── Create session ────────────────────────────────────────────────────────────

function createSession(ws, wsId, { workingDir, resumeSessionId, name, agent, extraArgs, requestId, cols = 80, rows = 24, env: clientEnv = {} }) {
  // 防重复：同一个 wsId 已有 session，直接复用
  if (wsToSession.has(wsId)) {
    const existing = wsToSession.get(wsId);
    const existingSession = sessions.get(existing.sessionId);
    if (existingSession && existingSession.exitCode === null && existingSession.ptyProcess) {
      try { ws.send(JSON.stringify({ type: 'session_id', sessionId: existing.sessionId, name: existingSession.name })); } catch (_) {}
      return;
    }
    wsToSession.delete(wsId);
  }

  const rawDir = typeof workingDir === 'string' ? workingDir.trim() : '';
  const cwd = rawDir ? path.resolve(expandHome(rawDir))
    : (IS_WIN ? process.env.USERPROFILE || 'C:\\' : process.env.HOME || '/tmp');
  const agentId = normalizeAgent(agent);
  const agentCfg = getAgentConfig(agentId);
  const startRequestId = typeof requestId === 'string' ? requestId.slice(0, 128) : '';
  const resumeId = typeof resumeSessionId === 'string' ? resumeSessionId.trim() : '';

  // 防重复：同一次启动请求（客户端重连/HTTP 重试会复用 requestId），
  // 或同 agent + cwd 恢复同一个历史会话 → 直接 attach 已有 session
  for (const [existingId, s] of sessions) {
    if (s.exitCode !== null || !s.ptyProcess) continue;
    const sameRequest = startRequestId && s.requestId === startRequestId;
    const sameResume = resumeId &&
      (s.agent || 'claude') === agentId &&
      s.workingDir === cwd &&
      s.resumeSessionId === resumeId;
    if (sameRequest || sameResume) {
      attachSession(ws, wsId, existingId);
      return;
    }
  }

  let cwdStat = null;
  try { cwdStat = fs.statSync(cwd); } catch (_) {}
  if (!cwdStat || !cwdStat.isDirectory()) {
    try { ws.send(JSON.stringify({ type: 'error', message: `Working directory not found: ${cwd}` })); } catch (_) {}
    return;
  }

  const alive = [...sessions.values()].filter(s => s.exitCode === null && s.ptyProcess).length;
  if (alive >= MAX_SESSIONS) {
    try { ws.send(JSON.stringify({ type: 'error', message: `Max sessions reached (${MAX_SESSIONS} alive). Kill or delete existing sessions first.` })); } catch (_) {}
    return;
  }
  // Default name: <basename(cwd)>
  const baseName    = path.basename(cwd) || 'root';
  const sessionName = (name && name.trim()) ? name.trim() : baseName;
  const sessionId   = uuidv4();
  const logPath     = path.join(LOG_DIR, `${sessionId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  // 防止 write-after-end 等 stream 错误未处理导致进程崩溃
  logStream.on('error', () => {});

  const userArgs = parseExtraArgs(extraArgs);
  const args = agentCfg.buildArgs({ cwd, resumeSessionId: resumeId, extraArgs: userArgs });
  const agentBin = findAgentBin(agentId);

  // Windows: node-pty 用 ConPTY，直接 spawn CLI
  // 需要设置 useConpty: true，且不传 TERM（Windows 不需要）
  const agentEnv = buildAgentEnv(agentId, process.env, clientEnv);
  const spawnOpts = IS_WIN
    ? {
        useConpty: true,
        cols, rows, cwd,
        env: { ...agentEnv, CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL: '1' },
      }
    : {
        name: 'xterm-256color', cols, rows, cwd,
        env: {
          ...agentEnv,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL: '1',
        },
      };

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(agentBin, args, spawnOpts);
  } catch (err) {
    try { ws.send(JSON.stringify({ type: 'error', message: `Failed to spawn ${agentCfg.label}: ${err.message}` })); } catch (_) {}
    logStream.end();
    return;
  }

  const client = wsClient(ws);
  const session = {
    name: sessionName, workingDir: cwd, agent: agentId,
    resumeSessionId: resumeId,
    requestId: startRequestId,
    extraArgs: userArgs,
    ptyProcess, clients: new Set([client]),
    buffer: '', bufferBase: 0, httpWaiters: new Set(), logPath, logStream,
    socketPath: null, socketServer: null,
    exitCode: null,
    createdAt: Date.now(), lastActiveAt: Date.now(),
  };
  sessions.set(sessionId, session);
  wsToSession.set(wsId, { sessionId, client });

  // Start Unix socket server
  startSocketServer(sessionId);

  client.sendJSON({ type: 'session_id', sessionId, name: sessionName });
  broadcastSessionList();
  saveMeta();

  ptyProcess.onData(data => {
    session.buffer += data;
    trimBuffer(session);
    // 通过 session.logStream 访问，避免闭包捕获旧 stream（rotate 后会更新）
    try { if (session.logStream && !session.logStream.destroyed) session.logStream.write(data); } catch (_) {}
    rotateLogIfNeeded(sessionId, Buffer.byteLength(data));
    session.lastActiveAt = Date.now();
    notifyHttpWaiters(session);
    broadcastData(session, data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    session.exitCode   = exitCode;
    session.ptyProcess = null;
    session.lastActiveAt = Date.now();
    try { if (session.logStream) session.logStream.end(); } catch (_) {}
    // 主动关闭所有已连接的 unix socket 客户端
    // （socketServer.close() 只停止接受新连接，不会关闭已有连接）
    for (const client of session.clients) {
      if (client.type === 'unix') {
        try { client._socket.destroy(); } catch (_) {}
      }
    }
    try { if (session.socketServer) session.socketServer.close(); } catch (_) {}
    broadcastJSON(session, { type: 'exit', exitCode });
    notifyHttpWaiters(session);
    // 退出后 5s 自动删除（给客户端时间显示退出消息）
    setTimeout(() => {
      if (sessions.get(sessionId) !== session) return;
      sessions.delete(sessionId);
      logCheckCounters.delete(sessionId);
      saveMeta();
      broadcastSessionList();
    }, 5000);
  });
}

// ── Attach ────────────────────────────────────────────────────────────────────

function attachSession(ws, wsId, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: 'Session not found' })); } catch (_) {}
    return false;
  }

  const client = wsClient(ws);

  // Remove old client for this wsId if any
  const prev = wsToSession.get(wsId);
  if (prev) {
    const prevSession = sessions.get(prev.sessionId);
    if (prevSession) prevSession.clients.delete(prev.client);
  }

  session.clients.add(client);
  wsToSession.set(wsId, { sessionId, client });

  // Replay scrollback
  if (session.buffer) {
    client.sendJSON({ type: 'replay_start' });
    client.send(session.buffer);
    client.sendJSON({ type: 'replay_end' });
  }
  client.sendJSON({
    type: 'session_id', sessionId, name: session.name,
    alive: session.exitCode === null && !!session.ptyProcess,
  });
  if (session.exitCode !== null) {
    client.sendJSON({ type: 'exit', exitCode: session.exitCode });
  }
  return true;
}

// ── Message handler ───────────────────────────────────────────────────────────

function resolveShellCwd(input) {
  const fallback = path.parse(os.homedir()).root;
  const cwd = expandHome(input || fallback);
  try {
    const resolved = path.resolve(cwd);
    if (fs.statSync(resolved).isDirectory()) return resolved;
  } catch (_) {}
  return fallback;
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

function findExecutable(command) {
  if (!command) return '';
  const expanded = expandHome(command);
  if (expanded.includes('/') || expanded.includes('\\')) {
    return isExecutable(expanded) ? expanded : '';
  }
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, expanded);
    if (isExecutable(candidate)) return candidate;
  }
  return '';
}

function selectShellBin() {
  if (IS_WIN) return process.env.ComSpec || 'cmd.exe';
  const candidates = [
    process.env.RCC_SHELL,
    process.env.REMOTECC_SHELL,
    'zsh',
    'fish',
    'bash',
    process.env.SHELL,
    'sh',
    '/bin/sh',
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const found = findExecutable(candidate);
    if (found) return found;
  }
  return '/bin/sh';
}

function normalizeShellId(shellId) {
  const raw = String(shellId || '1').trim();
  const safe = raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32);
  return safe || '1';
}

function getShell(shellId = '1') {
  return shellSessions.get(normalizeShellId(shellId));
}

function trimShellBuffer(shell) {
  if (!shell?.buffer || shell.buffer.length <= SCROLLBACK_LIMIT) return;
  trimBuffer(shell);
}

function detachShellClient(wsId) {
  const binding = wsToShellClient.get(wsId);
  if (!binding) return;
  const shell = getShell(binding.shellId);
  if (shell) shell.clients.delete(binding.client);
  wsToShellClient.delete(wsId);
}

function destroyShell(shellId = '1') {
  const id = normalizeShellId(shellId);
  const shell = getShell(id);
  if (!shell) return;
  shellSessions.delete(id);
  for (const [wsId, binding] of wsToShellClient.entries()) {
    if (binding.shellId === id) wsToShellClient.delete(wsId);
  }
  try { if (shell.ptyProcess) shell.ptyProcess.kill(); } catch (_) {}
  for (const client of shell.clients) {
    client.sendJSON({ type: 'shell_exit', exitCode: null });
  }
  notifyHttpWaiters(shell);
}

function spawnSharedShell(ws, { shellId = '1', cwd, cols = 80, rows = 24, env: clientEnv = {} }) {
  const id = normalizeShellId(shellId);
  const shellCwd = resolveShellCwd(cwd);
  const shellBin = selectShellBin();
  const shellEnv = {
    ...withoutHostSessionEnv(process.env),
    ...clientEnv,
    SHELL: IS_WIN ? process.env.ComSpec : shellBin,
    TERM: IS_WIN ? undefined : 'xterm-256color',
    COLORTERM: IS_WIN ? undefined : 'truecolor',
    TERM_PROGRAM: IS_WIN ? undefined : 'RemoteCC',
  };
  for (const key of Object.keys(shellEnv)) {
    if (shellEnv[key] === undefined) delete shellEnv[key];
  }

  let ptyProcess;
  try {
    ptyProcess = pty.spawn(shellBin, [], IS_WIN
      ? { useConpty: true, cols, rows, cwd: shellCwd, env: shellEnv }
      : { name: 'xterm-256color', cols, rows, cwd: shellCwd, env: shellEnv });
  } catch (err) {
    try { ws.send(JSON.stringify({ type: 'shell_error', message: err.message })); } catch (_) {}
    return null;
  }

  const shell = {
    shellId: id,
    ptyProcess,
    clients: new Set(),
    buffer: '',
    bufferBase: 0,
    httpWaiters: new Set(),
    cols,
    rows,
    cwd: shellCwd,
    exitCode: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
  shellSessions.set(id, shell);

  ptyProcess.onData(data => {
    if (getShell(id) !== shell) return;
    shell.buffer += data;
    trimShellBuffer(shell);
    shell.lastActiveAt = Date.now();
    notifyHttpWaiters(shell);
    for (const client of shell.clients) client.send(data);
  });
  ptyProcess.onExit(({ exitCode }) => {
    if (getShell(id) !== shell) return;
    shell.exitCode = exitCode;
    shell.ptyProcess = null;
    shell.lastActiveAt = Date.now();
    for (const client of shell.clients) client.sendJSON({ type: 'shell_exit', exitCode });
    notifyHttpWaiters(shell);
  });

  return shell;
}

function attachShell(ws, wsId, { shellId = '1', cwd, cols = 80, rows = 24, env = {} }) {
  const id = normalizeShellId(shellId);
  detachShellClient(wsId);
  let shell = getShell(id);
  if (!shell || !shell.ptyProcess) {
    shell = spawnSharedShell(ws, { shellId: id, cwd, cols, rows, env });
    if (!shell) return;
  }

  const client = wsClient(ws);
  client.cols = cols || shell.cols || 80;
  client.rows = rows || shell.rows || 24;
  shell.clients.add(client);
  wsToShellClient.set(wsId, { shellId: id, client });

  if (shell.buffer) {
    client.sendJSON({ type: 'shell_replay_start' });
    client.send(shell.buffer);
    client.sendJSON({ type: 'shell_replay_end' });
  }
  client.sendJSON({
    type: 'shell_ready',
    shellId: id,
    cwd: shell.cwd,
    alive: !!shell.ptyProcess,
    clientCount: shell.clients.size,
  });
}

function handleMessage(ws, wsId, raw) {
  // 输入时自动将 PTY resize 到该 client 的尺寸（谁在输入就按谁的窗口渲染）
  function resizeToClient(client, sess) {
    if (!sess || !sess.ptyProcess || !client) return;
    try { sess.ptyProcess.resize(client.cols || 80, client.rows || 24); } catch (_) {}
  }

  let msg;
  try { msg = JSON.parse(raw); } catch (_) {
    msg = null;
  }

  // 如果解析失败，或解析结果不是带 type 字段的对象（例如 "1" 被 JSON.parse 解析为数字 1）
  // 则视为原始 PTY 输入（raw string）
  if (!msg || typeof msg !== 'object' || !msg.type) {
    const shellBinding = wsToShellClient.get(wsId);
    const shell = shellBinding && getShell(shellBinding.shellId);
    if (shell?.ptyProcess && shellBinding?.client) {
      try { shell.ptyProcess.resize(shellBinding.client.cols || 80, shellBinding.client.rows || 24); } catch (_) {}
      shell.ptyProcess.write(raw);
      shell.lastActiveAt = Date.now();
      return;
    }

    // Raw string → PTY input
    const entry = wsToSession.get(wsId);
    const session = entry && sessions.get(entry.sessionId);
    if (session && session.ptyProcess) {
      resizeToClient(entry?.client, session);
      session.ptyProcess.write(raw);
      session.lastActiveAt = Date.now();
    }
    return;
  }

  const entry   = wsToSession.get(wsId);
  const session = entry && sessions.get(entry.sessionId);

  switch (msg.type) {
    case 'shell_start':
      attachShell(ws, wsId, msg);
      break;

    case 'shell_resize': {
      const shellBinding = wsToShellClient.get(wsId);
      const shellClient = shellBinding?.client;
      if (shellClient) {
        shellClient.cols = msg.cols || 80;
        shellClient.rows = msg.rows || 24;
      }
      const shell = shellBinding && getShell(shellBinding.shellId);
      if (shell?.ptyProcess && shellClient) {
        shell.cols = shellClient.cols;
        shell.rows = shellClient.rows;
        try { shell.ptyProcess.resize(shellClient.cols, shellClient.rows); } catch (_) {}
      }
      break;
    }

    case 'shell_input': {
      const shellBinding = wsToShellClient.get(wsId);
      const shellClient = shellBinding?.client;
      const shell = shellBinding && getShell(shellBinding.shellId);
      if (shell?.ptyProcess && shellClient && typeof msg.data === 'string') {
        try { shell.ptyProcess.resize(shellClient.cols || 80, shellClient.rows || 24); } catch (_) {}
        shell.ptyProcess.write(msg.data);
        shell.lastActiveAt = Date.now();
      }
      break;
    }

    case 'shell_kill':
      destroyShell(msg.shellId || wsToShellClient.get(wsId)?.shellId || '1');
      break;

    case 'shell_ping': {
      const shellId = normalizeShellId(msg.shellId || wsToShellClient.get(wsId)?.shellId || '1');
      try {
        ws.send(JSON.stringify({ type: 'shell_pong', shellId, ts: msg.ts || Date.now() }));
      } catch (_) {}
      break;
    }

    case 'start':
      createSession(ws, wsId, msg);
      break;

    case 'attach':
      attachSession(ws, wsId, msg.sessionId);
      break;

    case 'resize':
      if (entry) { entry.client.cols = msg.cols || 80; entry.client.rows = msg.rows || 24; }
      if (session && session.ptyProcess)
        session.ptyProcess.resize(msg.cols || 80, msg.rows || 24);
      break;

    case 'kill': {
      // 支持两种方式：msg.sessionId 直接指定，或使用当前绑定的 session
      const killId = msg.sessionId || entry?.sessionId;
      const killSession = killId && sessions.get(killId);
      if (killSession && killSession.ptyProcess) {
        try { killSession.ptyProcess.kill(); } catch (_) {}
      }
      break;
    }

    case 'delete':
      if (msg.sessionId) deleteSessionHttp(msg.sessionId);
      break;

    case 'rename':
      if (msg.sessionId && typeof msg.name === 'string' && msg.name.trim()) {
        renameSessionHttp(msg.sessionId, { name: msg.name });
      }
      break;

    case 'input':
      if (session && session.ptyProcess && msg.data) {
        resizeToClient(entry?.client, session);
        session.ptyProcess.write(msg.data);
        session.lastActiveAt = Date.now();
      }
      break;

    case 'list':
      try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'session_list', sessions: getSessionList() })); } catch (_) {}
      break;

    case 'terminal_ping':
      try {
        ws.send(JSON.stringify({ type: 'terminal_pong', sessionId: msg.sessionId || entry?.sessionId || '', ts: msg.ts || Date.now() }));
      } catch (_) {}
      break;
  }
}

// ── Close WS ─────────────────────────────────────────────────────────────────

function closeWS(wsId) {
  detachShellClient(wsId);
  const entry = wsToSession.get(wsId);
  if (entry) {
    const session = sessions.get(entry.sessionId);
    if (session) session.clients.delete(entry.client);
  }
  wsToSession.delete(wsId);
}

// ── HTTP fallback transport ──────────────────────────────────────────────────

function makeMemoryWS() {
  const sent = [];
  return {
    ws: {
      readyState: 1,
      send(data) { sent.push(String(data)); },
      close() {},
    },
    sent,
  };
}

function findControlMessage(sent, type) {
  for (const item of sent) {
    try {
      const msg = JSON.parse(item);
      if (msg?.type === type) return msg;
    } catch (_) {}
  }
  return null;
}

function sessionMeta(sessionId, session) {
  return {
    sessionId,
    name: session.name,
    workingDir: session.workingDir,
    agent: session.agent || 'claude',
    alive: session.exitCode === null && !!session.ptyProcess,
    exitCode: session.exitCode,
    clientCount: session.clients.size,
  };
}

function sessionSnapshot(sessionId, session, cursor) {
  return {
    ...sessionMeta(sessionId, session),
    ...readBufferSince(session, cursor),
  };
}

function requireSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw apiError(404, 'Session not found');
  return session;
}

function startSessionHttp(params = {}) {
  const wsId = `http-${uuidv4()}`;
  const memory = makeMemoryWS();
  createSession(memory.ws, wsId, params);
  const error = findControlMessage(memory.sent, 'error');
  const created = findControlMessage(memory.sent, 'session_id');
  closeWS(wsId);

  if (error) throw apiError(400, error.message || 'Failed to start session');
  if (!created?.sessionId) throw apiError(500, 'Session start failed');

  const session = requireSession(created.sessionId);
  return sessionSnapshot(created.sessionId, session, session.bufferBase || 0);
}

function attachSessionHttp(sessionId, params = {}) {
  const session = requireSession(sessionId);
  const { cols, rows } = normalizeSize(params.cols, params.rows);
  session.httpCols = cols;
  session.httpRows = rows;
  if (session.ptyProcess) {
    try { session.ptyProcess.resize(cols, rows); } catch (_) {}
  }
  return sessionSnapshot(sessionId, session, session.bufferBase || 0);
}

function inputSessionHttp(sessionId, params = {}) {
  const session = requireSession(sessionId);
  if (!session.ptyProcess) throw apiError(409, 'Session is not running');
  const data = normalizeInput(params.data);
  const { cols, rows } = normalizeSize(params.cols || session.httpCols, params.rows || session.httpRows);
  session.httpCols = cols;
  session.httpRows = rows;
  try { session.ptyProcess.resize(cols, rows); } catch (_) {}
  session.ptyProcess.write(data);
  session.lastActiveAt = Date.now();
  return { ok: true, cursor: bufferCursor(session) };
}

function resizeSessionHttp(sessionId, params = {}) {
  const session = requireSession(sessionId);
  const { cols, rows } = normalizeSize(params.cols, params.rows);
  session.httpCols = cols;
  session.httpRows = rows;
  if (session.ptyProcess) {
    try { session.ptyProcess.resize(cols, rows); } catch (_) {}
  }
  return { ok: true, cols, rows };
}

function pollSessionHttp(sessionId, params = {}) {
  const session = requireSession(sessionId);
  return pollBuffer(session, params.cursor, params.wait, () => sessionMeta(sessionId, session));
}

function killSessionHttp(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { ok: true, found: false, alive: false };
  if (session.ptyProcess) {
    try { session.ptyProcess.kill(); } catch (_) {}
  }
  session.lastActiveAt = Date.now();
  return { ok: true, found: true, alive: session.exitCode === null && !!session.ptyProcess };
}

function deleteSessionHttp(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { ok: true, found: false };

  const ptyProcess = session.ptyProcess;
  session.ptyProcess = null;
  session.lastActiveAt = Date.now();
  try { if (ptyProcess) ptyProcess.kill(); } catch (_) {}
  try { if (session.logStream) session.logStream.end(); } catch (_) {}
  try { if (session.socketServer) session.socketServer.close(); } catch (_) {}
  for (const client of session.clients) {
    if (client.type === 'unix') {
      try { client._socket.destroy(); } catch (_) {}
    }
  }
  notifyHttpWaiters(session);
  sessions.delete(sessionId);
  logCheckCounters.delete(sessionId);
  saveMeta();
  broadcastSessionList();
  return { ok: true, found: true };
}

function renameSessionHttp(sessionId, params = {}) {
  const session = sessions.get(sessionId);
  if (!session) return { ok: true, found: false };
  const name = typeof params.name === 'string' ? params.name.trim() : '';
  if (!name) throw apiError(400, 'name is required');
  if (session.name !== name) {
    session.name = name;
    saveMeta();
    broadcastSessionList();
  }
  return { ok: true, found: true, name: session.name };
}

function shellMeta(shellId = '1') {
  const id = normalizeShellId(shellId);
  const shell = getShell(id);
  return {
    shellId: id,
    alive: !!shell?.ptyProcess,
    exitCode: shell?.exitCode ?? null,
    cwd: shell?.cwd || '',
    clientCount: shell?.clients?.size || 0,
  };
}

function requireShell(shellId = '1') {
  const shell = getShell(shellId);
  if (!shell) throw apiError(404, 'Shell not found');
  return shell;
}

function startShellHttp(params = {}) {
  const shellId = normalizeShellId(params.shellId);
  const { cols, rows } = normalizeSize(params.cols, params.rows);
  let shell = getShell(shellId);
  if (!shell || !shell.ptyProcess) {
    const memory = makeMemoryWS();
    shell = spawnSharedShell(memory.ws, { shellId, cwd: params.cwd, cols, rows, env: params.env || {} });
    const error = findControlMessage(memory.sent, 'shell_error');
    if (error) throw apiError(400, error.message || 'Failed to start shell');
    if (!shell) throw apiError(500, 'Shell start failed');
  }
  shell.cols = cols;
  shell.rows = rows;
  if (shell.ptyProcess) {
    try { shell.ptyProcess.resize(cols, rows); } catch (_) {}
  }
  return {
    ...shellMeta(shellId),
    ...readBufferSince(shell, shell.bufferBase || 0),
  };
}

function inputShellHttp(params = {}) {
  const shell = requireShell(params.shellId);
  if (!shell.ptyProcess) throw apiError(409, 'Shell is not running');
  const data = normalizeInput(params.data);
  const { cols, rows } = normalizeSize(params.cols || shell.cols, params.rows || shell.rows);
  shell.cols = cols;
  shell.rows = rows;
  try { shell.ptyProcess.resize(cols, rows); } catch (_) {}
  shell.ptyProcess.write(data);
  shell.lastActiveAt = Date.now();
  return { ok: true, cursor: bufferCursor(shell) };
}

function resizeShellHttp(params = {}) {
  const shell = requireShell(params.shellId);
  const { cols, rows } = normalizeSize(params.cols, params.rows);
  shell.cols = cols;
  shell.rows = rows;
  if (shell.ptyProcess) {
    try { shell.ptyProcess.resize(cols, rows); } catch (_) {}
  }
  return { ok: true, cols, rows };
}

function pollShellHttp(params = {}) {
  const shellId = normalizeShellId(params.shellId);
  const shell = requireShell(shellId);
  return pollBuffer(shell, params.cursor, params.wait, () => shellMeta(shellId));
}

function killShellHttp(shellId = '1') {
  destroyShell(shellId);
  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSessionList() {
  return Array.from(sessions.entries()).map(([id, s]) => ({
    sessionId: id, name: s.name, workingDir: s.workingDir, agent: s.agent || 'claude',
    extraArgs: s.extraArgs || [],
    alive: s.exitCode === null && !!s.ptyProcess,
    exitCode: s.exitCode,
    createdAt: s.createdAt, lastActiveAt: s.lastActiveAt,
    logPath: s.logPath, socketPath: s.socketPath,
    clientCount: s.clients.size,
  })).sort((a, b) => b.createdAt - a.createdAt);
}

function listSessions() { return getSessionList(); }

const LOG_MAX_LINES = 9000;
// Agent TUI 输出换行很少，仅按行数限制会让日志无限增长；超过上限后只保留尾部
const LOG_MAX_BYTES = 4 * 1024 * 1024;
const LOG_KEEP_BYTES = 2 * 1024 * 1024;
// 每写入多少字节检查一次文件大小（避免频繁 stat）
const LOG_CHECK_INTERVAL = 256 * 1024;

const logCheckCounters = new Map(); // sessionId → bytes since last check

function readFileTail(filePath, maxBytes) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    const buf = Buffer.allocUnsafe(length);
    const n = fs.readSync(fd, buf, 0, length, size - length);
    return { text: buf.toString('utf8', 0, n), truncated: size > length };
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
  }
}

function tailLines(text, truncated) {
  const lines = text.split('\n');
  // 从文件中间截取时第一行不完整，丢弃
  if (truncated && lines.length > 1) lines.shift();
  if (lines.length <= LOG_MAX_LINES) return lines.join('\n');
  return lines.slice(lines.length - LOG_MAX_LINES).join('\n');
}

function rotateLogIfNeeded(sessionId, bytes = 0) {
  const session = sessions.get(sessionId);
  if (!session || !session.logPath) return;

  const counter = (logCheckCounters.get(sessionId) || 0) + bytes;
  if (counter < LOG_CHECK_INTERVAL) {
    logCheckCounters.set(sessionId, counter);
    return;
  }
  logCheckCounters.set(sessionId, 0);

  try {
    if (fs.statSync(session.logPath).size <= LOG_MAX_BYTES) return;
    // logStream 以追加模式打开，原地截断后后续写入会自动接在新文件末尾
    const tail = readFileTail(session.logPath, LOG_KEEP_BYTES);
    fs.writeFileSync(session.logPath, tailLines(tail.text, tail.truncated), 'utf8');
  } catch (_) {}
}

function readLog(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.logPath) return null;
  try {
    const tail = readFileTail(session.logPath, LOG_KEEP_BYTES);
    return tailLines(tail.text, tail.truncated);
  } catch (_) { return null; }
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

function cleanup() {
  for (const [, shell] of shellSessions) {
    try { if (shell.ptyProcess) shell.ptyProcess.kill(); } catch (_) {}
  }
  for (const [, s] of sessions) {
    try { if (s.ptyProcess) s.ptyProcess.kill(); } catch (_) {}
    try { if (s.logStream)  s.logStream.end(); }  catch (_) {}
    try { if (s.socketServer) s.socketServer.close(); } catch (_) {}
  }
}

process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT',  () => { cleanup(); process.exit(0); });

module.exports = {
  handleMessage,
  closeWS,
  listSessions,
  readLog,
  registerWS,
  unregisterWS,
  startSessionHttp,
  attachSessionHttp,
  inputSessionHttp,
  resizeSessionHttp,
  pollSessionHttp,
  killSessionHttp,
  deleteSessionHttp,
  renameSessionHttp,
  startShellHttp,
  inputShellHttp,
  resizeShellHttp,
  pollShellHttp,
  killShellHttp,
};
