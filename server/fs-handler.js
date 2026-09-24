const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');
const { StringDecoder } = require('string_decoder');

// ── 安全根目录白名单 ──────────────────────────────────────────────────────────
const DEFAULT_ROOTS = [path.parse(os.homedir()).root];

function getAllowedRoots() {
  const extra = (process.env.FS_ROOTS || '').split(':').filter(Boolean);
  return [...DEFAULT_ROOTS, ...extra].map(root => path.resolve(root));
}

function isAllowedPath(resolved, root) {
  const rootDir = path.parse(root).root;
  if (root === rootDir) return resolved.startsWith(rootDir);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/**
 * 路径安全检查：解析绝对路径并验证在白名单根目录下
 * @param {string} reqPath  请求路径（可含 ~）
 * @returns {string}        解析后的安全绝对路径
 * @throws {Error}          路径不安全时抛出
 */
function resolveSafePath(reqPath) {
  if (!reqPath) reqPath = path.parse(os.homedir()).root;
  // 展开 ~ 为 homedir
  if (reqPath === '~' || reqPath.startsWith('~/')) {
    reqPath = os.homedir() + reqPath.slice(1);
  }
  const resolved = path.resolve(reqPath);
  const allowed = getAllowedRoots();
  const ok = allowed.some(root => isAllowedPath(resolved, root));
  if (!ok) throw new Error(`Access denied: ${resolved}`);
  return resolved;
}

// ── 文件类型映射 ──────────────────────────────────────────────────────────────
const TEXT_EXTS = new Set([
  '.md', '.txt', '.js', '.ts', '.jsx', '.tsx', '.vue', '.json', '.sh',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.py',
  '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.java', '.kt',
  '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg', '.csv',
  '.log', '.diff', '.patch', '.sql', '.graphql', '.proto', '.tf',
  '.dockerfile', '.makefile', '.gitignore', '.gitattributes',
]);

const IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
]);

// SVG 作为文本而非图片（可直接阅读源码）
const SVG_EXT = '.svg';

// 常见无扩展名文本文件（按小写 basename 匹配）
const TEXT_FILENAMES = new Set([
  'dockerfile', 'makefile', 'license', 'licence', 'readme', 'changelog',
  'authors', 'notice', 'copying', 'install', 'contributing', 'codeowners',
  '.gitignore', '.gitattributes', '.dockerignore', '.npmignore', '.npmrc',
  '.editorconfig', '.env', '.bashrc', '.zshrc', '.profile', '.bash_profile',
  '.vimrc', '.inputrc', '.prettierrc', '.eslintrc', '.babelrc',
]);

function getFileKind(ext, name) {
  const e = (ext || '').toLowerCase();
  if (e === SVG_EXT) return 'text';
  if (TEXT_EXTS.has(e))  return 'text';
  if (IMAGE_EXTS.has(e)) return 'image';
  const base = (name || '').toLowerCase();
  if (base && TEXT_FILENAMES.has(base)) return 'text';
  return 'unsupported';
}

// 无扩展名文件的文本嗅探：读取前缀，无 NUL 且控制字符占比低则视为文本
function looksLikeText(buf) {
  if (!buf.length) return true;
  let suspicious = 0;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === 0) return false; // NUL 字节 → 判定为二进制
    if (c < 9 || (c > 13 && c < 32)) suspicious++;
  }
  return suspicious / buf.length < 0.1;
}

function sniffTextFile(safePath, size) {
  try {
    const sniffLen = Math.min(size, 4096);
    if (sniffLen === 0) return true;
    const fd = fs.openSync(safePath, 'r');
    const buf = Buffer.allocUnsafe(sniffLen);
    const n = fs.readSync(fd, buf, 0, sniffLen, 0);
    fs.closeSync(fd);
    return looksLikeText(buf.slice(0, n));
  } catch (_) {
    return false;
  }
}

