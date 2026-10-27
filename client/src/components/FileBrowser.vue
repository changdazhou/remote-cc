<template>
  <div
    class="fb-root"
    :class="{ 'fb-drag-over': dragOver }"
    @dragenter.prevent="dragOver = true"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDropUpload"
  >

    <!-- ── 工具栏 ──────────────────────────────────────────────── -->
    <div class="fb-toolbar">
      <div class="fb-breadcrumb">
        <span
          v-for="(crumb, i) in breadcrumbs"
          :key="crumb.path"
          class="fb-crumb"
          role="button" tabindex="0"
          @click="navigateTo(crumb.path)"
          @keydown.enter.space.self.prevent="navigateTo(crumb.path)"
        >{{ crumb.label }}</span>
      </div>

      <input
        v-model="pathInput"
        class="fb-path-input"
        :placeholder="currentPath || t.fb_path_placeholder"
        @keyup.enter="navigateTo(pathInput)"
        spellcheck="false"
      />

      <label class="fb-hidden-toggle" :title="t.fb_show_hidden_title">
        <input type="checkbox" v-model="showHidden" @change="loadDir(currentPath)" />
        <span>{{ t.fb_hidden_files }}</span>
      </label>

      <button class="fb-tool-btn" :class="{ active: mkdirOpen }" :title="t.fb_new_folder" @click="openMkdirForm">
        <AppIcon name="folder-plus" />
      </button>

      <button class="fb-tool-btn fb-upload-btn" :class="{ active: uploading }" :title="t.fb_upload_title" @click="openUploadPicker">
        <AppIcon v-if="uploading" name="spinner" spin />
        <AppIcon v-else name="upload" />
        <span class="fb-tool-label">{{ t.fb_upload }}</span>
      </button>
      <input ref="uploadInput" type="file" multiple class="fb-file-input" @change="onUploadSelect" />

      <button class="fb-close-btn" @click="$emit('close')" :title="t.fb_close"><AppIcon name="close" /></button>

      <form v-if="mkdirOpen" class="fb-mkdir-form" @submit.prevent="createFolder">
        <input
          ref="mkdirInput"
          v-model="mkdirName"
          class="fb-mkdir-input"
          :placeholder="t.fb_new_folder"
          spellcheck="false"
          @keyup.esc="cancelMkdir"
        />
        <button class="fb-mkdir-action primary" :disabled="creatingDir || !mkdirName.trim()" :title="t.fb_create" type="submit">
          <AppIcon name="check" />
        </button>
        <button class="fb-mkdir-action" :title="t.cancel" type="button" @click="cancelMkdir">
          <AppIcon name="close" />
        </button>
      </form>
    </div>

    <!-- ── 主体 ─────────────────────────────────────────────────── -->
    <div class="fb-body">

      <!-- 文件列表 -->
      <div class="fb-list-panel">
        <div v-if="loading" class="fb-status">{{ t.fb_loading }}</div>
        <div v-else-if="error" class="fb-status fb-status-err">{{ error }}</div>
        <div v-else class="fb-entries">
          <!-- 向上一级 -->
          <div v-if="parentPath" class="fb-entry fb-dir" role="button" tabindex="0" @click="navigateTo(parentPath)" @keydown.enter.space.self.prevent="navigateTo(parentPath)">
            <span class="fb-icon fb-icon-dir"><AppIcon name="parent" /></span>
            <span class="fb-name">..</span>
          </div>
          <div v-if="!entries.length" class="fb-status">{{ t.fb_empty_dir }}</div>
          <div v-if="listTruncated" class="fb-status">{{ t.fb_list_truncated.replace('{n}', entries.length).replace('{total}', listTruncated) }}</div>
          <!-- 条目 -->
          <div
            v-for="entry in entries"
            :key="entry.name"
            class="fb-entry"
            :class="{ 'fb-dir': entry.type === 'dir', 'fb-selected': selectedEntry?.name === entry.name }"
            role="button" tabindex="0"
            @click="selectEntry(entry)"
            @dblclick="onDblClick(entry)"
            @keydown.enter.space.self.prevent="selectEntry(entry)"
          >
            <span class="fb-icon" :class="entry.type === 'dir' ? 'fb-icon-dir' : 'fb-icon-file'">
              <AppIcon :name="entry.type === 'dir' ? 'folder' : fileIconName(entry.ext)" />
            </span>
            <span class="fb-name" :title="entry.name">{{ entry.name }}</span>
            <span class="fb-meta">
              <span v-if="entry.type === 'file'" class="fb-size">{{ fmtSize(entry.size) }}</span>
              <button v-if="entry.type === 'file'" class="fb-copy-btn" :title="t.fb_download_file" @click.stop="downloadEntry(entry)">
                <AppIcon name="download" />
              </button>
              <button class="fb-copy-btn" :title="t.fb_copy_path" @click.stop="copyPath(entry)">
                <AppIcon name="copy" />
              </button>
            </span>
          </div>
        </div>
      </div>

      <!-- 预览面板 -->
      <div class="fb-preview-panel">
        <div v-if="!preview.show" class="fb-preview-empty">
          <AppIcon name="empty" class="fb-preview-empty-icon" />
          <div>{{ t.fb_preview_hint }}</div>
        </div>
        <template v-else>
          <div class="fb-preview-header">
            <span class="fb-preview-filename">{{ selectedEntry?.name }}</span>
            <span class="fb-preview-ext" v-if="selectedEntry?.ext">{{ selectedEntry.ext }}</span>
            <span class="fb-preview-size">{{ fmtSize(preview.size) }}</span>
            <span v-if="preview.truncated" class="fb-preview-truncated">{{ t.fb_truncated }}</span>
            <button class="fb-preview-fullscreen" :title="t.fb_fullscreen" @click="fullscreen = true">
              <AppIcon name="fullscreen" />
            </button>
            <button class="fb-preview-copy" :title="t.fb_download_file" @click="downloadEntry(selectedEntry)">
              <AppIcon name="download" /> {{ t.fb_download }}
            </button>
            <button class="fb-preview-copy" :title="t.fb_copy_file_path" @click="copyPath(selectedEntry)">
              <AppIcon name="copy" /> {{ t.fb_copy_path }}
            </button>
          </div>
          <div v-if="preview.loading" class="fb-preview-loading">{{ t.fb_loading }}</div>
          <div v-else-if="preview.type === 'text'" class="fb-preview-code">
            <div class="fb-code-wrap">
              <div class="fb-line-nums" aria-hidden="true">
                <span v-for="n in lineCount" :key="n">{{ n }}</span>
              </div>
              <pre class="fb-code-content">{{ preview.content }}</pre>
            </div>
          </div>
          <div v-else-if="preview.type === 'image'" class="fb-preview-img">
            <img :src="preview.dataUrl" :alt="selectedEntry?.name" />
          </div>
          <div v-else class="fb-preview-unsupported">
            <AppIcon :name="fileIconName(selectedEntry?.ext)" class="fb-unsupported-icon" />
            <div class="fb-unsupported-name">{{ selectedEntry?.name }}</div>
            <div class="fb-unsupported-info">
              <span v-if="preview.type === 'image_too_large'">{{ t.fb_image_too_large.replace('{size}', fmtSize(preview.size)) }}</span>
              <span v-else>{{ fmtSize(preview.size) }} · {{ t.fb_binary_file }}</span>
            </div>
            <button class="fb-copy-path-btn" @click="copyPath(selectedEntry)"><AppIcon name="copy" /> {{ t.fb_copy_path }}</button>
            <button class="fb-copy-path-btn" @click="downloadEntry(selectedEntry)"><AppIcon name="download" /> {{ t.fb_download }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="uploading && uploadProgress.name" class="fb-upload-progress">
      <div class="fb-upload-progress-text">
        <span class="fb-upload-progress-name">{{ uploadProgress.name }}</span>
        <span>{{ uploadProgress.total > 1 ? `${uploadProgress.index}/${uploadProgress.total} · ` : '' }}{{ uploadProgress.percent }}%</span>
        <button class="fb-upload-cancel" :title="t.fb_cancel_upload" @click.stop="cancelUpload"><AppIcon name="close" /></button>
      </div>
      <div class="fb-upload-progress-track"><div class="fb-upload-progress-bar" :style="{ width: uploadProgress.percent + '%' }"></div></div>
      <div class="fb-upload-progress-detail">
        <span>{{ formatBytes(uploadProgress.loaded) }} / {{ formatBytes(uploadProgress.size) }}</span>
        <span v-if="uploadProgress.loaded >= uploadProgress.size && uploadProgress.size">{{ t.fb_server_processing }}</span>
        <span v-else-if="uploadProgress.speed > 0">{{ formatBytes(uploadProgress.speed) }}/s · {{ t.fb_remaining.replace('{eta}', formatDuration(uploadProgress.eta)) }}</span>
      </div>
    </div>
    <transition name="fb-toast-fade">
      <div v-if="copyToast && !(uploading && uploadProgress.name)" class="fb-toast">{{ copyToast }}</div>
    </transition>
    <div v-if="dragOver" class="fb-drag-overlay">
      <AppIcon name="upload" />
      <span>{{ t.fb_drop_hint.replace('{path}', currentPath || '/') }}</span>
    </div>

    <!-- ── 全屏预览 ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="fullscreen" class="fb-fs-overlay" @click.self="fullscreen = false">
        <div class="fb-fs-box">
          <!-- 全屏头部 -->
          <div class="fb-fs-header">
            <span class="fb-preview-filename">{{ selectedEntry?.name }}</span>
            <span class="fb-preview-ext" v-if="selectedEntry?.ext">{{ selectedEntry.ext }}</span>
            <span class="fb-preview-size">{{ fmtSize(preview.size) }}</span>
            <span v-if="preview.truncated" class="fb-preview-truncated">{{ t.fb_truncated }}</span>
            <button class="fb-preview-copy" @click="downloadEntry(selectedEntry)"><AppIcon name="download" /> {{ t.fb_download }}</button>
            <button class="fb-preview-copy" @click="copyPath(selectedEntry)"><AppIcon name="copy" /> {{ t.fb_copy_path }}</button>
            <button class="fb-fs-close" @click="fullscreen = false" :title="t.fb_close_fullscreen"><AppIcon name="close" /></button>
          </div>
          <!-- 全屏内容（复用同一份 preview 数据，无需重新请求） -->
          <div v-if="preview.loading" class="fb-preview-loading">{{ t.fb_loading }}</div>
          <div v-else-if="preview.type === 'text'" class="fb-preview-code fb-fs-content">
            <div class="fb-code-wrap">
              <div class="fb-line-nums" aria-hidden="true">
                <span v-for="n in lineCount" :key="n">{{ n }}</span>
              </div>
              <pre class="fb-code-content">{{ preview.content }}</pre>
            </div>
          </div>
          <div v-else-if="preview.type === 'image'" class="fb-preview-img fb-fs-content">
            <img :src="preview.dataUrl" :alt="selectedEntry?.name" />
          </div>
          <div v-else class="fb-preview-unsupported fb-fs-content">
            <AppIcon :name="fileIconName(selectedEntry?.ext)" class="fb-unsupported-icon" />
            <div class="fb-unsupported-name">{{ selectedEntry?.name }}</div>
            <div class="fb-unsupported-info">
              <span v-if="preview.type === 'image_too_large'">{{ t.fb_image_too_large.replace('{size}', fmtSize(preview.size)) }}</span>
              <span v-else>{{ fmtSize(preview.size) }} · {{ t.fb_binary_file }}</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { api, formatBytes, formatDuration } from '../api/index.js';
import AppIcon from './AppIcon.vue';
import { useI18n } from '../i18n.js';

const props = defineProps({
  initialPath: { type: String, default: '' },
});
const emit = defineEmits(['close', 'path-change']);
const { t } = useI18n();

// ── State ─────────────────────────────────────────────────────────────────────
const currentPath   = ref('');
const entries       = ref([]);
const listTruncated = ref(0);   // 服务端截断时的总条目数
const showHidden    = ref(false);
const selectedEntry = ref(null);
const loading       = ref(false);
const error         = ref('');
const pathInput     = ref('');
const copyToast     = ref('');
const fullscreen    = ref(false);
const uploading     = ref(false);
const uploadInput   = ref(null);
const EMPTY_PROGRESS = { name: '', index: 0, total: 0, percent: 0, loaded: 0, size: 0, speed: 0, eta: NaN };
const uploadProgress = reactive({ ...EMPTY_PROGRESS });
let uploadAbort = null;
const dragOver      = ref(false);
const mkdirOpen     = ref(false);
const mkdirName     = ref('');
const mkdirInput    = ref(null);
const creatingDir   = ref(false);

const preview = reactive({
  show:      false,
  loading:   false,
  type:      '',
  content:   '',
  dataUrl:   '',
  truncated: false,
  size:      0,
});

// ESC 关闭全屏
function onKeydown(e) {
  if (e.key === 'Escape' && fullscreen.value) fullscreen.value = false;
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  uploadAbort?.abort();
});

