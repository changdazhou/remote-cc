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
        <label class="nc-label">Agent</label>
        <div class="nc-agent-picker">
          <button
            v-for="item in availableAgents"
            :key="item.id"
            :class="['nc-agent', { active: agent === item.id }]"
            @click="setAgent(item.id)"
          >
            {{ item.label || item.name }}
          </button>
          <span v-if="!availableAgents.length" class="nc-status-inline">
            {{ agentLoading ? t.agent_checking : t.no_agents_available }}
          </span>
        </div>
      </div>

      <div class="nc-field">
        <label class="nc-label">{{ t.work_dir }}</label>
        <div class="nc-dir-row">
          <input
            v-model="workingDir"
            class="nc-input"
            placeholder="~/"
            spellcheck="false" autocorrect="off" autocapitalize="off"
            @keyup.enter="start"
          />
          <button class="nc-browse-btn" :class="{ active: dirPickerOpen }" title="选择目录" @click="toggleDirPicker">
            <AppIcon name="folder" />
          </button>
        </div>
        <div class="nc-quickpicks">
          <button v-for="p in quickPicks" :key="p" class="nc-pick" @click="workingDir = p">{{ shortPath(p) }}</button>
        </div>
        <DirectoryPicker
          v-if="dirPickerOpen"
          :initialPath="dirPickerStart"
          @select="selectWorkingDir"
          @cancel="dirPickerOpen = false"
        />
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
        <button class="nc-start" :disabled="!canStart" @click="start">{{ t.start_btn }} <AppIcon name="play" /></button>
      </div>
    </div>

    <!-- ── Resume from history ─────────────────────────────── -->
    <div v-else class="nc-resume">
      <div class="nc-resume-toolbar">
        <div class="nc-agent-picker">
          <button
            v-for="item in availableAgents"
            :key="item.id"
            :class="['nc-agent', { active: agent === item.id }]"
            @click="setAgent(item.id)"
          >
            {{ item.label || item.name }}
          </button>
          <span v-if="!availableAgents.length" class="nc-status-inline">
            {{ agentLoading ? t.agent_checking : t.no_agents_available }}
          </span>
        </div>
      </div>
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
            <AppIcon name="chevron" class="nc-chevron" :class="{ open: expanded.has(proj.id) }" />
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
                <button class="nc-start nc-start-sm" :disabled="!canStart" @click.stop="startResume">{{ t.resume }} <AppIcon name="play" /></button>
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
import { ref, reactive, computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { api } from '../api/index.js';
import { useI18n } from '../i18n.js';
import { settings } from '../settings.js';
import DirectoryPicker from './DirectoryPicker.vue';
import AppIcon from './AppIcon.vue';

const { t } = useI18n();
const emit = defineEmits(['start', 'cancel']);
const agent = ref('claude');
const agentStatuses = ref([]);
const agentLoading = ref(true);
let agentRefreshTimer = null;

const availableAgents = computed(() => agentStatuses.value.filter(item => item.available));
const canStart = computed(() => availableAgents.value.some(item => item.id === agent.value));

function pickAvailableAgent() {
  if (canStart.value) return;
  const preferred = availableAgents.value.find(item => item.default) || availableAgents.value[0];
  if (preferred) setAgent(preferred.id);
}

async function refreshAgents() {
  agentLoading.value = true;
  try {
    const list = await api.getAgents();
    agentStatuses.value = Array.isArray(list) ? list : [];
    pickAvailableAgent();
    if (tab.value === 'resume' && !histLoaded && !histLoading.value) {
      loadHistory();
    }
  } catch (_) {
    agentStatuses.value = [];
  } finally {
    agentLoading.value = false;
  }
}

onMounted(() => {
  refreshAgents();
  agentRefreshTimer = setInterval(refreshAgents, 15000);
});

onBeforeUnmount(() => {
  clearInterval(agentRefreshTimer);
});

// ── Tab state ──────────────────────────────────────────────────────────────────
const tab = ref('new');

// ── New conversation ───────────────────────────────────────────────────────────
let lastDefaultDir = settings.newConversationDefaultDir || '~';
const workingDir  = ref(lastDefaultDir);
const sessionName = ref('');
const dirPickerOpen = ref(false);
const quickPicks  = computed(() => {
  const picks = [settings.newConversationDefaultDir || '~', '/', '~', '/tmp', '/paddle'];
  return [...new Set(picks.filter(Boolean))];
});

const dirPickerStart = computed(() => {
  const dir = workingDir.value.trim();
  return dir || '/';
});

const namePlaceholder = computed(() => {
  const base = workingDir.value.split('/').filter(Boolean).pop() || 'root';
  return base;
});

function shortPath(p) {
  return p;
}

function start() {
  if (!canStart.value) return;
  const dir  = workingDir.value.trim() || '~';
  const base = dir.split('/').filter(Boolean).pop() || 'root';
  const name = sessionName.value.trim() || base;
  emit('start', { workingDir: dir, name, agent: agent.value });
}

function toggleDirPicker() {
  dirPickerOpen.value = !dirPickerOpen.value;
}

function selectWorkingDir(path) {
  workingDir.value = path;
  dirPickerOpen.value = false;
}

watch(() => settings.newConversationDefaultDir, (next) => {
  const nextDefault = next || '~';
  if (!workingDir.value || workingDir.value === lastDefaultDir) {
    workingDir.value = nextDefault;
  }
  lastDefaultDir = nextDefault;
});

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

function setAgent(nextAgent) {
  if (agent.value === nextAgent) return;
  agent.value = nextAgent;
  projects.value = [];
  expanded.clear();
  loadingProj.clear();
  for (const key of Object.keys(projSessions)) delete projSessions[key];
  selectedSess.value = null;
  selectedProj.value = null;
  histLoaded = false;
  if (tab.value === 'resume') loadHistory();
}

async function loadHistory() {
  if (histLoaded) return;
  histLoading.value = true;
  histError.value = '';
  try {
    const loadedProjects = await api.getProjects(agent.value);
    projects.value = loadedProjects;
    histLoaded = true;
    if (agent.value === 'codex') await preloadCodexSessions(loadedProjects);
  } catch (e) {
    histError.value = e.message;
  } finally {
    histLoading.value = false;
  }
}

async function toggleProj(id) {
  if (expanded.has(id)) { expanded.delete(id); return; }
  expanded.add(id);
  await ensureProjLoaded(id);
}

async function ensureProjLoaded(id) {
  if (projSessions[id]) return;
  loadingProj.add(id);
  try {
    projSessions[id] = await api.getSessions(id, agent.value);
  } catch (_) {
    projSessions[id] = [];
  } finally {
    loadingProj.delete(id);
  }
}

async function preloadCodexSessions(projectList) {
  if (!projectList.length) return;
  for (const proj of projectList) {
    expanded.add(proj.id);
    loadingProj.add(proj.id);
  }
  try {
    const sessions = await api.getSessions('codex', agent.value);
    const byProject = Object.fromEntries(projectList.map(proj => [proj.id, []]));
    for (const sess of sessions) {
      if (!byProject[sess.projectId]) byProject[sess.projectId] = [];
      byProject[sess.projectId].push(sess);
    }
    for (const [projectId, sessionsInProject] of Object.entries(byProject)) {
      projSessions[projectId] = sessionsInProject;
    }
  } catch (_) {
    for (const proj of projectList) projSessions[proj.id] = [];
  } finally {
    for (const proj of projectList) loadingProj.delete(proj.id);
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
  if (!canStart.value) return;
  const sess = selectedSess.value;
  if (!sess) return;
  const dir  = sess.cwd || '~';
  const base = shortBase(dir);
  const name = resumeName.value.trim() || base;
  emit('start', { workingDir: dir, name, resumeSessionId: sess.sessionId, agent: agent.value });
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
  background: transparent;
}

/* ── Tabs ──────────────────────────────────── */
.nc-tabs {
  display: flex; gap: 4px; flex-shrink: 0;
  border-bottom: 1px solid var(--hairline);
  padding: 8px 16px;
  background: color-mix(in srgb, var(--panel) 76%, transparent);
}
.nc-tab {
  background: transparent; border: 1px solid transparent; cursor: pointer;
  border-radius: var(--radius-sm);
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; font-weight: 800;
  color: var(--muted); padding: 7px 14px; position: relative;
  transition: color .15s, background .15s, border-color .15s;
}
.nc-tab:hover { color: var(--text); background: color-mix(in srgb, var(--neon) 5%, transparent); border-color: var(--border); }
.nc-tab.active {
  color: var(--neon);
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border-color: var(--border-strong);
}
.nc-tab.active::after {
  content: none;
}

/* ── New card ──────────────────────────────── */
.nc-card {
  padding: 22px 18px 28px;
  display: flex; flex-direction: column; gap: 18px;
  overflow-y: auto; flex: 1;
  width: min(920px, 100%);
  margin: 0 auto;
  background: transparent;
}

.nc-field {
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--panel) 54%, transparent);
}
.nc-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; font-weight: 800;
  color: var(--muted); letter-spacing: 1.5px; text-transform: uppercase;
}
.nc-hint { font-weight: 400; opacity: .6; }