/**
 * 列目录内容
 * @param {string}  reqPath     请求路径
 * @param {boolean} showHidden  是否显示隐藏文件
 * @returns {{ path: string, entries: Array }}
 */
function listDir(reqPath, showHidden = false) {
  const safePath = resolveSafePath(reqPath);
  const stat = fs.statSync(safePath);
  if (!stat.isDirectory()) throw new Error('Not a directory');

  const names = fs.readdirSync(safePath);
  const entries = [];

  for (const name of names) {
    if (!showHidden && name.startsWith('.')) continue;
    try {
      const full = path.join(safePath, name);
      const s    = fs.statSync(full);
      const ext  = path.extname(name).toLowerCase();
      entries.push({
        name,
        type: s.isDirectory() ? 'dir' : 'file',
        size: s.isDirectory() ? null : s.size,
        mtime: s.mtimeMs,
        ext: s.isDirectory() ? '' : ext,
      });
    } catch (_) {
      // 无权限的条目跳过
    }
  }

  // 目录在前，文件在后，各自按名称字母排序
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return { path: safePath, entries };
}

const TEXT_MAX_BYTES  = 100 * 1024;  // 100 KB
const IMAGE_MAX_BYTES = 2  * 1024 * 1024;  // 2 MB
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024 * 1024;  // 10 GB

/**
 * 读取文件预览内容
 * @param {string} reqPath
 * @param {number} maxBytes  文本最大字节数（默认 100KB）
 * @returns {{ path, type, content?, dataUrl?, truncated, size }}
 */
function readFilePreview(reqPath, maxBytes = TEXT_MAX_BYTES) {
  const safePath = resolveSafePath(reqPath);
  const stat = fs.statSync(safePath);
  if (stat.isDirectory()) throw new Error('Is a directory');

  const ext  = path.extname(safePath).toLowerCase();
  const base = path.basename(safePath);
  let kind = getFileKind(ext, base);
  const size = stat.size;

  // 无扩展名且未识别的文件：嗅探内容，判定为文本可预览（Dockerfile / Makefile / LICENSE 等）
  if (kind === 'unsupported' && ext === '' && sniffTextFile(safePath, size)) {
    kind = 'text';
  }

  if (kind === 'unsupported') {
    return { path: safePath, type: 'unsupported', size };
  }

  if (kind === 'image') {
    if (size > IMAGE_MAX_BYTES) {
      return { path: safePath, type: 'image_too_large', size };
    }
    const buf = fs.readFileSync(safePath);
    const mime = ext === '.svg' ? 'image/svg+xml'
               : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
               : ext === '.gif' ? 'image/gif'
               : ext === '.webp' ? 'image/webp'
               : ext === '.bmp' ? 'image/bmp'
               : ext === '.ico' ? 'image/x-icon'
               : 'image/png';
    return {
      path: safePath,
      type: 'image',
      dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
      size,
      truncated: false,
    };
  }

  // text
  const limit = Math.min(maxBytes, TEXT_MAX_BYTES);
  const buf = Buffer.allocUnsafe(Math.min(size, limit + 1));
  const fd  = fs.openSync(safePath, 'r');
  const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  const truncated = bytesRead > limit;
  const slice = buf.slice(0, truncated ? limit : bytesRead);
  // 用 StringDecoder 解码，避免在多字节 UTF-8 序列中间截断导致末尾乱码
  const decoder = new StringDecoder('utf8');
  let content = decoder.write(slice);
  // 完整读取时补齐尾部；截断时丢弃不完整的尾部字节序列
  if (!truncated) content += decoder.end();

  return { path: safePath, type: 'text', content, truncated, size };
}

/**
 * 获取文件/目录 stat 信息
 */
function statFile(reqPath) {
  const safePath = resolveSafePath(reqPath);
  const s  = fs.statSync(safePath);
  const name = path.basename(safePath);
  return {
    path: safePath,
    name,
    type: s.isDirectory() ? 'dir' : 'file',
    size: s.size,
    mtime: s.mtimeMs,
    mode: s.mode.toString(8),
  };
}