// ── 面包屑 ────────────────────────────────────────────────────────────────────
const breadcrumbs = computed(() => {
  const p = currentPath.value;
  if (!p) return [];
  const parts = p.split('/').filter(Boolean);
  const crumbs = [{ label: '/', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += '/' + part;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
});

const parentPath = computed(() => {
  const p = currentPath.value;
  if (!p || p === '/') return '';
  return p.split('/').slice(0, -1).join('/') || '/';
});

const lineCount = computed(() => {
  if (preview.type !== 'text' || !preview.content) return 0;
  return preview.content.split('\n').length;
});

// ── 目录加载 ──────────────────────────────────────────────────────────────────
// 连续切换目录时，晚到的旧响应不能覆盖当前目录（否则上传等操作会落到错误目录）
let dirToken = 0;
async function loadDir(reqPath) {
  loading.value = true;
  error.value   = '';
  entries.value = [];
  listTruncated.value = 0;
  selectedEntry.value = null;
  preview.show  = false;
  fullscreen.value = false;
  const tok = ++dirToken;
  try {
    const res = await api.fs.list(reqPath || '/', showHidden.value);
    if (tok !== dirToken) return;
    currentPath.value = res.path;
    pathInput.value   = res.path;
    entries.value     = res.entries;
    listTruncated.value = res.truncated ? (res.total || res.entries.length) : 0;
    emit('path-change', res.path);
  } catch (e) {
    if (tok === dirToken) error.value = e.message || t.value.fb_load_failed;
  } finally {
    if (tok === dirToken) loading.value = false;
  }
}

function navigateTo(p) {
  if (p) loadDir(p);
}

// ── 条目交互 ──────────────────────────────────────────────────────────────────
function selectEntry(entry) {
  if (entry.type === 'dir') {
    // 单击/单击进入目录，移动端无需双击（双击在触屏上常被吞掉）
    navigateTo(fullPath(entry));
    return;
  }
  selectedEntry.value = entry;
  loadPreview(entry);
}

function onDblClick(entry) {
  if (entry.type === 'dir') return; // 目录已在单击时进入
  // 文件双击：已有预览则直接全屏，否则先加载再全屏
  if (preview.show && selectedEntry.value?.name === entry.name && !preview.loading) {
    fullscreen.value = true;
  } else {
    selectEntry(entry);
    // 等加载完成后自动全屏
    const stop = watch(() => preview.loading, (loading) => {
      if (!loading) { fullscreen.value = true; stop(); }
    });
  }
}

let previewToken = 0;
async function loadPreview(entry) {
  const fp = fullPath(entry);
  const token = ++previewToken;
  preview.show    = true;
  preview.loading = true;
  preview.content = '';
  preview.dataUrl = '';
  preview.type    = '';
  preview.truncated = false;
  preview.size    = entry.size ?? 0;
  try {
    const res = await api.fs.read(fp);
    if (token !== previewToken) return; // 已有更新的预览请求，丢弃过期结果
    preview.type      = res.type;
    preview.content   = res.content   || '';
    preview.dataUrl   = res.dataUrl   || '';
    preview.truncated = res.truncated || false;
    preview.size      = res.size ?? entry.size ?? 0;
  } catch (_) {
    if (token !== previewToken) return;
    preview.type = 'unsupported';
  } finally {
    if (token === previewToken) preview.loading = false;
  }
}

// ── 复制路径 ──────────────────────────────────────────────────────────────────
function fullPath(entry) {
  if (!entry) return '';
  const base = currentPath.value || '';
  if (base === '/') return `/${entry.name}`;
  return `${base.replace(/\/+$/, '')}/${entry.name}`;
}

let toastTimer = null;
async function copyPath(entry) {
  const p = fullPath(entry);
  if (!p) {
    showToast(t.value.fb_copy_failed);
    return;
  }
  if (await copyText(p)) {
    showToast(p);
    return;
  }
  showToast(t.value.fb_copy_failed);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  return fallbackCopyText(text);
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (_) {
    copied = false;
  } finally {
    document.body.removeChild(ta);
  }
  return copied;
}

function openUploadPicker() {
  uploadInput.value?.click();
}

function openMkdirForm() {
  mkdirOpen.value = true;
  if (!mkdirName.value.trim()) mkdirName.value = 'new-folder';
  nextTick(() => {
    mkdirInput.value?.focus();
    mkdirInput.value?.select();
  });
}

function cancelMkdir() {
  mkdirOpen.value = false;
  mkdirName.value = '';
}

async function createFolder() {
  const name = mkdirName.value.trim();
  if (!name || creatingDir.value) return;
  creatingDir.value = true;
  try {
    const created = await api.fs.mkdir(currentPath.value || '/', name);
    cancelMkdir();
    await loadDir(currentPath.value || '/');
    const entry = entries.value.find(item => item.type === 'dir' && item.name === created.name);
    if (entry) selectEntry(entry);
    showToast(t.value.fb_folder_created.replace('{name}', created.name));
  } catch (err) {
    showToast(t.value.fb_create_failed.replace('{msg}', err.message || err));
  } finally {
    creatingDir.value = false;
  }
}

async function onUploadSelect(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  await uploadFiles(files);
}

async function onDropUpload(e) {
  dragOver.value = false;
  const files = Array.from(e.dataTransfer?.files || []);
  await uploadFiles(files);
}

async function uploadFiles(files) {
  if (!files.length) return;
  if (uploading.value) {
    showToast(t.value.fb_upload_busy);
    return;
  }
  const targetDir = currentPath.value || '/';
  const abort = new AbortController();
  uploadAbort = abort;
  uploading.value = true;
  let ok = 0;
  const failed = [];
  try {
    for (let i = 0; i < files.length && !abort.signal.aborted; i++) {
      const file = files[i];
      Object.assign(uploadProgress, { ...EMPTY_PROGRESS, name: file.name, index: i + 1, total: files.length, size: file.size });
      try {
        await api.fs.upload(targetDir, file, {
          signal: abort.signal,
          onProgress: (loaded, total, { speed, eta }) => {
            Object.assign(uploadProgress, {
              percent: total ? Math.min(100, Math.floor(loaded / total * 100)) : 0,
              loaded, size: total, speed, eta,
            });
          },
        });
        ok++;
      } catch (err) {
        if (!abort.signal.aborted) failed.push({ name: file.name, message: err?.message || String(err) });
      }
    }
  } finally {
    if (uploadAbort === abort) uploadAbort = null;
    uploading.value = false;
    Object.assign(uploadProgress, EMPTY_PROGRESS);
    if ((currentPath.value || '/') === targetDir) await loadDir(targetDir);
  }
  if (abort.signal.aborted) {
    showToast(ok ? t.value.fb_upload_cancelled_partial.replace('{n}', ok) : t.value.fb_upload_cancelled);
  } else if (!failed.length) {
    showToast(t.value.fb_upload_done.replace('{n}', ok));
  } else if (ok) {
    showToast(t.value.fb_upload_partial.replace('{n}', ok).replace('{m}', failed.length).replace('{names}', failed.map(f => f.name).join(', ')));
  } else if (failed.length === 1) {
    showToast(t.value.fb_upload_failed.replace('{msg}', `${failed[0].name} (${failed[0].message})`));
  } else {
    showToast(t.value.fb_upload_failed.replace('{msg}', failed.map(f => f.name).join(', ')));
  }
}

function cancelUpload() {
  uploadAbort?.abort();
}

async function downloadEntry(entry) {
  const p = fullPath(entry);
  if (!entry || entry.type !== 'file' || !p) {
    showToast(t.value.fb_download_failed);
    return;
  }
  try {
    // 先确认文件可访问，出错时能给出提示，而不是让浏览器下载一个错误页
    await api.fs.stat(p);
    const a = document.createElement('a');
    a.href = api.fs.downloadUrl(p);
    a.download = entry.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(t.value.fb_downloading.replace('{name}', entry.name));
  } catch (err) {
    showToast(t.value.fb_download_failed_msg.replace('{msg}', err.message || err));
  }
}

function showToast(msg) {
  copyToast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { copyToast.value = ''; }, 2500);
}

// ── 格式化 ────────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  return formatBytes(bytes);
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);
function fileIconName(ext) {
  return IMAGE_EXTS.has((ext || '').toLowerCase()) ? 'image' : 'file';
}

