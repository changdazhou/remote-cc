<template>
  <div class="terminal-wrap" ref="wrapRef">
    <div class="term-container" ref="termRef"></div>
    <SymbolBar v-if="settings.symbolBar" :currentLine="currentLine" @input="$emit('input', $event)" />
    <Teleport to="body">
      <div v-if="ctxMenu.show" class="ctx-overlay"
        @click="ctxMenu.show = false"
        @contextmenu.prevent="ctxMenu.show = false">
        <div class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
          <button class="ctx-item" @click="ctxCopy"><span class="ctx-icon">⎘</span> Copy <span class="ctx-kbd">Ctrl+Shift+C</span></button>
          <!-- Paste：点击后聚焦隐藏 input，让用户用 Ctrl+V 粘贴 -->
          <button class="ctx-item" @click="ctxPasteClick"><span class="ctx-icon">⎗</span> Paste <span class="ctx-kbd">Ctrl+Shift+V</span></button>
          <div class="ctx-divider"></div>
          <button class="ctx-item" @click="ctxSelectAll"><span class="ctx-icon">▣</span> Select All</button>
          <button class="ctx-item" @click="ctxClear"><span class="ctx-icon">⊘</span> Clear</button>
        </div>
      </div>
      <!-- 隐藏 input 用于接收系统粘贴事件 -->
      <input ref="pasteInputRef" class="paste-trap" type="text"
        @paste="onTrapPaste" @blur="onTrapBlur" />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import SymbolBar from './SymbolBar.vue';
import { THEMES } from '../themes.js';
import { settings, FONT_FAMILIES } from '../settings.js';

const props = defineProps({
  theme: { type: String, default: 'cyber' },
});
const emit = defineEmits(['input', 'resize', 'paste']);

const termRef = ref(null);
const wrapRef = ref(null);
const pasteInputRef = ref(null);
const ctxMenu = reactive({ show: false, x: 0, y: 0 });
const currentLine = ref('');  // 当前输入行内容，传给 SymbolBar
let awaitingPaste = false;

let term, fitAddon, resizeObserver, resizeTimer;
let lastW = 0, lastH = 0;

onMounted(() => {
  const td = THEMES[props.theme] || THEMES.cyber;
  const fontDef = FONT_FAMILIES.find(f => f.id === settings.fontFamily) || FONT_FAMILIES[0];

  term = new Terminal({
    theme:       td.term,
    fontFamily:  fontDef.value,
    fontSize:    settings.fontSize,
    lineHeight:  settings.lineHeight,
    cursorBlink: settings.cursorBlink,
    cursorStyle: settings.cursorStyle,
    scrollback:  settings.scrollback,
    smoothScrollDuration: 80,   // 丝滑滚动 80ms
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(termRef.value);

  if (wrapRef.value) wrapRef.value.style.background = td.bg;

  term.onData(data => {
    emit('input', data);
    // currentLine 统一由 App.vue 的 onTermInput 通过 trackInput() 更新
    // 这里不再重复处理，避免双重追踪
  });

  // ── 复制：Ctrl+Shift+C 或右键 Copy ──────────────────────────────────────
  // xterm 默认 Ctrl+C 会发 SIGINT，用 Ctrl+Shift+C 复制
  term.attachCustomKeyEventHandler(e => {
    // Ctrl+Shift+C → 复制选中内容
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      const sel = term.getSelection();
      if (sel) copyText(sel);
      return false; // 阻止传递给 PTY
    }
    // Ctrl+Shift+V → 粘贴
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
      doPaste();
      return false;
    }
    return true;
  });

  // ── 粘贴：监听原生 paste 事件（Ctrl+V / 手机长按粘贴） ──────────────────
  termRef.value.addEventListener('paste', onNativePaste);

  termRef.value.addEventListener('contextmenu', onContextMenu);

  watch(() => props.theme, t => {
    const theme = THEMES[t] || THEMES.cyber;
    term.options.theme = theme.term;
    if (wrapRef.value) wrapRef.value.style.background = theme.bg;
  });

  // 实时响应 settings 变化
  watch(() => settings.fontSize,    v => { if (term) term.options.fontSize    = v; fitAddon?.fit(); });
  watch(() => settings.lineHeight,   v => { if (term) term.options.lineHeight  = v; fitAddon?.fit(); });
  watch(() => settings.cursorBlink,  v => { if (term) term.options.cursorBlink = v; });
  watch(() => settings.cursorStyle,  v => { if (term) term.options.cursorStyle = v; });
  watch(() => settings.fontFamily,   v => {
    const f = FONT_FAMILIES.find(f => f.id === v) || FONT_FAMILIES[0];
    if (term) term.options.fontFamily = f.value;
    fitAddon?.fit();
  });

  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width === lastW && height === lastH) continue;
      lastW = width; lastH = height;
      if (width > 0 && height > 0) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          fitAddon.fit();
          emit('resize', { cols: term.cols, rows: term.rows });
        }, 80);
      }
    }
  });
  resizeObserver.observe(wrapRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  clearTimeout(resizeTimer);
  termRef.value?.removeEventListener('contextmenu', onContextMenu);
  termRef.value?.removeEventListener('paste', onNativePaste);
  term?.dispose();
});

