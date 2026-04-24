<template>
  <div class="nc-root">
    <!-- Tab switcher -->
    <div class="nc-tabs">
      <button :class="['nc-tab', { active: tab === 'new' }]" @click="tab = 'new'">{{ t.new_tab }}</button>
      <button :class="['nc-tab', { active: tab === 'resume' }]" @click="tab = 'resume'; loadHistory()">{{ t.resume_tab }}</button>
    </div>

    <!-- ── New conversation ────────────────────────────────── -->
    <div v-if="tab === 'new'" class="nc-card">
      <div class="nc-field">
        <label class="nc-label">{{ t.work_dir }}</label>
        <input
          v-model="workingDir"
          class="nc-input"
          placeholder="~/"
          spellcheck="false" autocorrect="off" autocapitalize="off"
          @keyup.enter="start"
        />
        <div class="nc-quickpicks">
          <button v-for="p in quickPicks" :key="p" class="nc-pick" @click="workingDir = p">{{ shortPath(p) }}</button>
        </div>
      </div>

      <div class="nc-field">
        <label class="nc-label">{{ t.sess_name }} <span class="nc-hint">({{ t.name_hint }})</span></label>
        <input
          v-model="sessionName"
          class="nc-input"
          :placeholder="namePlaceholder"
          spellcheck="false" autocorrect="off" autocapitalize="off"
          @keyup.enter="start"
        />
      </div>

      <div class="nc-actions">
        <button class="nc-cancel" @click="$emit('cancel')">{{ t.cancel }}</button>
        <button class="nc-start" @click="start">{{ t.start_btn }}</button>
      </div>
    </div>

    <!-- ── Resume from history ─────────────────────────────── -->
    <div v-else class="nc-resume">
      <div v-if="histLoading" class="nc-status">{{ t.loading_hist }}</div>
      <div v-else-if="histError" class="nc-status nc-err">{{ histError }}</div>
      <div v-else-if="projects.length === 0" class="nc-status nc-muted">{{ t.no_history }}</div>

      <template v-else>
        <div
          v-for="proj in projects"
          :key="proj.id"
          class="nc-proj"
        >
          <!-- Project header -->
          <div class="nc-proj-hdr" @click="toggleProj(proj.id)">
            <span class="nc-proj-path">{{ proj.displayPath || proj.id }}</span>
            <span class="nc-proj-count">{{ proj.sessionCount }}</span>
            <span class="nc-chevron" :class="{ open: expanded.has(proj.id) }">›</span>
          </div>

          <!-- Sessions list -->
          <template v-if="expanded.has(proj.id)">
            <div v-if="loadingProj.has(proj.id)" class="nc-sess-loading">Loading…</div>
            <div
              v-else
              v-for="sess in (projSessions[proj.id] || [])"
              :key="sess.sessionId"
              class="nc-sess"
              :class="{ selected: selectedSess?.sessionId === sess.sessionId }"
              @click="selectSess(sess, proj)"
            >
              <div class="nc-sess-preview">{{ sess.lastMessage || t.no_preview }}</div>
              <div class="nc-sess-meta">
              <span>{{ sess.messageCount }} {{ t.msgs }}</span>
                <span>{{ fmtDate(sess.lastModified) }}</span>
              </div>
              <!-- Inline start button when selected -->
              <div v-if="selectedSess?.sessionId === sess.sessionId" class="nc-sess-actions">
                <input
                  v-model="resumeName"
                  class="nc-input nc-input-sm"
                  :placeholder="shortBase(sess.cwd)"
                  spellcheck="false"
                  @keyup.enter="startResume"
                  @click.stop
                />
                <button class="nc-start nc-start-sm" @click.stop="startResume">{{ t.resume }} ▶</button>
              </div>
            </div>
          </template>
        </div>
      </template>

      <div class="nc-actions nc-resume-actions">
        <button class="nc-cancel" @click="$emit('cancel')">{{ t.cancel }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';

const { t } = useI18n();
const emit = defineEmits(['start', 'cancel']);

// ── Tab state ──────────────────────────────────────────────────────────────────
const tab = ref('new');

// ── New conversation ───────────────────────────────────────────────────────────
const workingDir  = ref('~');
const sessionName = ref('');
const quickPicks  = ['~', '/tmp'];

const namePlaceholder = computed(() => {
  const base = workingDir.value.split('/').filter(Boolean).pop() || 'root';
  return base;
});

function shortPath(p) {
  if (p === '/paddle') return '~/';
  if (p === '/root')   return '~/';
  return p.replace(/^\//, '');
}

function start() {
  const dir  = workingDir.value.trim() || '~';
  const base = dir.split('/').filter(Boolean).pop() || 'root';
  const name = sessionName.value.trim() || base;
  emit('start', { workingDir: dir, name });
}

// ── Resume from history ────────────────────────────────────────────────────────
const projects    = ref([]);
const histLoading = ref(false);
const histError   = ref('');
const expanded    = reactive(new Set());
const loadingProj = reactive(new Set());
const projSessions = reactive({});
const selectedSess = ref(null);
const selectedProj = ref(null);
const resumeName   = ref('');
let histLoaded = false;

async function loadHistory() {
  if (histLoaded) return;
  histLoading.value = true;
  histError.value = '';
  try {
    projects.value = await api.getProjects();
    histLoaded = true;
  } catch (e) {
    histError.value = e.message;
  } finally {
    histLoading.value = false;
  }
}

async function toggleProj(id) {
  if (expanded.has(id)) { expanded.delete(id); return; }
  expanded.add(id);
  if (projSessions[id]) return;
  loadingProj.add(id);
  try {
    projSessions[id] = await api.getSessions(id);
  } catch (_) {
    projSessions[id] = [];
  } finally {
    loadingProj.delete(id);
  }
}

function selectSess(sess, proj) {
  if (selectedSess.value?.sessionId === sess.sessionId) {
    selectedSess.value = null;
    selectedProj.value = null;
    return;
  }
  selectedSess.value = sess;
  selectedProj.value = proj;
  const base = shortBase(sess.cwd);
  resumeName.value = base;
}

function startResume() {
  const sess = selectedSess.value;
  if (!sess) return;
  const dir  = sess.cwd || '~';
  const base = shortBase(dir);
  const name = resumeName.value.trim() || base;
  emit('start', { workingDir: dir, name, resumeSessionId: sess.sessionId });
}

function shortBase(p) {
  if (!p) return 'root';
  return p.split('/').filter(Boolean).pop() || 'root';
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
</script>

<style scoped>
.nc-root {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
}

/* ── Tabs ──────────────────────────────────── */
.nc-tabs {
  display: flex; gap: 0; flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
}
.nc-tab {
  background: none; border: none; cursor: pointer;
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700;
  color: var(--muted); padding: 12px 16px; position: relative;
  transition: color .15s; letter-spacing: 0.5px;
}
.nc-tab.active { color: var(--neon); }
.nc-tab.active::after {
  content: ''; position: absolute; bottom: -1px; left: 0; right: 0;
  height: 2px; background: var(--neon);
  border-radius: 2px 2px 0 0;
}

/* ── New card ──────────────────────────────── */
.nc-card {
  padding: 20px 16px;
  display: flex; flex-direction: column; gap: 18px;
  overflow-y: auto; flex: 1;
}

.nc-field { display: flex; flex-direction: column; gap: 8px; }
.nc-label {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 600;
  color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase;
}
.nc-hint { font-weight: 400; opacity: .6; }

.nc-input {
  width: 100%; background: var(--bg); color: var(--text);
  border: 1px solid color-mix(in srgb, var(--neon) 20%, transparent);
  border-radius: 7px; font-family: 'JetBrains Mono', monospace; font-size: 13px;
  padding: 10px 12px; outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.nc-input:focus {
  border-color: var(--neon);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 10%, transparent);
}
.nc-input::placeholder { color: color-mix(in srgb, var(--muted) 50%, transparent); }
.nc-input-sm { font-size: 12px; padding: 7px 10px; flex: 1; }

.nc-quickpicks { display: flex; gap: 6px; flex-wrap: wrap; }
.nc-pick {
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: 5px; color: var(--neon2); font-family: 'JetBrains Mono', monospace;
  font-size: 11px; padding: 3px 10px; cursor: pointer;
  transition: background .12s, border-color .12s;
}
.nc-pick:hover {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  border-color: color-mix(in srgb, var(--neon) 30%, transparent);
}

.nc-actions {
  display: flex; gap: 10px; justify-content: flex-end; margin-top: auto; padding-top: 4px;
}
.nc-cancel {
  background: none; border: 1px solid var(--border); border-radius: 7px;
  color: var(--muted); font-family: 'Syne', sans-serif; font-size: 12px;
  padding: 9px 18px; cursor: pointer; transition: border-color .15s, color .15s;
}
.nc-cancel:hover { border-color: var(--neon); color: var(--text); }

.nc-start {
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border: 1px solid var(--neon); border-radius: 7px;
  color: var(--neon); font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 800;
  letter-spacing: 1px; padding: 9px 20px; cursor: pointer;
  transition: background .2s, box-shadow .2s;
  white-space: nowrap;
}
.nc-start:hover {
  background: color-mix(in srgb, var(--neon) 18%, transparent);
  box-shadow: 0 0 16px var(--glow);
}
.nc-start-sm { font-size: 12px; padding: 7px 14px; }

/* ── Resume panel ──────────────────────────── */
.nc-resume {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column;
  padding: 8px 0;
  scrollbar-width: thin; scrollbar-color: var(--muted) transparent;
}
.nc-resume-actions { padding: 12px 16px 8px; margin-top: auto; }

.nc-status {
  padding: 24px 16px; text-align: center;
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted);
}
.nc-err   { color: #f38ba8; }
.nc-muted { color: var(--muted); opacity: .6; }

/* Project group */
.nc-proj { border-bottom: 1px solid var(--border); }

.nc-proj-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 16px; cursor: pointer;
  transition: background .12s;
}
.nc-proj-hdr:hover { background: color-mix(in srgb, var(--neon) 5%, transparent); }

.nc-proj-path {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: var(--neon2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nc-proj-count {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--muted); background: var(--bg3);
  padding: 1px 6px; border-radius: 3px; flex-shrink: 0;
}
.nc-chevron {
  color: var(--neon); font-size: 16px; flex-shrink: 0;
  transition: transform .2s; display: inline-block;
}
.nc-chevron.open { transform: rotate(90deg); }

/* Session row */
.nc-sess-loading {
  padding: 10px 24px; font-size: 11px; color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}
.nc-sess {
  padding: 10px 16px 10px 28px; cursor: pointer;
  border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  transition: background .12s;
}
.nc-sess:hover { background: color-mix(in srgb, var(--neon) 5%, transparent); }
.nc-sess.selected {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  border-left: 3px solid var(--neon);
  padding-left: 25px;
}
.nc-sess-preview {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nc-sess-meta {
  display: flex; gap: 10px; margin-top: 3px;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--muted);
}
.nc-sess-actions {
  display: flex; gap: 8px; align-items: center; margin-top: 8px;
}
</style>