onMounted(() => loadDir(props.initialPath || '/'));

watch(() => props.initialPath, (newPath) => {
  if (newPath && newPath !== currentPath.value) loadDir(newPath);
});
</script>

<style scoped>
.fb-root {
  display: flex; flex-direction: column;
  height: 100%; background: transparent; color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
  position: relative; overflow: hidden;
}
.fb-root.fb-drag-over .fb-body {
  filter: brightness(0.86);
}

/* ── 工具栏 ─────────────────────────────────────── */
.fb-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: var(--panel);
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  border-bottom: 1px solid var(--hairline); flex-shrink: 0;
  min-height: 40px; flex-wrap: wrap;
  box-shadow: inset 0 -1px 0 color-mix(in srgb, #ffffff 4%, transparent);
}

.fb-breadcrumb {
  display: flex; align-items: center; flex-shrink: 0;
  max-width: 34%; overflow: hidden; gap: 1px;
  padding: 0 4px;
}
.fb-crumb {
  cursor: pointer; color: var(--muted); font-size: 11px;
  padding: 2px 4px; border-radius: var(--radius-sm);
  transition: color .12s, background .12s; white-space: nowrap;
}
.fb-crumb:hover { color: var(--neon); background: color-mix(in srgb, var(--neon) 8%, transparent); }
.fb-crumb:not(:last-child)::after { content: '/'; color: var(--muted); opacity: .4; margin-left: 1px; }
.fb-crumb:last-child { color: var(--text); }

