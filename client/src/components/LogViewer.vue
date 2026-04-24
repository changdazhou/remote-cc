<template>
  <div class="log-viewer">
    <div class="lv-header">
      <span class="lv-title">LOG — {{ session.name }}</span>
      <div class="lv-actions">
        <button class="lv-btn" @click="load">↻ Refresh</button>
        <button class="lv-btn lv-close" @click="$emit('close')">✕</button>
      </div>
    </div>
    <div class="lv-path">{{ session.logPath }}</div>
    <div class="lv-body" ref="bodyRef">
      <div v-if="loading" class="lv-status">Loading...</div>
      <div v-else-if="error" class="lv-status lv-error">{{ error }}</div>
      <pre v-else class="lv-pre">{{ content || '(empty)' }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { api } from '../api/index.js';

const props = defineProps({
  session: { type: Object, required: true },
});
const emit = defineEmits(['close']);

const content = ref('');
const loading = ref(false);
const error   = ref('');
const bodyRef = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    content.value = await api.getSessionLog(props.session.sessionId);
    setTimeout(() => { if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight; }, 50);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.session.sessionId, load);
</script>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg);
  color: var(--text);
}
.lv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--neon) 15%, transparent);
  flex-shrink: 0;
}
.lv-title {
  font-family: 'Syne', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: var(--neon);
  letter-spacing: 1px;
}
.lv-actions { display: flex; gap: 6px; }
.lv-btn {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--neon) 25%, transparent);
  border-radius: 4px;
  color: var(--neon);
  font-family: 'Syne', sans-serif;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s;
}
.lv-btn:hover { background: color-mix(in srgb, var(--neon) 10%, transparent); }
.lv-close { border-color: #f38ba830; color: #f38ba8; }
.lv-close:hover { background: #f38ba815; }
.lv-path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  padding: 4px 14px;
  border-bottom: 1px solid #ffffff08;
  flex-shrink: 0;
}
.lv-body {
  flex: 1;
  overflow: auto;
  padding: 10px 14px;
}
.lv-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--muted);
  padding: 20px 0;
}
.lv-error { color: #f38ba8; }
.lv-pre {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
  margin: 0;
}
</style>
