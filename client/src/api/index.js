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

function apiError(message, status = 0) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function throwApiError(res) {
  let message = `HTTP ${res.status}`;
  try {
    const data = await res.clone().json();
    if (data?.error) message = data.error;
  } catch (_) {}
  throw apiError(message, res.status);
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
    if (res.status === 401) { handleUnauthorized(); throw apiError('Unauthorized', 401); }
    if (!res.ok) await throwApiError(res);
    return res.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw apiError('Request timeout');
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

/**
 * 用 XHR 直接发送 File/Blob：浏览器从磁盘流式读取，不会把整个文件读进内存，
 * 同时可以拿到上传进度。onProgress(loaded, total)
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024;
const UPLOAD_LIMIT_MESSAGE = '文件超过 10 GB 上传上限';

export function formatBytes(bytes) {
  if (bytes == null || bytes === '' || !Number.isFinite(Number(bytes))) return '';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.ceil(seconds);
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
  return `${Math.floor(s / 3600)}小时${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}分`;
}

// 最近几秒的平均速度，避免瞬时速度跳动
function createSpeedMeter(windowMs = 3000) {
  const samples = [];
  return (loaded) => {
    const now = performance.now();
    samples.push([now, loaded]);
    while (samples.length > 2 && now - samples[0][0] > windowMs) samples.shift();
    const [t0, l0] = samples[0];
    return now > t0 ? (loaded - l0) / ((now - t0) / 1000) : 0;
  };
}

function uploadWithProgress(url, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      reject(apiError(UPLOAD_LIMIT_MESSAGE, 413));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + url);
    const headers = {
      ...authHeader(),
      'Content-Type': 'application/octet-stream',
      ...uploadFilenameHeaders(file),
    };
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    if (onProgress && xhr.upload) {
      const measure = createSpeedMeter();
      xhr.upload.onprogress = (e) => {
        const total = e.lengthComputable ? e.total : file.size;
        const speed = measure(e.loaded);
        onProgress(e.loaded, total, { speed, eta: speed > 0 ? (total - e.loaded) / speed : NaN });
      };
    }
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText || 'null'); } catch (_) {}
      if (xhr.status === 401) {
        handleUnauthorized();
        reject(apiError('Unauthorized', 401));
      } else if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        const message = xhr.status === 413 ? UPLOAD_LIMIT_MESSAGE
          : xhr.status === 507 ? '服务器磁盘空间不足'
          : (data?.error || `HTTP ${xhr.status}`);
        reject(apiError(message, xhr.status));
      }
    };
    xhr.onerror = () => reject(apiError('Network error'));
    xhr.onabort = () => reject(apiError('Upload cancelled'));
    if (signal) {
      if (signal.aborted) { xhr.abort(); return; }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

function uploadFile(path, file, options) {
  return uploadWithProgress(`/api/fs/upload?path=${encodeURIComponent(path)}`, file, options);
}

function uploadAttachment(file, options) {
  return uploadWithProgress('/api/upload', file, options);
}

// 下载交给浏览器原生处理（流式写盘，不占用页面内存），token 走 query 参数
function downloadUrl(path) {
  return `${BASE}/api/fs/download?path=${encodeURIComponent(path)}&token=${encodeURIComponent(getToken())}`;
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
    uploadAttachment,
    downloadUrl,
    download: (path) => apiFetchBlob(`/api/fs/download?path=${encodeURIComponent(path)}`),
  },
};

export function createWS() {
  const tok = getToken();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(tok)}`);
}
