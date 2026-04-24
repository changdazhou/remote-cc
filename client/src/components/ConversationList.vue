<template>
  <div class="cl-root">
    <!-- Header row -->
    <div class="cl-header">
      <div class="cl-title">{{ t.conversations }}</div>
      <button class="cl-new-btn" @click="$emit('new')">{{ icons.new }} {{ t.new_btn }}</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="cl-empty">
      <span class="cl-spinner">{{ icons.spinner }}</span> {{ t.loading }}
    </div>

    <!-- Empty state -->
    <div v-else-if="sessions.length === 0" class="cl-empty">
      <div class="cl-empty-icon">{{ icons.empty }}</div>
      <div class="cl-empty-title">{{ t.no_conv_title }}</div>
      <div class="cl-empty-sub">{{ t.no_conv_sub }}</div>
      <button class="cl-start-btn" @click="$emit('new')">{{ icons.new }} {{ t.start_conv }}</button>
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
              @keyup.escape="editingId = null"
              @blur="commitEdit(s)"
              @click.stop
              ref="editRef"
            />
          </div>
          <!-- Meta row -->
          <div class="cl-meta">
            <span class="cl-cwd">{{ shortCwd(s.workingDir) }}</span>
            <span v-if="(s.clientCount || 0) > 1" class="cl-attached" title="Multiple clients attached">⬡{{ s.clientCount }}</span>
          </div>
        </div>

        <!-- Right side: time + actions -->
        <div class="cl-right" @click.stop>
          <span class="cl-time">{{ timeAgo(s.lastActiveAt) }}</span>
          <div class="cl-actions">
            <button class="cl-action" :title="t.log_refresh" @click="$emit('log', s)">
              <span class="cl-act-icon">{{ icons.log }}</span>
            </button>
            <button
              class="cl-action cl-action-close"
              :title="s.alive ? t.stop_session : t.delete_session"
              @click="s.alive ? confirmKill(s) : confirmDelete(s)"
            >
              <span class="cl-act-icon">{{ icons.delete }}</span>
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
const { t } = useI18n();

const props = defineProps({
  sessions: { type: Array,   default: () => [] },
  loading:  { type: Boolean, default: false },
  icons:    { type: Object,  default: () => ({ log:'≡', kill:'⏹', delete:'✕', new:'＋', status_live:'●', status_dead:'○', empty:'⬡', spinner:'◌' }) },
});
const emit = defineEmits(['open', 'new', 'kill', 'delete', 'rename', 'log']);

const editingId = ref(null);
const editVal   = ref('');
const editRef   = ref(null);

const confirm = reactive({ show: false, msg: '', ok: '', fn: null });

function startEdit(s) {
  editingId.value = s.sessionId;
  editVal.value   = s.name;
  nextTick(() => editRef.value?.focus());
}
function commitEdit(s) {
  if (editVal.value.trim() && editVal.value !== s.name) {
    emit('rename', { sessionId: s.sessionId, name: editVal.value.trim() });
  }
  editingId.value = null;
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
  background: var(--bg);
}

/* ── Header ────────────────────────────────── */
.cl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 12px;
  flex-shrink: 0;
}
.cl-title {
  font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800;
  color: var(--text); letter-spacing: 0.5px;
}
.cl-new-btn {
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border: 1px solid var(--border); border-radius: 7px;
  color: var(--neon); font-family: 'Syne', sans-serif;
  font-size: 12px; font-weight: 700; letter-spacing: 1px;
  padding: 7px 14px; cursor: pointer;
  transition: background .15s, box-shadow .15s;
}
.cl-new-btn:hover {
  background: color-mix(in srgb, var(--neon) 16%, transparent);
  box-shadow: 0 0 12px var(--glow);
}