.fb-path-input {
  flex: 1; min-width: 150px;
  background: var(--input-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-family: inherit; font-size: 12px;
  padding: 6px 10px; outline: none; transition: border-color .15s, box-shadow .15s, background .15s;
}
.fb-path-input:focus {
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--input-bg) 84%, var(--panel2));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 8%, transparent);
}

.fb-hidden-toggle {
  display: flex; align-items: center; gap: 4px;
  cursor: pointer; color: var(--muted); font-size: 11px;
  flex-shrink: 0; white-space: nowrap;
  padding: 0 3px;
}
.fb-hidden-toggle input { accent-color: var(--neon); }

.fb-tool-btn {
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-size: 13px; width: 28px; height: 26px;
  cursor: pointer; transition: color .12s, border-color .12s, background .12s, transform .12s;
  flex-shrink: 0; line-height: 1; overflow: visible;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  --app-icon-size: 15px;
}
.fb-tool-btn:hover,
.fb-tool-btn.active {
  color: var(--neon); border-color: var(--border-strong);
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  transform: translateY(-1px);
}
.fb-upload-btn {
  width: auto;
  min-width: 58px;
  padding: 0 8px;
}
.fb-tool-label {
  font-size: 11px;
  line-height: 1;
}
.fb-file-input { display: none; }