.nc-input {
  width: 100%; background: var(--input-bg); color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-family: 'JetBrains Mono', monospace; font-size: 13px;
  padding: 10px 12px; outline: none;
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.nc-input:focus {
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--input-bg) 82%, var(--panel2));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 10%, transparent);
}
.nc-input::placeholder { color: color-mix(in srgb, var(--muted) 50%, transparent); }
.nc-input-sm { font-size: 12px; padding: 7px 10px; flex: 1; }

.nc-dir-row {
  display: flex; align-items: center; gap: 8px;
}
.nc-dir-row .nc-input {
  flex: 1; min-width: 0;
}
.nc-browse-btn {
  width: 40px; height: 40px; flex-shrink: 0;
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--neon2);
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px;
  line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background .12s, border-color .12s, color .12s, box-shadow .12s;
  overflow: visible; --app-icon-size: 17px;
}
.nc-browse-btn:hover,
.nc-browse-btn.active {
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border-color: var(--border-strong);
  color: var(--neon);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 8%, transparent);
}

.nc-quickpicks { display: flex; gap: 6px; flex-wrap: wrap; }
.nc-agent-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.nc-agent {
  background: color-mix(in srgb, var(--panel2) 86%, transparent); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--muted); font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px; font-weight: 800; padding: 7px 12px; cursor: pointer;
  transition: background .12s, border-color .12s, color .12s, transform .12s;
}
.nc-agent:hover {
  border-color: color-mix(in srgb, var(--neon) 30%, transparent);
  color: var(--text);
  transform: translateY(-1px);
}
.nc-agent.active {
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border-color: var(--border-strong);
  color: var(--neon);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--neon) 14%, transparent);
}
.nc-status-inline {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: var(--radius-sm);
  color: var(--muted);
  background: color-mix(in srgb, var(--panel2) 48%, transparent);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
}
.nc-pick {
  background: color-mix(in srgb, var(--panel2) 76%, transparent); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--neon2); font-family: 'JetBrains Mono', monospace;
  font-size: 11px; padding: 3px 10px; cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.nc-pick:hover {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  border-color: color-mix(in srgb, var(--neon) 30%, transparent);
  color: var(--neon);
}

