<template>
  <div class="help-root">
    <!-- 侧边导航 -->
    <div class="help-sidebar">
      <div class="help-sidebar-title">帮助文档</div>
      <button
        v-for="doc in docs" :key="doc.name"
        class="help-nav-item"
        :class="{ active: current === doc.name }"
        @click="loadDoc(doc.name)"
      >{{ doc.label }}</button>
    </div>

    <!-- 内容区 -->
    <div class="help-content" ref="contentRef">
      <div v-if="loading" class="help-status">加载中...</div>
      <div v-else-if="error" class="help-status help-error">{{ error }}</div>
      <div v-else class="help-md" v-html="rendered"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { marked } from 'marked';

const emit = defineEmits(['close']);

const docs = [
  { name: 'usage.md',        label: '使用手册 / Usage' },
  { name: 'installation.md', label: '安装指南 / Installation' },
  { name: 'api.md',          label: 'API 文档 / API' },
  { name: 'architecture.md', label: '架构说明 / Architecture' },
  { name: 'development.md',  label: '开发指南 / Development' },
];

const current  = ref('usage.md');
const rendered = ref('');
const loading  = ref(false);
const error    = ref('');
const contentRef = ref(null);

// 配置 marked：安全渲染
marked.setOptions({ breaks: true, gfm: true });

async function loadDoc(name) {
  current.value = name;
  loading.value = true;
  error.value   = '';
  try {
    const res  = await fetch(`/docs/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    rendered.value = marked.parse(text);
    // 滚到顶部
    if (contentRef.value) contentRef.value.scrollTop = 0;
  } catch (e) {
    error.value = `加载失败：${e.message}`;
  } finally {
    loading.value = false;
  }
}

onMounted(() => loadDoc('usage.md'));
</script>

<style scoped>
.help-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--bg);
  overflow: hidden;
}

/* ── 侧边栏 ─────────────────────────────── */
.help-sidebar {
  width: 140px;
  flex-shrink: 0;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  overflow-y: auto;
}
.help-sidebar-title {
  font-family: 'Syne', sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  padding: 0 12px 10px;
}
.help-nav-item {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--muted);
  padding: 8px 12px;
  transition: background .12s, color .12s;
  border-left: 2px solid transparent;
}
.help-nav-item:hover { color: var(--text); background: color-mix(in srgb, var(--neon) 5%, transparent); }
.help-nav-item.active { color: var(--neon); border-left-color: var(--neon); background: color-mix(in srgb, var(--neon) 8%, transparent); }

/* ── 内容区 ─────────────────────────────── */
.help-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  scrollbar-width: thin;
  scrollbar-color: var(--muted) transparent;
}
.help-status {
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  padding: 20px 0;
}
.help-error { color: #f38ba8; }
</style>

<!-- Markdown 渲染样式：全局（不 scoped） -->
<style>
.help-md {
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  max-width: 800px;
}
.help-md h1 {
  font-family: 'Syne', sans-serif;
  font-size: 22px;
  font-weight: 800;
  color: var(--neon);
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  margin: 0 0 20px;
}
.help-md h2 {
  font-family: 'Syne', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin: 28px 0 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.help-md h3 {
  font-family: 'Syne', sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--neon2);
  margin: 20px 0 8px;
}
.help-md p { margin: 0 0 12px; }
.help-md ul, .help-md ol {
  margin: 0 0 12px;
  padding-left: 20px;
}
.help-md li { margin: 4px 0; }
.help-md code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  background: color-mix(in srgb, var(--neon) 8%, var(--bg2));
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 5px;
  color: var(--neon);
}
.help-md pre {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 0 0 14px;
}
.help-md pre code {
  background: none;
  border: none;
  padding: 0;
  color: var(--text);
  font-size: 12px;
  line-height: 1.6;
}
.help-md blockquote {
  border-left: 3px solid var(--neon);
  margin: 0 0 14px;
  padding: 6px 14px;
  background: color-mix(in srgb, var(--neon) 5%, transparent);
  color: var(--muted);
  border-radius: 0 6px 6px 0;
}
.help-md table {
  border-collapse: collapse;
  width: 100%;
  margin: 0 0 14px;
  font-size: 12px;
}
.help-md th {
  background: var(--bg2);
  color: var(--neon);
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  padding: 8px 12px;
  text-align: left;
  border: 1px solid var(--border);
}
.help-md td {
  padding: 7px 12px;
  border: 1px solid var(--border);
  color: var(--text);
}
.help-md tr:nth-child(even) td { background: color-mix(in srgb, var(--bg2) 60%, transparent); }
.help-md a { color: var(--neon2); text-decoration: none; }
.help-md a:hover { text-decoration: underline; }
.help-md hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 20px 0;
}
</style>
