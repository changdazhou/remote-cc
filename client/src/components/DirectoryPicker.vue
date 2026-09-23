<template>
  <div class="dp-root">
    <div class="dp-toolbar">
      <div class="dp-crumbs">
        <button
          v-for="crumb in breadcrumbs"
          :key="crumb.path"
          class="dp-crumb"
          @click="loadDir(crumb.path)"
        >
          {{ crumb.label }}
        </button>
      </div>
      <input
        v-model="pathInput"
        class="dp-input"
        spellcheck="false"
        @keyup.enter="loadDir(pathInput)"
      />
      <label class="dp-hidden" title="显示隐藏目录">
        <input type="checkbox" v-model="showHidden" @change="loadDir(currentPath)" />
        <span>隐藏</span>
      </label>
      <div class="dp-create">
        <input
          v-model="newDirName"
          class="dp-create-input"
          placeholder="新建目录"
          spellcheck="false"
          @keyup.enter="createDir"
        />
        <button
          class="dp-create-btn"
          :disabled="creating || !newDirName.trim()"
          title="新建目录"
          @click="createDir"
        >
          <AppIcon v-if="creating" name="spinner" spin />
          <AppIcon v-else name="folder-plus" />
        </button>
      </div>
      <button class="dp-select" @click="selectPath(selectedPath || currentPath)">选择当前</button>
      <button class="dp-close" title="关闭" @click="$emit('cancel')"><AppIcon name="close" /></button>
    </div>

    <div class="dp-body">
      <div v-if="loading" class="dp-status">加载中…</div>
      <div v-else-if="error" class="dp-status dp-error">{{ error }}</div>
      <template v-else>
        <button v-if="parentPath" class="dp-row dp-parent" @click="loadDir(parentPath)">
          <span class="dp-icon"><AppIcon name="parent" /></span>
          <span class="dp-name">..</span>
        </button>
        <button
          v-for="entry in dirs"
          :key="entry.name"
          class="dp-row"
          :class="{ active: fullPath(entry) === selectedPath }"
          @click="selectedPath = fullPath(entry)"
          @dblclick="loadDir(fullPath(entry))"
        >
          <span class="dp-icon"><AppIcon name="folder" /></span>
          <span class="dp-name">{{ entry.name }}</span>
          <span class="dp-actions">
            <span class="dp-action" @click.stop="loadDir(fullPath(entry))">打开</span>
            <span class="dp-action primary" @click.stop="selectPath(fullPath(entry))">选择</span>
          </span>
        </button>
        <div v-if="!dirs.length && !parentPath" class="dp-status">无目录</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api/index.js';
import AppIcon from './AppIcon.vue';

const props = defineProps({
  initialPath: { type: String, default: '/' },
});
const emit = defineEmits(['select', 'cancel']);

const currentPath = ref('');
const pathInput = ref('');
const entries = ref([]);
const selectedPath = ref('');
const showHidden = ref(false);
const loading = ref(false);
const creating = ref(false);
const error = ref('');
const newDirName = ref('');

const dirs = computed(() => entries.value.filter(entry => entry.type === 'dir'));

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

function fullPath(entry) {
  if (!entry) return '';
  if (currentPath.value === '/') return `/${entry.name}`;
  return `${currentPath.value.replace(/\/+$/, '')}/${entry.name}`;
}

