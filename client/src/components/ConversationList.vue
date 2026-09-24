<template>
  <div class="cl-root">
    <!-- Header row -->
    <div class="cl-header">
      <div class="cl-title">{{ t.conversations }}</div>
      <button class="cl-new-btn" @click="$emit('new')">
        <AppIcon name="plus" /> {{ t.new_btn }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="cl-empty">
      <AppIcon name="spinner" class="cl-spinner" spin /> {{ t.loading }}
    </div>

    <!-- Empty state -->
    <div v-else-if="sessions.length === 0" class="cl-empty">
      <AppIcon name="empty" class="cl-empty-icon" />
      <div class="cl-empty-title">{{ t.no_conv_title }}</div>
      <div class="cl-empty-sub">{{ t.no_conv_sub }}</div>
      <button class="cl-start-btn" @click="$emit('new')">
        <AppIcon name="plus" /> {{ t.start_conv }}
      </button>
    </div>

    <!-- Session list -->
    <div v-else class="cl-list">
      <div
        v-for="s in sessions"
        :key="s.sessionId"
        class="cl-item"
        :class="{ dead: !s.alive }"
        @click="$emit('open', s)"
      >
        <!-- Status dot -->
        <div class="cl-status" :class="s.alive ? 'live' : 'dead'" :title="s.alive ? 'Running' : 'Ended'"></div>

        <!-- Main content -->
        <div class="cl-info">
          <!-- Name row (no time here) -->
          <div class="cl-name-row">
            <span
              v-if="editingId !== s.sessionId"
              class="cl-name"
              @dblclick.stop="startEdit(s)"
            >{{ s.name }}</span>
            <input
              v-else
              class="cl-name-input"
              v-model="editVal"
              @keyup.enter="commitEdit(s)"
              @keyup.escape="cancelEdit"
              @blur="commitEdit(s)"
              @click.stop
              :ref="setEditRef"
            />
          </div>
          <!-- Meta row -->
          <div class="cl-meta">
            <span class="cl-agent">{{ agentLabel(s.agent) }}</span>
            <span class="cl-cwd">{{ shortCwd(s.workingDir) }}</span>
            <span v-if="s.extraArgs?.length" class="cl-cwd" :title="s.extraArgs.join(' ')">{{ s.extraArgs.join(' ') }}</span>
            <span v-if="(s.clientCount || 0) > 1" class="cl-attached" title="Multiple clients attached">
              <AppIcon name="users" />{{ s.clientCount }}
            </span>
          </div>
        </div>

        <!-- Right side: time + actions -->
        <div class="cl-right" @click.stop>
          <span class="cl-time">{{ timeAgo(s.lastActiveAt) }}</span>
          <div class="cl-actions">
            <button class="cl-action" :title="t.log_refresh" @click="$emit('log', s)">
              <AppIcon name="log" class="cl-act-icon" />
            </button>
            <button
              class="cl-action cl-action-close"
              :title="s.alive ? t.stop_session : t.delete_session"
              @click="s.alive ? confirmKill(s) : confirmDelete(s)"
            >
              <AppIcon :name="s.alive ? 'stop' : 'trash'" class="cl-act-icon" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm overlay -->
    <div v-if="confirm.show" class="cl-confirm-overlay" @click="confirm.show = false">
      <div class="cl-confirm-box" @click.stop>
        <div class="cl-confirm-msg">{{ confirm.msg }}</div>
        <div class="cl-confirm-btns">
          <button class="cl-confirm-cancel" @click="confirm.show = false">{{ t.cancel }}</button>
          <button class="cl-confirm-ok" @click="confirm.fn(); confirm.show = false">{{ confirm.ok }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue';
import { useI18n } from '../i18n.js';
import AppIcon from './AppIcon.vue';
const { t } = useI18n();

const props = defineProps({
  sessions: { type: Array,   default: () => [] },
  loading:  { type: Boolean, default: false },
});
const emit = defineEmits(['open', 'new', 'kill', 'delete', 'rename', 'log']);

const editingId = ref(null);
const editVal   = ref('');
const editEl    = ref(null);

const confirm = reactive({ show: false, msg: '', ok: '', fn: null });

function setEditRef(el) {
  editEl.value = el;
}
function startEdit(s) {
  editingId.value = s.sessionId;
  editVal.value   = s.name;
  nextTick(() => editEl.value?.focus());
}
function cancelEdit() {
  editingId.value = null;
}
function commitEdit(s) {
  // Guard against double-commit: Enter/blur or Escape/blur both fire commitEdit,
  // and the blur is triggered by removing the focused input from the DOM.
  if (editingId.value !== s.sessionId) return;
  editingId.value = null;
  const next = editVal.value.trim();
  if (next && next !== s.name) {
    emit('rename', { sessionId: s.sessionId, name: next });
  }
}

function confirmKill(s) {
  confirm.msg = `${t.value.stop_session}: "${s.name}"? ${t.value.stop_confirm}`;
  confirm.ok = t.value.stop_btn;
  confirm.fn  = () => emit('kill', s);
  confirm.show = true;
}
function confirmDelete(s) {
  confirm.msg = `${t.value.delete_session}: "${s.name}"? ${t.value.delete_confirm}`;
  confirm.ok = t.value.delete_btn;
  confirm.fn  = () => emit('delete', s);
  confirm.show = true;
}

function shortCwd(p) {
  if (!p) return '';
  return p.replace(/^\/paddle\//, '~/').replace(/^\/root\//, '~/').replace(/^\/home\/[^/]+\//, '~/');
}

const AGENT_LABELS = { claude: 'Claude', codex: 'Codex', grok: 'Grok' };
function agentLabel(agent) {
  return AGENT_LABELS[agent] || 'Claude';
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  const tx = t.value;
  if (d < 60000)    return tx.just_now;
  if (d < 3600000)  return Math.floor(d / 60000)    + tx.min_ago;
  if (d < 86400000) return Math.floor(d / 3600000)  + tx.hour_ago;
  return               Math.floor(d / 86400000) + tx.day_ago;
}
</script>

<style scoped>
.cl-root {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: transparent;
}

/* ── Header ────────────────────────────────── */
.cl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 13px;
  flex-shrink: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--hairline) 58%, transparent);
  background: color-mix(in srgb, var(--panel) 76%, transparent);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, #ffffff 4%, transparent);
}
.cl-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 18px; font-weight: 800;
  color: var(--text);
  letter-spacing: .2px;
}
.cl-new-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--neon) 16%, transparent), color-mix(in srgb, var(--neon) 8%, transparent));
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  color: var(--neon); font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px; font-weight: 800;
  padding: 7px 14px; cursor: pointer;
  transition: background .15s, box-shadow .15s, border-color .15s, transform .15s;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
}
.cl-new-btn:hover {
  background: color-mix(in srgb, var(--neon) 16%, transparent);
  box-shadow: 0 0 12px var(--glow);
  transform: translateY(-1px);
}