.fb-mkdir-form {
  display: flex; align-items: center; gap: 5px;
  flex-basis: 100%;
  min-width: 0;
  padding-top: 2px;
}
.fb-mkdir-input {
  flex: 1; min-width: 140px;
  background: var(--input-bg); color: var(--text);
  border: 1px solid color-mix(in srgb, var(--neon) 30%, transparent);
  border-radius: var(--radius-sm);
  font-family: inherit; font-size: 12px;
  padding: 5px 8px; outline: none;
}
.fb-mkdir-input:focus { border-color: var(--border-strong); }
.fb-mkdir-action {
  width: 28px; height: 26px; flex-shrink: 0;
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); cursor: pointer; line-height: 1; overflow: visible;
  display: inline-flex; align-items: center; justify-content: center;
  transition: color .12s, border-color .12s, background .12s, opacity .12s;
  --app-icon-size: 15px;
}
.fb-mkdir-action.primary {
  color: var(--neon);
  border-color: color-mix(in srgb, var(--neon) 45%, transparent);
}
.fb-mkdir-action:hover:not(:disabled) {
  color: var(--neon);
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--neon) 8%, transparent);
}
.fb-mkdir-action:disabled { opacity: .45; cursor: not-allowed; }

.fb-close-btn {
  background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 14px; padding: 3px 7px;
  border-radius: var(--radius-sm); flex-shrink: 0; transition: color .15s, background .15s;
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 1; overflow: visible; --app-icon-size: 15px;
}
.fb-close-btn:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }

/* ── 主体 ────────────────────────────────────────── */
.fb-body { flex: 1; min-height: 0; display: flex; overflow: hidden; }

/* ── 文件列表 ─────────────────────────────────────── */
.fb-list-panel {
  width: clamp(260px, 24vw, 340px); min-width: 210px; flex-shrink: 0;
  border-right: 1px solid var(--hairline);
  background: color-mix(in srgb, var(--panel) 70%, transparent);
  overflow-y: auto; overflow-x: hidden;
}
.fb-entries { padding: 7px; }

.fb-status { color: var(--muted); padding: 20px 12px; text-align: center; font-size: 12px; }
.fb-status-err { color: var(--danger); text-align: left; }

.fb-entry {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 7px; border-radius: var(--radius-sm); cursor: pointer;
  border: 1px solid transparent;
  transition: background .1s, border-color .1s; user-select: none;
  position: relative;
}
.fb-entry:hover { background: color-mix(in srgb, var(--neon) 7%, transparent); border-color: color-mix(in srgb, var(--border) 65%, transparent); }
.fb-entry.fb-selected {
  background: color-mix(in srgb, var(--neon) 12%, transparent);
  border-color: color-mix(in srgb, var(--neon) 24%, transparent);
}
.fb-entry.fb-selected::before {
  content: '';
  position: absolute;
  left: -1px; top: 5px; bottom: 5px;
  width: 2px;
  border-radius: 0 999px 999px 0;
  background: var(--neon);
}