.nc-actions {
  display: flex; gap: 10px; justify-content: flex-end; margin-top: auto; padding-top: 4px;
}
.nc-cancel {
  background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px;
  padding: 9px 18px; cursor: pointer; transition: border-color .15s, color .15s;
}
.nc-cancel:hover { border-color: var(--border-strong); color: var(--text); }

.nc-start {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--neon) 16%, transparent), color-mix(in srgb, var(--neon) 8%, transparent));
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  color: var(--neon); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; font-weight: 800;
  padding: 9px 20px; cursor: pointer;
  transition: background .2s, box-shadow .2s, transform .15s;
  white-space: nowrap;
  line-height: 1; overflow: visible; --app-icon-size: 15px;
}
.nc-start:hover {
  background: color-mix(in srgb, var(--neon) 18%, transparent);
  box-shadow: 0 0 16px var(--glow);
  transform: translateY(-1px);
}
.nc-start:disabled,
.nc-start:disabled:hover {
  cursor: not-allowed;
  color: var(--muted);
  background: color-mix(in srgb, var(--panel2) 74%, transparent);
  border-color: var(--border);
  box-shadow: none;
  transform: none;
  opacity: .62;
}
.nc-start-sm { font-size: 12px; padding: 7px 14px; }

/* ── Resume panel ──────────────────────────── */
.nc-resume {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column;
  padding: 8px 0;
  background: transparent;
  scrollbar-width: thin; scrollbar-color: var(--muted) transparent;
}
.nc-resume-toolbar {
  padding: 8px 16px 12px;
  border-bottom: 1px solid var(--hairline);
  background: color-mix(in srgb, var(--panel) 65%, transparent);
}
.nc-resume-actions { padding: 12px 16px 8px; margin-top: auto; }

.nc-status {
  padding: 24px 16px; text-align: center;
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted);
}
.nc-err   { color: var(--danger); }
.nc-muted { color: var(--muted); opacity: .6; }

/* Project group */
.nc-proj {
  border-bottom: 1px solid var(--hairline);
  background: color-mix(in srgb, var(--panel) 30%, transparent);
}

.nc-proj-hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 16px; cursor: pointer;
  transition: background .12s, color .12s;
}
.nc-proj-hdr:hover { background: color-mix(in srgb, var(--neon) 6%, transparent); }

.nc-proj-path {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: var(--neon2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nc-proj-count {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--muted); background: var(--panel2);
  padding: 1px 6px; border-radius: var(--radius-sm); flex-shrink: 0;
}
.nc-chevron {
  color: var(--neon); font-size: 16px; flex-shrink: 0;
  transition: transform .2s; display: inline-block;
  transform: rotate(-90deg);
  line-height: 1; overflow: visible; --app-icon-size: 16px;
}
.nc-chevron.open { transform: rotate(0deg); }

/* Session row */
.nc-sess-loading {
  padding: 10px 24px; font-size: 11px; color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}
.nc-sess {
  padding: 10px 16px 10px 28px; cursor: pointer;
  border-top: 1px solid color-mix(in srgb, var(--hairline) 55%, transparent);
  transition: background .12s, border-color .12s;
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

@media (max-width: 520px) {
  .nc-tabs { padding: 7px 10px; }
  .nc-card { padding: 12px 10px 18px; gap: 12px; }
  .nc-field { padding: 12px; }
  .nc-dir-row { gap: 6px; }
  .nc-browse-btn { width: 38px; height: 38px; }
  .nc-actions { justify-content: stretch; }
  .nc-cancel,
  .nc-start { flex: 1; }
}
</style>