function sanitizeFilename(name) {
  const raw = String(name || 'upload.bin').split(/[\\/]/).pop();
  const base = raw.replace(/[\x00-\x1f\x7f]/g, '_').trim();
  return base && base !== '.' && base !== '..' ? base : 'upload.bin';
}

function decodeUploadFilename(encodedName, fallback = 'upload.bin') {
  const raw = String(encodedName || fallback);
  try {
    return decodeURIComponent(raw);
  } catch (_) {
    return raw || fallback;
  }
}

function sanitizeDirectoryName(name) {
  const raw = String(name || '').trim();
  if (!raw || raw === '.' || raw === '..') throw new Error('Invalid directory name');
  if (raw.includes('/') || raw.includes('\\')) throw new Error('Directory name cannot contain path separators');
  const safe = raw.replace(/[\x00-\x1f\x7f]/g, '_').trim();
  if (!safe || safe === '.' || safe === '..') throw new Error('Invalid directory name');
  return safe;
}

function uniqueFilePath(dir, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function writeUploadedFile(reqDir, filename, buffer) {
  const safeDir = resolveSafePath(reqDir);
  const stat = fs.statSync(safeDir);
  if (!stat.isDirectory()) throw new Error('Not a directory');

  const safeName = sanitizeFilename(decodeUploadFilename(filename));
  const filePath = uniqueFilePath(safeDir, safeName);
  fs.writeFileSync(filePath, buffer);
  return statFile(filePath);
}

function createDirectory(reqDir, dirname) {
  const safeDir = resolveSafePath(reqDir);
  const stat = fs.statSync(safeDir);
  if (!stat.isDirectory()) throw new Error('Not a directory');

  const safeName = sanitizeDirectoryName(dirname);
  const dirPath = path.join(safeDir, safeName);
  if (fs.existsSync(dirPath)) throw new Error('Directory already exists');
  fs.mkdirSync(dirPath);
  return statFile(dirPath);
}

// ── 流式上传 / 下载（不把整个文件读入内存，避免大文件卡死服务）──────────────

function sendJson(res, status, obj) {
  if (res.headersSent || res.writableEnded) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function errorStatus(err) {
  const msg = err?.message || '';
  if (msg.startsWith('Access denied') || err?.code === 'EACCES' || err?.code === 'EPERM') return 403;
  if (err?.code === 'ENOENT') return 404;
  if (err?.code === 'ENOSPC') return 507;
  if (err?.status) return err.status;
  return 400;
}

function uploadError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function formatUploadLimit() {
  return `${UPLOAD_MAX_BYTES / 1024 / 1024 / 1024} GB`;
}

/**
 * 在读取请求体前检查声明的大小和磁盘剩余空间，返回 null 表示可以继续
 */
function precheckUpload(req, dir) {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES) {
    return uploadError(`File too large (max ${formatUploadLimit()})`, 413);
  }
  if (Number.isFinite(declared) && declared > 0 && typeof fs.statfsSync === 'function') {
    try {
      const st = fs.statfsSync(dir);
      if (st.bavail * st.bsize < declared) return uploadError('Insufficient disk space', 507);
    } catch (_) {}
  }
  return null;
}

// 拒绝时不再接收剩余的请求体：回复后直接断开连接
function rejectUpload(req, res, err) {
  res.setHeader('connection', 'close');
  res.on('finish', () => req.destroy());
  sendJson(res, errorStatus(err), { error: err.message });
}

function streamRequestToFile(req, filePath) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath, { flags: 'wx', mode: 0o644 });
    let settled = false;
    let received = 0;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      try { req.unpipe(out); } catch (_) {}
      out.destroy();
      fs.unlink(filePath, () => {});
      reject(err);
    };
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > UPLOAD_MAX_BYTES) fail(uploadError(`File too large (max ${formatUploadLimit()})`, 413));
    });
    req.on('error', fail);
    req.on('close', () => {
      if (!req.complete && !req.readableEnded) fail(new Error('Upload aborted'));
    });
    out.on('error', fail);
    out.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    req.pipe(out);
  });
}