.fb-icon {
  width: 18px; text-align: center; flex-shrink: 0; font-size: 16px;
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 1; overflow: visible; --app-icon-size: 16px;
}
.fb-icon-dir { color: var(--neon); }
.fb-icon-file { color: var(--muted); }

.fb-name {
  flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px;
}
.fb-dir .fb-name { color: var(--neon); }

.fb-meta { display: flex; align-items: center; gap: 4px; flex-shrink: 0; opacity: 0; transition: opacity .1s; }
.fb-entry:hover .fb-meta,
.fb-entry.fb-selected .fb-meta { opacity: 1; }

.fb-size { color: var(--muted); font-size: 10px; white-space: nowrap; }

.fb-copy-btn {
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-size: 13px; padding: 0; line-height: 1;
  width: 22px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: color .1s, border-color .1s;
  overflow: visible; --app-icon-size: 13px;
}
.fb-copy-btn:hover { color: var(--neon); border-color: var(--border-strong); }

/* ── 预览面板 ─────────────────────────────────────── */
.fb-preview-panel {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  overflow: hidden;
  background: var(--bg);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 24%, transparent), transparent 110px),
    color-mix(in srgb, var(--bg) 94%, #00000008);
}

.fb-preview-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; color: var(--muted); font-size: 12px;
  text-align: center;
}
.fb-preview-empty-icon { font-size: 32px; opacity: .55; --app-icon-size: 32px; }

.fb-preview-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: var(--panel);
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  border-bottom: 1px solid var(--hairline); flex-shrink: 0;
  font-size: 11px; min-height: 34px; flex-wrap: wrap;
}
.fb-preview-filename { color: var(--text); font-weight: bold; font-size: 12px; }
.fb-preview-ext {
  background: color-mix(in srgb, var(--neon) 12%, transparent);
  color: var(--neon); font-size: 10px; padding: 1px 5px;
  border-radius: var(--radius-sm); border: 1px solid color-mix(in srgb, var(--neon) 25%, transparent);
}
.fb-preview-size { color: var(--muted); }
.fb-preview-truncated {
  color: var(--warning); font-size: 10px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  padding: 1px 5px; border-radius: var(--radius-sm);
}
.fb-preview-fullscreen {
  margin-left: auto;
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-size: 14px; padding: 0; cursor: pointer;
  width: 28px; height: 26px; line-height: 1; overflow: visible;
  display: inline-flex; align-items: center; justify-content: center;
  transition: color .12s, border-color .12s;
  --app-icon-size: 16px;
}
.fb-preview-fullscreen:hover { color: var(--neon); border-color: var(--border-strong); }
.fb-preview-copy {
  margin-left: 0;
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-size: 11px; padding: 2px 8px; cursor: pointer;
  font-family: inherit; transition: color .12s, border-color .12s; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 5px;
  line-height: 1; overflow: visible; --app-icon-size: 13px;
}
.fb-preview-copy:hover { color: var(--neon); border-color: var(--border-strong); }

.fb-preview-loading {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: 12px;
}

.fb-preview-code { flex: 1; overflow: auto; background: transparent; }
.fb-code-wrap { display: flex; min-height: 100%; }
.fb-line-nums {
  display: flex; flex-direction: column;
  padding: 14px 10px 14px 14px;
  text-align: right; user-select: none;
  border-right: 1px solid var(--hairline);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 78%, transparent); flex-shrink: 0;
}
.fb-line-nums span {
  font-size: 11px; line-height: 20px;
  color: var(--muted); opacity: .5;
  font-family: 'JetBrains Mono', monospace;
}
.fb-code-content {
  flex: 1; margin: 0; padding: 14px 16px;
  white-space: pre; overflow-x: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; line-height: 20px; color: var(--text); tab-size: 2;
}