/* ── Empty / loading ───────────────────────── */
.cl-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 42px 20px; text-align: center;
  color: var(--muted);
}
.cl-spinner {
  font-size: 28px; color: var(--neon);
  --app-icon-size: 28px;
}
.cl-empty-icon { font-size: 40px; color: var(--muted); opacity: .7; --app-icon-size: 40px; }
.cl-empty-title { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 16px; font-weight: 800; color: var(--text); }
.cl-empty-sub   { font-size: 12px; color: var(--muted); }
.cl-start-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 8px; background: transparent;
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  color: var(--neon); font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px; font-weight: 800;
  padding: 10px 24px; cursor: pointer;
  transition: background .2s, box-shadow .2s;
  line-height: 1; overflow: visible; --app-icon-size: 15px;
}
.cl-start-btn:hover {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  box-shadow: 0 0 20px var(--glow);
}

/* ── List ──────────────────────────────────── */
.cl-list {
  flex: 1; overflow-y: auto;
  padding: 12px;
  display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 7px;
  scrollbar-width: thin; scrollbar-color: var(--muted) transparent;
}

.cl-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  background:
    linear-gradient(180deg, color-mix(in srgb, #ffffff 3%, transparent), transparent),
    color-mix(in srgb, var(--panel) 84%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: var(--radius); padding: 12px 12px 12px 14px; cursor: pointer;
  transition: border-color .15s, background .15s, box-shadow .15s, transform .15s;
  position: relative;
  overflow: hidden;
}
.cl-item::before {
  content: '';
  position: absolute;
  left: 0; top: 8px; bottom: 8px;
  width: 2px;
  border-radius: 0 999px 999px 0;
  background: color-mix(in srgb, var(--muted) 36%, transparent);
}
.cl-item:not(.dead)::before {
  background: linear-gradient(180deg, var(--success), var(--neon2));
}
.cl-item:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--neon) 7%, transparent), transparent),
    color-mix(in srgb, var(--panel) 90%, transparent);
  box-shadow: 0 0 0 1px var(--glow), 0 10px 24px #00000022;
  transform: translateY(-1px);
}
.cl-item.dead { opacity: .62; }