async function loadDir(path) {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.fs.list(path || '/', showHidden.value);
    currentPath.value = res.path;
    pathInput.value = res.path;
    selectedPath.value = res.path;
    entries.value = res.entries;
  } catch (e) {
    error.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

async function createDir() {
  const name = newDirName.value.trim();
  if (!name || creating.value) return;
  creating.value = true;
  error.value = '';
  try {
    const res = await api.fs.mkdir(currentPath.value || '/', name);
    const nextPath = res.path || fullCreatedPath(name);
    newDirName.value = '';
    await loadDir(nextPath);
    selectedPath.value = nextPath;
  } catch (e) {
    error.value = e.message || '创建失败';
  } finally {
    creating.value = false;
  }
}

function fullCreatedPath(name) {
  if (!name) return currentPath.value || '/';
  if (currentPath.value === '/') return `/${name}`;
  return `${(currentPath.value || '/').replace(/\/+$/, '')}/${name}`;
}

function selectPath(path) {
  if (!path) return;
  emit('select', path);
}

onMounted(() => loadDir(props.initialPath || '/'));

watch(() => props.initialPath, path => {
  if (path && path !== currentPath.value) loadDir(path);
});
</script>

<style scoped>
.dp-root {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  overflow: hidden;
  box-shadow: var(--shadow), 0 0 20px color-mix(in srgb, var(--glow) 60%, transparent);
}
.dp-toolbar {
  display: flex; align-items: center; gap: 7px;
  padding: 8px;
  background: var(--panel2);
  background: color-mix(in srgb, var(--panel2) 76%, transparent);
  border-bottom: 1px solid var(--hairline);
  flex-wrap: wrap;
}
.dp-crumbs {
  display: flex; align-items: center; gap: 2px;
  max-width: 32%;
  overflow: hidden;
}
.dp-crumb {
  background: none; border: none; cursor: pointer;
  color: var(--muted); font-family: 'JetBrains Mono', monospace;
  font-size: 11px; padding: 2px 3px;
  white-space: nowrap;
}
.dp-crumb:hover { color: var(--neon); }
.dp-crumb:not(:last-child)::after { content: '/'; opacity: .35; margin-left: 3px; }
.dp-input {
  flex: 1; min-width: 160px;
  background: var(--input-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  padding: 7px 9px; outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.dp-input:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 8%, transparent);
}
.dp-hidden {
  display: flex; align-items: center; gap: 4px;
  color: var(--muted); font-size: 11px; white-space: nowrap;
}
.dp-hidden input { accent-color: var(--neon); }
.dp-create {
  display: inline-flex; align-items: center; gap: 5px;
  min-width: 170px;
}
.dp-create-input {
  width: 130px; min-width: 0;
  background: var(--input-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  height: 28px; padding: 0 8px; outline: none;
  transition: border-color .15s, box-shadow .15s, background .15s;
}
.dp-create-input:focus {
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--input-bg) 82%, var(--panel2));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 8%, transparent);
}
.dp-create-btn {
  width: 30px; height: 28px;
  background: color-mix(in srgb, var(--neon) 7%, var(--panel2));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--neon);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  transition: color .12s, border-color .12s, background .12s, transform .12s, opacity .12s;
  line-height: 1; overflow: visible; --app-icon-size: 15px;
}
.dp-create-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--neon) 13%, transparent);
  transform: translateY(-1px);
}
.dp-create-btn:disabled {
  opacity: .45; cursor: not-allowed;
}
.dp-select,
.dp-close {
  background: var(--panel2); border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); cursor: pointer;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  height: 28px; padding: 0 9px;
  transition: color .12s, border-color .12s, background .12s, transform .12s;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
}
.dp-select:hover,
.dp-close:hover {
  color: var(--neon); border-color: var(--border-strong);
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  transform: translateY(-1px);
}
.dp-body {
  max-height: min(340px, 42vh);
  overflow: auto;
  padding: 6px;
}
.dp-row {
  display: flex; align-items: center; gap: 7px;
  width: 100%;
  background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm);
  color: var(--text); cursor: pointer;
  padding: 7px 8px; text-align: left;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  transition: background .12s, border-color .12s;
}
.dp-row:hover,
.dp-row.active {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  border-color: color-mix(in srgb, var(--neon) 22%, transparent);
}
.dp-parent { color: var(--neon2); }
.dp-icon {
  width: 18px; text-align: center; color: var(--neon); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 16px;
  line-height: 1; overflow: visible; --app-icon-size: 16px;
}
.dp-name {
  flex: 1; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dp-actions {
  display: flex; align-items: center; gap: 6px;
  flex-shrink: 0; opacity: 0;
}
.dp-row:hover .dp-actions,
.dp-row.active .dp-actions { opacity: 1; }
.dp-action {
  color: var(--muted); font-size: 10px;
}
.dp-action.primary { color: var(--neon); }
.dp-status {
  padding: 16px 10px;
  color: var(--muted); font-size: 12px; text-align: center;
}
.dp-error { color: var(--danger); }
@media (max-width: 700px) {
  .dp-crumbs { max-width: 100%; width: 100%; }
  .dp-create { width: 100%; }
  .dp-create-input { flex: 1; width: auto; }
  .dp-actions { opacity: 1; }
}
</style>