/* ── Empty / loading ───────────────────────── */
.cl-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; padding: 40px 20px; text-align: center;
}
.cl-spinner {
  font-size: 28px; color: var(--neon);
  animation: spin 1.5s linear infinite; display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.cl-empty-icon { font-size: 40px; color: var(--muted); opacity: .4; }
.cl-empty-title { font-family: 'Syne', sans-serif; font-size: 16px; font-weight: 700; color: var(--text); }
.cl-empty-sub   { font-size: 12px; color: var(--muted); }
.cl-start-btn {
  margin-top: 8px; background: transparent;
  border: 1px solid var(--neon); border-radius: 7px;
  color: var(--neon); font-family: 'Syne', sans-serif;
  font-size: 13px; font-weight: 700; letter-spacing: 1.5px;
  padding: 10px 24px; cursor: pointer;
  transition: background .2s, box-shadow .2s;
}
.cl-start-btn:hover {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  box-shadow: 0 0 20px var(--glow);
}

/* ── List ──────────────────────────────────── */
.cl-list {
  flex: 1; overflow-y: auto;
  padding: 0 12px 16px;
  display: flex; flex-direction: column; gap: 6px;
  scrollbar-width: thin; scrollbar-color: var(--muted) transparent;
}

.cl-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 14px; cursor: pointer;
  transition: border-color .15s, background .15s, box-shadow .15s;
  position: relative;
}
.cl-item:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
  background: color-mix(in srgb, var(--neon) 4%, var(--bg2));
  box-shadow: 0 0 0 1px var(--glow);
}
.cl-item.dead { opacity: .55; }

.cl-status {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
}
.cl-status.live { background: #a6e3a1; box-shadow: 0 0 6px #a6e3a1; }
.cl-status.dead { background: var(--muted); }

.cl-info { flex: 1; min-width: 0; }

.cl-name-row {
  display: flex; align-items: center;
}
.cl-name {
  font-family: 'JetBrains Mono', sans-serif; font-size: 13px; font-weight: 600;
  color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cl-name-input {
  flex: 1; background: var(--bg); border: 1px solid var(--neon);
  border-radius: 4px; color: var(--text);
  font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700;
  padding: 1px 6px; outline: none;
}

.cl-meta {
  display: flex; gap: 8px; margin-top: 3px; align-items: center;
}
.cl-cwd {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--neon2); opacity: .7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cl-attached {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--neon); opacity: .6; flex-shrink: 0;
}

/* 右侧列：时间 + 操作按钮，同一行垂直居中 */
.cl-right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.cl-time {
  font-size: 11px; color: var(--muted); white-space: nowrap;
}
.cl-actions {
  display: flex; gap: 2px;
}

.cl-action {
  background: none; border: none; cursor: pointer;
  color: var(--muted); padding: 6px 8px;
  border-radius: 6px; transition: background .12s, color .12s;
  min-width: 32px; display: flex; align-items: center; justify-content: center;
}
.cl-act-icon { font-size: 13px; line-height: 1; }
.cl-action:hover         { background: color-mix(in srgb, var(--neon) 10%, transparent); color: var(--text); }
.cl-action-kill:hover    { background: color-mix(in srgb, #f9e2af 12%, transparent); color: #f9e2af; }
.cl-action-del:hover     { background: color-mix(in srgb, #f38ba8 12%, transparent); color: #f38ba8; }
.cl-action-close:hover   { background: color-mix(in srgb, #f38ba8 12%, transparent); color: #f38ba8; }

/* ── Confirm overlay ───────────────────────── */
.cl-confirm-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: #00000070; backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.cl-confirm-box {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px 28px;
  width: min(340px, 88vw);
  box-shadow: 0 0 40px var(--glow);
  display: flex; flex-direction: column; gap: 18px;
}
.cl-confirm-msg {
  font-size: 14px; color: var(--text); line-height: 1.5;
}
.cl-confirm-btns { display: flex; gap: 10px; justify-content: flex-end; }
.cl-confirm-cancel {
  background: none; border: 1px solid var(--border); border-radius: 6px;
  color: var(--muted); font-family: 'Syne', sans-serif; font-size: 12px;
  padding: 7px 16px; cursor: pointer; transition: border-color .15s;
}
.cl-confirm-cancel:hover { border-color: var(--neon); color: var(--text); }
.cl-confirm-ok {
  background: color-mix(in srgb, #f38ba8 10%, transparent);
  border: 1px solid #f38ba850; border-radius: 6px;
  color: #f38ba8; font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700;
  padding: 7px 16px; cursor: pointer; transition: background .15s;
}
.cl-confirm-ok:hover { background: color-mix(in srgb, #f38ba8 20%, transparent); }
</style>