function drainRequest(req) {
  try { req.resume(); } catch (_) {}
}

/**
 * POST /api/fs/upload?path=<dir>，请求体为文件原始字节
 */
async function handleFsUploadRequest(req, res, reqDir, encodedName) {
  let safeDir;
  try {
    safeDir = resolveSafePath(reqDir);
    if (!fs.statSync(safeDir).isDirectory()) throw new Error('Not a directory');
  } catch (e) {
    drainRequest(req);
    sendJson(res, errorStatus(e), { error: e.message });
    return;
  }

  const rejected = precheckUpload(req, safeDir);
  if (rejected) { rejectUpload(req, res, rejected); return; }

  const safeName = sanitizeFilename(decodeUploadFilename(encodedName));
  const tmpPath = path.join(safeDir, `.${safeName}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.uploading`);
  try {
    await streamRequestToFile(req, tmpPath);
    const filePath = uniqueFilePath(safeDir, safeName);
    fs.renameSync(tmpPath, filePath);
    sendJson(res, 200, statFile(filePath));
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    if (e.status === 413) { rejectUpload(req, res, e); return; }
    drainRequest(req);
    sendJson(res, e.message === 'Upload aborted' ? 400 : errorStatus(e), { error: e.message });
  }
}

/**
 * POST /api/upload：终端里粘贴 / 上传的图片和文件，存到 uploadDir 并返回服务器路径
 */
async function handleAttachmentUploadRequest(req, res, uploadDir, encodedName) {
  const uploadName = decodeUploadFilename(encodedName || 'image.png', 'image.png');
  const ext = uploadName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .match(/\.[a-zA-Z0-9]+$/)?.[0] || '.png';
  const filename = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(uploadDir, filename);
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    drainRequest(req);
    sendJson(res, 500, { error: e.message });
    return;
  }
  const rejected = precheckUpload(req, uploadDir);
  if (rejected) { rejectUpload(req, res, rejected); return; }
  try {
    await streamRequestToFile(req, filePath);
    sendJson(res, 200, { path: filePath, filename });
  } catch (e) {
    if (e.status) { rejectUpload(req, res, e); return; }
    drainRequest(req);
    sendJson(res, e.message === 'Upload aborted' ? 400 : 500, { error: e.message });
  }
}

/**
 * GET /api/fs/download?path=<file>，以流的方式返回文件
 */
function handleFsDownloadRequest(req, res, reqPath) {
  let safePath;
  let stat;
  try {
    safePath = resolveSafePath(reqPath);
    stat = fs.statSync(safePath);
    if (stat.isDirectory()) throw new Error('Is a directory');
  } catch (e) {
    sendJson(res, errorStatus(e), { error: e.message });
    return;
  }

  const name = path.basename(safePath);
  const stream = fs.createReadStream(safePath);
  stream.on('open', () => {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    stream.pipe(res);
  });
  stream.on('error', (e) => {
    if (!res.headersSent) sendJson(res, errorStatus(e), { error: e.message });
    else res.destroy(e);
  });
  res.on('close', () => stream.destroy());
}

function readDownloadFile(reqPath) {
  const safePath = resolveSafePath(reqPath);
  const stat = fs.statSync(safePath);
  if (stat.isDirectory()) throw new Error('Is a directory');
  return {
    path: safePath,
    name: path.basename(safePath),
    size: stat.size,
    content: fs.readFileSync(safePath),
  };
}

module.exports = {
  UPLOAD_MAX_BYTES,
  resolveSafePath,
  listDir,
  readFilePreview,
  statFile,
  createDirectory,
  writeUploadedFile,
  readDownloadFile,
  decodeUploadFilename,
  handleFsUploadRequest,
  handleAttachmentUploadRequest,
  handleFsDownloadRequest,
};
