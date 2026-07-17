const BASE = '';

function getToken() { return localStorage.getItem('rcc_token') || ''; }
function setToken(tok) { localStorage.setItem('rcc_token', tok); }
function clearToken() { localStorage.removeItem('rcc_token'); }

export function saveUsername(user) { localStorage.setItem('rcc_user', user); }
export function getSavedUsername() { return localStorage.getItem('rcc_user') || ''; }

function authHeader() {
  const tok = getToken();
  return tok ? { Authorization: `Bearer ${tok}` } : {};
}

// 401 回调：token 失效时通知 App 跳回登录页
let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

function handleUnauthorized() {
  clearToken();
  if (_onUnauthorized) _onUnauthorized();
}

async function throwApiError(res) {
  let message = `HTTP ${res.status}`;
  try {
    const data = await res.clone().json();
    if (data?.error) message = data.error;
  } catch (_) {}
  throw new Error(message);
}

export async function login(username, password) {
  const res = await fetch(BASE + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Invalid credentials');
  const { token } = await res.json();
  setToken(token);
  saveUsername(username);
}

export function logout() { clearToken(); }
export function isLoggedIn() { return !!getToken(); }

async function apiFetch(path, opts = {}) {
  const { timeoutMs = 0, ...fetchOpts } = opts;
  let timer = null;
  let controller = null;
  let abortListener = null;
  if (timeoutMs > 0 && typeof AbortController !== 'undefined') {
    const externalSignal = fetchOpts.signal;
    controller = new AbortController();
    fetchOpts.signal = controller.signal;
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else {
        abortListener = () => controller.abort();
        externalSignal.addEventListener('abort', abortListener, { once: true });
      }
    }
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const res = await fetch(BASE + path, {
      ...fetchOpts,
      headers: { ...authHeader(), ...(fetchOpts.headers || {}) },
    });
    if (res.status === 401) { handleUnauthorized(); throw new Error('Unauthorized'); }
    if (!res.ok) await throwApiError(res);
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Request timeout');
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) opts.signal?.removeEventListener?.('abort', abortListener);
  }
}

async function apiFetchText(path) {
  const res = await fetch(BASE + path, { headers: authHeader() });
  if (res.status === 401) { handleUnauthorized(); throw new Error('Unauthorized'); }
  if (!res.ok) await throwApiError(res);
  return res.text();
}

async function apiFetchBlob(path) {
  const res = await fetch(BASE + path, { headers: authHeader() });
  if (res.status === 401) { handleUnauthorized(); throw new Error('Unauthorized'); }
  if (!res.ok) await throwApiError(res);
  return {
    blob: await res.blob(),
    filename: getDownloadFilename(res.headers.get('content-disposition')),
  };
}

function getDownloadFilename(disposition) {
  if (!disposition) return '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1]); } catch (_) {}
  }
  const plain = disposition.match(/filename="([^"]+)"/i);
  return plain?.[1] || '';
}

function pollTimeout(wait) {
  const waitMs = Number(wait);
  const safeWait = Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : 5000;
  return Math.max(10000, safeWait + 5000);
}

function shellBase(shellId = '1') {
  const id = String(shellId || '1');
  return id === '1' ? '/api/shell' : `/api/shell/${encodeURIComponent(id)}`;
}

function uploadFilenameHeaders(file) {
  const encoded = encodeURIComponent(file?.name || 'upload.bin');
  return {
    'X-Filename': encoded,
    'X-Filename-Encoded': encoded,
  };
}

async function uploadFile(path, file) {
  const res = await fetch(BASE + `/api/fs/upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: {
      ...authHeader(),
      'Content-Type': 'application/octet-stream',
      ...uploadFilenameHeaders(file),
    },
    body: await file.arrayBuffer(),
  });
  if (res.status === 401) { handleUnauthorized(); throw new Error('Unauthorized'); }
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export const api = {
  changePassword:     (currentPassword, newPassword) => apiFetch('/api/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  }),
  getSettings:        () => apiFetch('/api/settings'),
  saveSettings:       (settings) => apiFetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  }),
  getAgents:          () => apiFetch('/api/agents'),
  getProjects:        (agent = 'claude') => apiFetch(`/api/projects?agent=${encodeURIComponent(agent)}`),
  getSessions:        (projectId, agent = 'claude') => apiFetch(`/api/sessions/${encodeURIComponent(projectId)}?agent=${encodeURIComponent(agent)}`),
  getSession:         (sessionId, agent = 'claude') => apiFetch(`/api/session/${encodeURIComponent(sessionId)}?agent=${encodeURIComponent(agent)}`),
  getActiveSessions:  ()           => apiFetch('/api/active-sessions'),
  getSessionLog:      (sessionId, bytes = 50000) => apiFetchText(`/api/session-log/${encodeURIComponent(sessionId)}?bytes=${bytes}`),
  terminal: {
    start:  (payload) => apiFetch('/api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    attach: (sessionId, payload) => apiFetch(`/api/terminal/${encodeURIComponent(sessionId)}/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    input:  (sessionId, payload) => apiFetch(`/api/terminal/${encodeURIComponent(sessionId)}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    resize: (sessionId, payload) => apiFetch(`/api/terminal/${encodeURIComponent(sessionId)}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    kill:   (sessionId) => apiFetch(`/api/terminal/${encodeURIComponent(sessionId)}/kill`, { method: 'POST' }),
    deleteSession: (sessionId) => apiFetch(`/api/terminal/${encodeURIComponent(sessionId)}/delete`, { method: 'POST' }),
    rename: (sessionId, name) => apiFetch(`/api/terminal/${encodeURIComponent(sessionId)}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
    poll:   (sessionId, cursor = 0, wait = 5000, options = {}) => apiFetch(
      `/api/terminal/${encodeURIComponent(sessionId)}/poll?cursor=${encodeURIComponent(cursor)}&wait=${encodeURIComponent(wait)}`,
      { timeoutMs: pollTimeout(wait), ...options },
    ),
  },
  shell: {
    start:  (payload, shellId = '1') => apiFetch(`${shellBase(shellId)}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    input:  (payload, shellId = '1') => apiFetch(`${shellBase(shellId)}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    resize: (payload, shellId = '1') => apiFetch(`${shellBase(shellId)}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
    kill:   (shellId = '1') => apiFetch(`${shellBase(shellId)}/kill`, { method: 'POST' }),
    poll:   (cursor = 0, wait = 5000, shellId = '1') => apiFetch(
      `${shellBase(shellId)}/poll?cursor=${encodeURIComponent(cursor)}&wait=${encodeURIComponent(wait)}`,
      { timeoutMs: pollTimeout(wait) },
    ),
  },
  fs: {
    list:  (path, hidden = false) => apiFetch(`/api/fs/list?path=${encodeURIComponent(path)}&hidden=${hidden}`),
    read:  (path, maxBytes = 102400) => apiFetch(`/api/fs/read?path=${encodeURIComponent(path)}&maxBytes=${maxBytes}`),
    stat:  (path) => apiFetch(`/api/fs/stat?path=${encodeURIComponent(path)}`),
    mkdir: (path, name) => apiFetch('/api/fs/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name }),
    }),
    upload: uploadFile,
    download: (path) => apiFetchBlob(`/api/fs/download?path=${encodeURIComponent(path)}`),
  },
};

export function createWS() {
  const tok = getToken();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(tok)}`);
}