.fb-preview-img {
  flex: 1; overflow: auto;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 20px; background: var(--bg);
  background: color-mix(in srgb, var(--bg) 74%, #00000010);
}
.fb-preview-img img {
  max-width: 100%; object-fit: contain;
  border-radius: var(--radius-sm); box-shadow: 0 4px 24px #00000040;
}

.fb-preview-unsupported {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; color: var(--muted);
}
.fb-unsupported-icon { font-size: 34px; opacity: .55; --app-icon-size: 34px; }
.fb-unsupported-name { color: var(--text); font-size: 13px; }
.fb-unsupported-info { font-size: 11px; }
.fb-copy-path-btn {
  margin-top: 8px;
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-size: 12px; padding: 5px 14px; cursor: pointer;
  font-family: inherit; transition: color .12s, border-color .12s;
  display: inline-flex; align-items: center; gap: 6px;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
}
.fb-copy-path-btn:hover { color: var(--neon); border-color: var(--border-strong); }

/* ── 全屏预览 ─────────────────────────────────────── */
.fb-fs-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background-color: var(--overlay);
  background: var(--overlay);
  display: flex; align-items: stretch;
}
.fb-fs-box {
  flex: 1; display: flex; flex-direction: column;
  background-color: var(--bg);
  background: var(--bg); overflow: hidden;
}
.fb-fs-header {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; background: var(--panel);
  border-bottom: 1px solid var(--hairline); flex-shrink: 0;
  font-size: 11px; flex-wrap: wrap;
}
.fb-fs-close {
  margin-left: auto;
  background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 16px; padding: 2px 8px;
  border-radius: var(--radius-sm); transition: color .15s, background .15s;
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 1; overflow: visible; --app-icon-size: 16px;
}
.fb-fs-close:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.fb-fs-content { flex: 1; min-height: 0; }

/* ── Toast ───────────────────────────────────────── */
.fb-toast {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1px solid var(--border-strong);
  color: var(--text); font-size: 11px; padding: 6px 16px;
  border-radius: 999px; pointer-events: none;
  max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  box-shadow: var(--shadow);
}
.fb-upload-progress {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  width: min(360px, 84%);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 94%, transparent);
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  padding: 8px 12px; box-shadow: var(--shadow);
  font-size: 11px; color: var(--text);
}
.fb-upload-progress-text { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.fb-upload-progress-name { flex: 1; }
.fb-upload-progress-detail {
  display: flex; gap: 8px; justify-content: space-between; margin-top: 5px;
  color: var(--muted); font-variant-numeric: tabular-nums;
}
.fb-upload-cancel {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; flex: none;
  border: none; border-radius: 4px; background: transparent; color: inherit; cursor: pointer;
  --app-icon-size: 12px;
}
.fb-upload-cancel:hover { background: var(--panel2); color: var(--danger); }
.fb-upload-progress-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.fb-upload-progress-track { height: 4px; border-radius: 2px; background: var(--panel2); overflow: hidden; }
.fb-upload-progress-bar { height: 100%; background: var(--neon); transition: width .2s; }
.fb-toast-fade-enter-active { transition: opacity .15s, transform .15s; }
.fb-toast-fade-leave-active { transition: opacity .2s, transform .2s; }
.fb-toast-fade-enter-from  { opacity: 0; transform: translateX(-50%) translateY(8px); }
.fb-toast-fade-leave-to    { opacity: 0; transform: translateX(-50%) translateY(8px); }

.fb-drag-overlay {
  position: absolute; inset: 48px 18px 18px;
  z-index: 20;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  border: 1px dashed color-mix(in srgb, var(--neon) 70%, transparent);
  border-radius: var(--radius);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 86%, transparent);
  color: var(--neon);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  pointer-events: none;
  box-shadow: 0 0 24px var(--glow);
}
.fb-drag-overlay .app-icon {
  font-size: 22px;
  --app-icon-size: 22px;
}

@media (max-width: 760px) {
  .fb-toolbar {
    gap: 6px;
    padding: 7px 8px;
  }
  .fb-breadcrumb {
    order: 1;
    max-width: calc(100% - 84px);
  }
  .fb-path-input {
    order: 3;
    flex-basis: 100%;
    min-width: 0;
  }
  .fb-hidden-toggle { order: 4; }
  .fb-tool-btn,
  .fb-close-btn { order: 2; }
  .fb-upload-btn { min-width: 34px; }
  .fb-upload-btn .fb-tool-label { display: none; }
  .fb-body {
    flex-direction: column;
  }
  .fb-list-panel {
    width: 100%;
    min-width: 0;
    height: min(40vh, 330px);
    border-right: none;
    border-bottom: 1px solid var(--hairline);
  }
  .fb-preview-panel {
    min-height: 0;
  }
  .fb-preview-header {
    gap: 6px;
  }
  .fb-preview-filename {
    max-width: 52vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