function write(data) { term?.write(data); }
function fit() { fitAddon?.fit(); }
function scrollToBottom() { term?.scrollToBottom(); }

// 供外部（SymbolBar 通过 App）同步更新行追踪，保持与键盘输入相同的逻辑
function trackInput(data) {
  if (data === '\r' || data === '\n' || data === '\x03' || data === '\x04') {
    currentLine.value = '';
  } else if (data === '\x7f' || data === '\b') {
    currentLine.value = currentLine.value.slice(0, -1);
  } else if (data.length === 1 && (data >= ' ' || data === '\t' || data === '!')) {
    currentLine.value += data;
  }
}

function getCols() { return term?.cols ?? 80; }
function getRows() { return term?.rows ?? 24; }
defineExpose({ write, fit, scrollToBottom, trackInput, getCols, getRows });

// ── 复制工具函数（兼容 HTTP 非安全上下文） ───────────────────────────────────
function copyText(text) {
  if (!text) return;
  // 优先用 Clipboard API（HTTPS / localhost）
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  // 降级：创建 textarea，execCommand('copy')
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}

// ── 粘贴：优先 Clipboard API，失败则提示 ─────────────────────────────────────
function doPaste() {
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText()
      .then(text => { if (text) emit('paste', text); })
      .catch(() => {
        // HTTP 下无权限，用户需要用右键菜单或 Ctrl+Shift+V 触发原生粘贴
      });
  }
}

// 原生 paste 事件（Ctrl+V、手机长按粘贴、浏览器粘贴按钮）
function onNativePaste(e) {
  e.preventDefault();
  const text = e.clipboardData?.getData('text');
  if (text) emit('paste', text);
}

function onContextMenu(e) {
  e.preventDefault();
  ctxMenu.x = Math.min(e.clientX, window.innerWidth - 168);
  ctxMenu.y = Math.min(e.clientY, window.innerHeight - 148);
  ctxMenu.show = true;
}
function ctxCopy() {
  ctxMenu.show = false;
  const sel = term?.getSelection();
  copyText(sel);
}
function ctxPasteClick() {
  ctxMenu.show = false;
  // 先尝试 Clipboard API
  if (navigator.clipboard?.readText) {
    navigator.clipboard.readText()
      .then(text => { if (text) emit('paste', text); })
      .catch(() => {
        // 降级：聚焦隐藏 input，等用户 Ctrl+V
        awaitingPaste = true;
        nextTick(() => pasteInputRef.value?.focus());
      });
  } else {
    awaitingPaste = true;
    nextTick(() => pasteInputRef.value?.focus());
  }
}
function onTrapPaste(e) {
  if (!awaitingPaste) return;
  awaitingPaste = false;
  const text = e.clipboardData?.getData('text');
  if (text) emit('paste', text);
  e.preventDefault();
  // return focus to terminal
  nextTick(() => termRef.value?.querySelector('.xterm-helper-textarea')?.focus());
}
function onTrapBlur() { awaitingPaste = false; }
function ctxSelectAll() { ctxMenu.show = false; term?.selectAll(); }
function ctxClear()     { ctxMenu.show = false; term?.clear(); }
</script>

<style scoped>
.terminal-wrap { display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden; }
.term-container { flex: 1; min-height: 0; overflow: hidden; padding: 4px; }
</style>

<style>
.ctx-overlay { position: fixed; inset: 0; z-index: 9999; }
.ctx-menu {
  position: fixed; background: var(--bg2); border: 1px solid var(--border);
  border-radius: 8px; padding: 4px; min-width: 200px;
  box-shadow: 0 8px 32px #00000060, 0 0 16px var(--glow); z-index: 10000;
}
.ctx-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; cursor: pointer; color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  padding: 8px 10px; border-radius: 5px; text-align: left; transition: background .1s;
}
.ctx-item:hover { background: color-mix(in srgb, var(--neon) 10%, transparent); }
.ctx-icon { color: var(--neon); font-size: 13px; width: 16px; text-align: center; flex-shrink: 0; }
.ctx-kbd  { margin-left: auto; color: var(--muted); font-size: 10px; }
.ctx-divider { height: 1px; background: var(--border); margin: 3px 6px; }
.paste-trap {
  position: fixed; top: -9999px; left: -9999px;
  width: 1px; height: 1px; opacity: 0; pointer-events: none;
}
</style>