.cl-status {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
  outline: 3px solid color-mix(in srgb, var(--panel2) 72%, transparent);
}
.cl-status.live { background: var(--success); box-shadow: 0 0 6px color-mix(in srgb, var(--success) 70%, transparent); }
.cl-status.dead { background: var(--muted); }

.cl-info { flex: 1; min-width: 0; }

.cl-name-row {
  display: flex; align-items: center;
}
.cl-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; font-weight: 700;
  color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cl-name-input {
  flex: 1; background: var(--input-bg); border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm); color: var(--text);
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; font-weight: 700;
  padding: 1px 6px; outline: none;
}

.cl-meta {
  display: flex; gap: 8px; margin-top: 4px; align-items: center;
  min-width: 0;
}
.cl-cwd {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--neon2); opacity: .7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
.cl-agent {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--neon);
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--neon) 20%, transparent);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  flex-shrink: 0;
}
.cl-attached {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--neon); opacity: .6; flex-shrink: 0;
  line-height: 1; overflow: visible; --app-icon-size: 12px;
}

/* 右侧列：时间 + 操作按钮，同一行垂直居中 */
.cl-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.cl-time {
  font-size: 11px; color: var(--muted); white-space: nowrap;
}
.cl-actions {
  display: flex; gap: 2px;
  opacity: .76;
  transition: opacity .15s;
}
.cl-item:hover .cl-actions { opacity: 1; }

.cl-action {
  background: transparent; border: 1px solid transparent; cursor: pointer;
  color: var(--muted); padding: 6px 8px;
  border-radius: var(--radius-sm); transition: background .12s, color .12s, border-color .12s;
  min-width: 32px; display: flex; align-items: center; justify-content: center;
  line-height: 1; overflow: visible; --app-icon-size: 13px;
}
.cl-act-icon { font-size: 13px; line-height: 1; --app-icon-size: 13px; }
.cl-action:hover         { background: color-mix(in srgb, var(--neon) 10%, transparent); color: var(--text); border-color: var(--border); }
.cl-action-kill:hover    { background: color-mix(in srgb, var(--warning) 12%, transparent); color: var(--warning); }
.cl-action-del:hover,
.cl-action-close:hover   { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); }

@media (max-width: 560px) {
  .cl-header { padding: 14px 14px 11px; }
  .cl-list { padding: 9px; gap: 7px; }
  .cl-item { align-items: flex-start; gap: 9px; padding: 11px 9px 11px 12px; }
  .cl-right {
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }
  .cl-actions { opacity: 1; }
  .cl-meta { flex-wrap: wrap; gap: 5px; }
  .cl-cwd { max-width: 46vw; }
}

/* ── Confirm overlay ───────────────────────── */
.cl-confirm-overlay {
  position: fixed; inset: 0; z-index: 300;
  background-color: var(--overlay);
  background: var(--overlay); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.cl-confirm-box {
  background-color: var(--panel);
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 24px 28px;
  width: min(340px, 88vw);
  box-shadow: var(--shadow), 0 0 24px var(--glow);
  display: flex; flex-direction: column; gap: 18px;
}
.cl-confirm-msg {
  font-size: 14px; color: var(--text); line-height: 1.5;
}
.cl-confirm-btns { display: flex; gap: 10px; justify-content: flex-end; }
.cl-confirm-cancel {
  background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px;
  padding: 7px 16px; cursor: pointer; transition: border-color .15s;
}
.cl-confirm-cancel:hover { border-color: var(--border-strong); color: var(--text); }
.cl-confirm-ok {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 42%, transparent); border-radius: var(--radius-sm);
  color: var(--danger); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; font-weight: 700;
  padding: 7px 16px; cursor: pointer; transition: background .15s;
}
.cl-confirm-ok:hover { background: color-mix(in srgb, var(--danger) 18%, transparent); }
</style>
