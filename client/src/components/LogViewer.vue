<template>
  <div class="log-viewer">
    <div class="lv-header">
      <span class="lv-title">LOG — {{ session.name }}</span>
      <div class="lv-actions">
        <button class="lv-btn" @click="load"><AppIcon name="refresh" /> {{ t.lv_refresh }}</button>
        <button class="lv-btn lv-close" :title="t.lv_close" :aria-label="t.lv_close" @click="$emit('close')"><AppIcon name="close" /></button>
      </div>
    </div>
    <div class="lv-path">{{ session.logPath }}</div>
    <div class="lv-body" ref="bodyRef">
      <div v-if="loading" class="lv-status">{{ t.lv_loading }}</div>
      <div v-else-if="error" class="lv-status lv-error">{{ error }}</div>
      <pre v-else class="lv-pre">{{ content || t.lv_empty }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { api } from '../api/index.js';
import AppIcon from './AppIcon.vue';
import { useI18n } from '../i18n.js';

const props = defineProps({
  session: { type: Object, required: true },
});
const emit = defineEmits(['close']);

const content = ref('');
const loading = ref(false);
const error   = ref('');
const bodyRef = ref(null);

const { t } = useI18n();

// 快速切换会话时，只接受最新一次请求的结果
let loadToken = 0;
async function load() {
  const tok = ++loadToken;
  loading.value = true;
  error.value = '';
  try {
    const text = await api.getSessionLog(props.session.sessionId);
    if (tok !== loadToken) return;
    content.value = text;
    setTimeout(() => { if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight; }, 50);
  } catch (e) {
    if (tok === loadToken) error.value = e.message;
  } finally {
    if (tok === loadToken) loading.value = false;
  }
}

onMounted(load);
// 监听 session 对象本身：再次打开同一会话的日志也会重新加载，不显示上次的旧内容
watch(() => props.session, load);
</script>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: transparent;
  color: var(--text);
}
.lv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  border-bottom: 1px solid var(--hairline);
  background: color-mix(in srgb, var(--panel) 80%, transparent);
  flex-shrink: 0;
  box-shadow: inset 0 -1px 0 color-mix(in srgb, #ffffff 4%, transparent);
}
.lv-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 13px;
  font-weight: 800;
  color: var(--neon);
}
.lv-actions { display: flex; gap: 6px; }
.lv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--neon);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.15s, border-color .15s, transform .15s;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
}
.lv-btn:hover {
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.lv-close { border-color: color-mix(in srgb, var(--danger) 30%, transparent); color: var(--danger); }
.lv-close:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.lv-path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--muted);
  padding: 4px 14px;
  border-bottom: 1px solid var(--hairline);
  background: color-mix(in srgb, var(--panel) 58%, transparent);
  flex-shrink: 0;
}
.lv-body {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 14%, transparent), transparent 100px);
}
.lv-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--muted);
  padding: 20px 0;
}
.lv-error { color: var(--danger); }
.lv-pre {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
  margin: 0;
  padding-bottom: 24px;
}
</style>
