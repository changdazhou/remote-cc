<template>
  <div class="terminal-wrap" ref="wrapRef"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
    @click="focusTerm">
    <div class="term-container" ref="termRef"
      :class="{ 'drag-over': dragOver }"></div>

    <textarea
      v-if="isMobileUi"
      ref="mobileInputRef"
      class="mobile-input-trap"
      autocomplete="off"
      autocapitalize="none"
      autocorrect="off"
      spellcheck="false"
      inputmode="text"
      :enterkeyhint="mobileEnterKeyHint"
      @click.stop
      @input="onMobileInput"
      @keydown="onMobileKeydown"
      @compositionstart="onMobileCompositionStart"
      @compositionend="onMobileCompositionEnd"
      @paste="onMobilePaste"
    ></textarea>

    <div
      v-if="mobileCopyMode"
      class="mobile-copy-layer"
      :style="mobileCopyLayerStyle"
      @click.stop
      @contextmenu.stop
    >
      <div class="mobile-copy-toolbar">
        <button
          class="mobile-copy-action"
          title="Copy selected text"
          aria-label="Copy selected text"
          @click.stop="copyMobileText"
        >
          <AppIcon name="copy" />
        </button>
        <button
          class="mobile-copy-action"
          title="Close"
          aria-label="Close"
          @click.stop="closeMobileCopyMode"
        >
          <AppIcon name="close" />
        </button>
      </div>
      <pre
        ref="mobileCopyTextRef"
        class="mobile-copy-text"
        :style="mobileCopyTextStyle"
        tabindex="0"
        @click.stop
        @contextmenu.stop
      >{{ mobileCopyText }}</pre>
    </div>

    <button
      v-if="isMobileUi && terminalSelection"
      class="mobile-selection-copy"
      title="Copy selected text"
      aria-label="Copy selected text"
      @click.stop="copyTerminalSelection"
    >
      <AppIcon name="copy" />
    </button>

    <button
      v-if="scrolledAway && !mobileCopyMode"
      class="jump-bottom-btn"
      :class="{ 'has-new': hasNewOutput }"
      title="回到底部"
      @click.stop="jumpToBottom"
    >
      <AppIcon name="chevron" />
      <span v-if="hasNewOutput">新输出</span>
    </button>

    <div v-if="uploading && termUpload.name" class="img-upload-progress">
      <div class="iup-row">
        <AppIcon name="spinner" spin />
        <span class="iup-name" :title="termUpload.name">{{ termUpload.name }}</span>
        <span>{{ termUpload.percent }}%{{ termUpload.queued ? ` +${termUpload.queued}` : '' }}</span>
        <button class="iup-cancel" title="取消上传" @click.stop="cancelTerminalUpload"><AppIcon name="close" /></button>
      </div>
      <div class="iup-track"><div class="iup-bar" :style="{ width: termUpload.percent + '%' }"></div></div>
      <div class="iup-detail">
        <span>{{ formatBytes(termUpload.loaded) }} / {{ formatBytes(termUpload.size) }}</span>
        <span v-if="termUpload.size && termUpload.loaded >= termUpload.size">服务器处理中…</span>
        <span v-else-if="termUpload.speed > 0">{{ formatBytes(termUpload.speed) }}/s · 剩余 {{ formatDuration(termUpload.eta) }}</span>
      </div>
    </div>
    <span v-else-if="uploadHint.text" class="img-path-hint" :class="{ error: uploadHint.error }" :title="uploadHint.title">
      <AppIcon v-if="uploading && !uploadHint.error" name="spinner" spin />
      <AppIcon v-else :name="uploadHint.error ? 'close' : 'check'" />
      {{ uploadHint.text }}
    </span>

    <SymbolBar
      v-if="settings.symbolBar"
      class="terminal-shortcuts"
      :currentLine="currentLine"
      :mode="symbolMode"
      :active-modifier="mobileModifier"
      @input="onSymbolInput"
      @modifier="onMobileModifier"
    >
      <template v-if="symbolMode !== 'shell'" #prefix>
        <label
          class="img-upload-btn"
          :class="{ uploading }"
          :title="uploading ? '上传中...' : '上传图片或文件'"
          @click.stop
        >
          <input type="file" accept="image/*,*/*" multiple style="display:none"
            @change="onFileSelect" />
          <AppIcon v-if="!uploading" name="upload" />
          <AppIcon v-else name="spinner" spin />
        </label>
      </template>
    </SymbolBar>
    <Teleport to="body">
      <div v-if="ctxMenu.show" class="ctx-overlay"
        @click="ctxMenu.show = false"
        @contextmenu.prevent="ctxMenu.show = false">
        <div class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
          <button class="ctx-item" @click="ctxCopy"><AppIcon name="copy" class="ctx-icon" /> Copy <span class="ctx-kbd">Ctrl+Shift+C</span></button>
          <!-- Paste：点击后聚焦隐藏 input，让用户用 Ctrl+V 粘贴 -->
          <button class="ctx-item" @click="ctxPasteClick"><AppIcon name="paste" class="ctx-icon" /> Paste <span class="ctx-kbd">Ctrl+Shift+V</span></button>
          <div class="ctx-divider"></div>
          <button v-if="isMobileUi" class="ctx-item" @click="ctxTextSelect"><AppIcon name="select-all" class="ctx-icon" /> Text Select</button>
          <button class="ctx-item" @click="ctxSelectAll"><AppIcon name="select-all" class="ctx-icon" /> Select All</button>
          <button class="ctx-item" @click="ctxClear"><AppIcon name="clear" class="ctx-icon" /> Clear</button>
        </div>
      </div>
      <!-- 隐藏 input 用于接收系统粘贴事件 -->
      <input ref="pasteInputRef" class="paste-trap" type="text"
        @paste="onTrapPaste"
        @blur="onTrapBlur"
        @keydown="onTrapKeydown" />
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import SymbolBar from './SymbolBar.vue';
import AppIcon from './AppIcon.vue';
import { api, formatBytes, formatDuration } from '../api/index.js';
import { THEMES } from '../themes.js';
import { settings, FONT_FAMILIES } from '../settings.js';
import { recentlyActive } from '../user-activity.js';

const props = defineProps({
  theme: { type: String, default: 'cyber' },
  symbolMode: { type: String, default: 'auto' },
  optimisticEcho: { type: Boolean, default: false },
});
const emit = defineEmits(['input', 'resize', 'paste', 'response']);

const termRef = ref(null);
const wrapRef = ref(null);
const pasteInputRef = ref(null);
const mobileCopyTextRef = ref(null);
const mobileInputRef = ref(null);
const ctxMenu = reactive({ show: false, x: 0, y: 0 });
const currentLine = ref('');
const isMobileUi = ref(false);
const terminalSelection = ref('');
const mobileCopyMode = ref(false);
const mobileCopyText = ref('');
const mobileModifier = ref('');
const mobileCopyColors = computed(() => {
  const theme = THEMES[props.theme] || THEMES.cyber;
  return {
    bg: theme.term?.background || theme.bg || '#07111C',
    fg: theme.term?.foreground || '#E6F6FF',
  };
});
const mobileCopyLayerStyle = computed(() => ({
  background: mobileCopyColors.value.bg,
  backgroundColor: mobileCopyColors.value.bg,
  color: mobileCopyColors.value.fg,
}));
const mobileCopyTextStyle = computed(() => ({
  background: mobileCopyColors.value.bg,
  backgroundColor: mobileCopyColors.value.bg,
  color: mobileCopyColors.value.fg,
}));

// ── 图片/文件上传 ─────────────────────────────────────────────────────────────
const uploading = ref(false);
const dragOver  = ref(false);
const uploadHint = reactive({ text: '', title: '', error: false });
let uploadHintTimer = null;
const uploadQueue = [];
const EMPTY_TERM_UPLOAD = { name: '', percent: 0, loaded: 0, size: 0, speed: 0, eta: NaN, queued: 0 };
const termUpload = reactive({ ...EMPTY_TERM_UPLOAD });
let termUploadAbort = null;
const mobileEnterSends = computed(() => settings.mobileKeyboardEnter !== 'newline');
const mobileEnterKeyHint = computed(() => mobileEnterSends.value ? 'send' : 'enter');

// 始终把焦点还给 xterm 的内部 textarea
function focusTerm(e) {
  if (mobileCopyMode.value) return;
  if (ctxMenu.show || Date.now() < suppressTerminalFocusUntil) return;
  if (e?.target?.closest?.('.mobile-copy-layer, .mobile-selection-copy, .ctx-menu')) return;
  if (isMobileViewport() && term?.getSelection?.()) return;
  if (isMobileViewport() && focusMobileInput()) return;
  const ta = termRef.value?.querySelector('.xterm-helper-textarea');
  configureInputMode(ta);
  if (ta) ta.focus();
}

function focusMobileInput() {
  const input = mobileInputRef.value;
  if (!input) return false;
  configureInputMode(input);
  try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  return document.activeElement === input;
}

function configureInputMode(input) {
  if (!input) return;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('inputmode', 'text');
  input.setAttribute('enterkeyhint', mobileEnterKeyHint.value);
  input.autocapitalize = 'none';
  input.autocorrect = 'off';
  input.spellcheck = false;
}

function shortPath(p) {
  return p.split('/').slice(-2).join('/');
}

function setUploadHint(text, { title = text, error = false, autoHideMs = 0 } = {}) {
  clearTimeout(uploadHintTimer);
  uploadHint.text = text;
  uploadHint.title = title;
  uploadHint.error = error;
  if (autoHideMs) uploadHintTimer = setTimeout(() => { uploadHint.text = ''; }, autoHideMs);
}

// 多个文件排队依次上传，保证插入终端的路径顺序与选择顺序一致
function uploadFile(file) {
  if (!file) return;
  uploadQueue.push(file);
  if (!uploading.value) drainUploadQueue();
}

async function drainUploadQueue() {
  uploading.value = true;
  try {
    while (uploadQueue.length) {
      const file = uploadQueue.shift();
      const label = file.name || 'image';
      const abort = new AbortController();
      termUploadAbort = abort;
      Object.assign(termUpload, { ...EMPTY_TERM_UPLOAD, name: label, size: file.size, queued: uploadQueue.length });
      try {
        const { path: filePath } = await api.fs.uploadAttachment(file, {
          signal: abort.signal,
          onProgress: (loaded, total, { speed, eta }) => {
            Object.assign(termUpload, {
              percent: total ? Math.min(100, Math.floor(loaded / total * 100)) : 0,
              loaded, size: total, speed, eta, queued: uploadQueue.length,
            });
          },
        });
        setUploadHint(shortPath(filePath), { title: filePath, autoHideMs: 8000 });
        emit('input', filePath + ' ');
      } catch (e) {
        if (abort.signal.aborted) setUploadHint('已取消上传', { autoHideMs: 3000 });
        else setUploadHint(`上传失败: ${label} (${e?.message || e})`, { error: true, autoHideMs: 8000 });
      }
    }
  } finally {
    termUploadAbort = null;
    Object.assign(termUpload, EMPTY_TERM_UPLOAD);
    uploading.value = false;
    // 上传完成后立即把焦点还给终端
    nextTick(() => focusTerm());
  }
}

function cancelTerminalUpload() {
  uploadQueue.length = 0;
  termUploadAbort?.abort();
}

async function onFileSelect(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  files.forEach(uploadFile);
}

function onDrop(e) {
  dragOver.value = false;
  const files = Array.from(e.dataTransfer.files || []);
  files.forEach(uploadFile);
}

function onTerminalPaste(e) {
  if (handleClipboardPaste(e)) return;
}

function handleClipboardPaste(e) {
  const items = Array.from(e.clipboardData?.items || []);
  const imageItem = items.find(i => i.type.startsWith('image/'));
  if (imageItem) {
    clearNativePasteFallback();
    awaitingPaste = false;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) uploadFile(file);
    return true;
  }

  const text = e.clipboardData?.getData('text');
  if (text) {
    clearNativePasteFallback();
    awaitingPaste = false;
    e.preventDefault();
    resumeOutputForInput();
    emit('paste', text);
    return true;
  }
  return false;
}
let awaitingPaste = false;
let nativePasteFallbackTimer = null;

let term, fitAddon, resizeObserver, resizeTimer;
let lastW = 0, lastH = 0;
let fontsCleanup = null;
let fontRemeasureTimer = null;
let selectionDisposable = null;
let mobileMediaQuery = null;
let mobileMediaQueryCleanup = null;
let longPressTimer = null;
let touchStartPoint = null;
let touchMoved = false;
let copyModeOpenedNearBottom = true;
let mobileInputComposing = false;
let suppressTerminalFocusUntil = 0;
let replaySuppressDepth = 0;
let terminalResponseWriteSuppressDepth = 0;
let terminalResponseSuppressUntil = 0;
let terminalAutoResponsePending = '';
let terminalAutoResponsePendingAt = 0;
let optimisticEchoPending = '';
let optimisticEchoPendingAt = 0;

// ── 自动锁底 + 上划暂停更新 ──────────────────────────────────────────────────
let userScrolled = false;       // 用户是否主动上划
const scrolledAway = ref(false); // userScrolled 的响应式副本，控制「回到底部」按钮
const hasNewOutput = ref(false); // 上划期间是否来了新输出
let autoScrollTimer = null;
let scrollIdleTimer = null;      // 上划后无操作一段时间自动回到底部
const SCROLL_IDLE_RESUME_MS = 10000;
let lastViewportY = 0;
let lastTouchY = null;
let touchSamples = [];           // 最近的触摸位置，用于计算松手时的惯性速度
let inertiaRaf = 0;
let webglAddon = null;
let userScrollIntentUntil = 0;   // 只有用户输入触发的滚动才暂停锁底
let autoScrollUntil = 0;         // 程序写入触发的滚动不应暂停锁底
const pendingWrites = [];        // 用户上划时缓存的输出
let pendingBytes = 0;
const PENDING_MAX_BYTES = 4 * 1024 * 1024;
let boundViewport = null;
let boundScrollRoot = null;
const TERMINAL_SELECTION_BG = 'rgba(37, 99, 235, 0.82)';
const TERMINAL_SELECTION_FG = '#FFFFFF';
const OPTIMISTIC_ECHO_TTL = 2500;

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(max-width: 700px), (pointer: coarse)');
  return Boolean(mq?.matches) || window.innerWidth <= 700;
}

function updateMobileUi() {
  isMobileUi.value = isMobileViewport();
}

function setUserScrolled(value) {
  userScrolled = value;
  scrolledAway.value = value;
  if (value) {
    scheduleIdleResume();
  } else {
    hasNewOutput.value = false;
    clearTimeout(scrollIdleTimer);
  }
}

function scheduleIdleResume() {
  clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    if (!userScrolled) return;
    // 复制模式或正在选中文字时不能把视图拉走
    if (mobileCopyMode.value || term?.hasSelection?.()) {
      scheduleIdleResume();
      return;
    }
    setUserScrolled(false);
    flushPending();
    scrollToBottomSoon();
  }, SCROLL_IDLE_RESUME_MS);
}

// 以 xterm 缓冲区状态判断是否在底部：DOM 的 scrollHeight 要到下一帧渲染才更新，快速输出时会误判
function isNearBottom() {
  if (!term) return true;
  const buf = term.buffer?.active;
  if (buf) return buf.viewportY >= buf.baseY;
  const vp = term.element?.querySelector('.xterm-viewport');
  if (!vp) return true;
  return vp.scrollHeight - vp.scrollTop - vp.clientHeight < 2;
}

// 只有普通缓冲区有可回看的历史；全屏程序或开启鼠标上报时滚轮交给程序
function canScrollBack() {
  const buf = term?.buffer?.active;
  if (!buf || buf.type !== 'normal' || buf.baseY <= 0) return false;
  return (term.modes?.mouseTrackingMode || 'none') === 'none';
}

function onViewportScroll() {
  if (mobileCopyMode.value) return;
  const y = term?.buffer?.active?.viewportY ?? 0;
  const movedUp = y < lastViewportY;
  lastViewportY = y;
  if (Date.now() < userScrollIntentUntil) {
    if (movedUp) setUserScrolled(true);
    else if (isNearBottom() && userScrolled) {
      // 用户自己滑回底部 → 恢复自动跟随，冲刷缓存
      setUserScrolled(false);
      flushPending();
    }
    if (userScrolled) scheduleIdleResume();
    return;
  }
  if (isNearBottom()) {
    if (userScrolled) { setUserScrolled(false); flushPending(); }
  } else if (!userScrolled && Date.now() >= autoScrollUntil) {
    // 布局变化（键盘弹出、缩放、字体加载）引起的滚动不算用户上划，重新贴底
    scrollToBottomSoon();
  }
}

function markUserScrollIntent() {
  userScrollIntentUntil = Date.now() + (isMobileViewport() ? 4000 : 2500);
  if (userScrolled) scheduleIdleResume();
}

// 往上看历史：立即暂停跟随，不等滚动事件，避免刚离开底部就被新输出拉回去
function beginScrollBack() {
  markUserScrollIntent();
  if (canScrollBack()) setUserScrolled(true);
}

function onRootWheel(e) {
  if (e.deltaY < 0) beginScrollBack();
  else markUserScrollIntent();
}

function onRootTouchStart(e) {
  stopInertia();
  lastTouchY = e.touches?.[0]?.clientY ?? null;
  touchSamples = lastTouchY == null ? [] : [[performance.now(), lastTouchY]];
  if (userScrolled) scheduleIdleResume();
}

function onRootTouchMove(e) {
  const y = e.touches?.[0]?.clientY;
  if (y == null) return;
  const dy = lastTouchY == null ? 0 : y - lastTouchY;
  lastTouchY = y;
  const now = performance.now();
  touchSamples.push([now, y]);
  while (touchSamples.length > 2 && now - touchSamples[0][0] > 100) touchSamples.shift();
  // 手指下移 = 内容往上翻
  if (dy > 2) beginScrollBack();
  else markUserScrollIntent();
}

// xterm 接管了触摸滚动（没有原生惯性），松手后按手指速度继续减速滚动
function onRootTouchEnd() {
  lastTouchY = null;
  const samples = touchSamples;
  touchSamples = [];
  if (samples.length < 2 || !boundViewport || !canScrollBack()) return;
  const [t0, y0] = samples[0];
  const [t1, y1] = samples[samples.length - 1];
  if (performance.now() - t1 > 60 || t1 <= t0) return;
  const velocity = (y0 - y1) / (t1 - t0);  // px/ms，正数 = 往下滚
  if (Math.abs(velocity) > 0.25) startInertia(velocity);
}

function startInertia(initialVelocity) {
  stopInertia();
  const vp = boundViewport;
  let velocity = Math.max(-6, Math.min(6, initialVelocity));
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(now - last, 32);
    last = now;
    const before = vp.scrollTop;
    markUserScrollIntent();
    vp.scrollTop = before + velocity * dt;
    velocity *= Math.pow(0.95, dt / 16);
    if (Math.abs(velocity) < 0.03 || vp.scrollTop === before || boundViewport !== vp) {
      inertiaRaf = 0;
      return;
    }
    inertiaRaf = requestAnimationFrame(step);
  };
  inertiaRaf = requestAnimationFrame(step);
}

function stopInertia() {
  if (inertiaRaf) cancelAnimationFrame(inertiaRaf);
  inertiaRaf = 0;
}

// DOM 渲染器由浏览器排版文字、另画一层选区，二者宽度总有误差；WebGL 按单元格绘制，天然对齐且滚动更流畅。
// 浏览器同时可用的 WebGL 上下文有限，只给可见的终端开启。
function enableWebgl() {
  if (webglAddon || !term) return;
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => disableWebgl());
    term.loadAddon(addon);
    webglAddon = addon;
  } catch (_) {
    webglAddon = null;
  }
}

function disableWebgl() {
  const addon = webglAddon;
  webglAddon = null;
  try { addon?.dispose(); } catch (_) {}
}

// 拖动滚动条或在终端里按下鼠标（选中文字）都算操作
function onRootMouseDown(e) {
  if (e.target === boundViewport) markUserScrollIntent();
  else if (userScrolled) scheduleIdleResume();
}

function bindViewport(vp) {
  if (!vp || boundViewport === vp) return;
  unbindViewport();
  boundViewport = vp;
  // 滚轮/触摸的事件目标通常是 .xterm-screen 而不是 viewport，要在 xterm 根元素上监听
  boundScrollRoot = term?.element || vp.parentElement || vp;
  lastViewportY = term?.buffer?.active?.viewportY ?? 0;
  vp.addEventListener('scroll', onViewportScroll, { passive: true });
  boundScrollRoot.addEventListener('mousedown', onRootMouseDown, { passive: true, capture: true });
  boundScrollRoot.addEventListener('wheel', onRootWheel, { passive: true, capture: true });
  boundScrollRoot.addEventListener('touchstart', onRootTouchStart, { passive: true, capture: true });
  boundScrollRoot.addEventListener('touchmove', onRootTouchMove, { passive: true, capture: true });
  boundScrollRoot.addEventListener('touchend', onRootTouchEnd, { passive: true, capture: true });
  boundScrollRoot.addEventListener('touchcancel', onRootTouchEnd, { passive: true, capture: true });
}

function unbindViewport() {
  if (!boundViewport) return;
  boundViewport.removeEventListener('scroll', onViewportScroll);
  boundScrollRoot?.removeEventListener('mousedown', onRootMouseDown, { capture: true });
  boundScrollRoot?.removeEventListener('wheel', onRootWheel, { capture: true });
  boundScrollRoot?.removeEventListener('touchstart', onRootTouchStart, { capture: true });
  boundScrollRoot?.removeEventListener('touchmove', onRootTouchMove, { capture: true });
  boundScrollRoot?.removeEventListener('touchend', onRootTouchEnd, { capture: true });
  boundScrollRoot?.removeEventListener('touchcancel', onRootTouchEnd, { capture: true });
  stopInertia();
  boundViewport = null;
  boundScrollRoot = null;
}

function scrollToBottomSoon() {
  if (mobileCopyMode.value || userScrolled) return;
  autoScrollUntil = Date.now() + 500;
  clearTimeout(autoScrollTimer);
  autoScrollTimer = setTimeout(() => {
    term?.scrollToBottom();
    requestAnimationFrame(() => term?.scrollToBottom());
  }, 16);
}

function flushPending() {
  if (pendingWrites.length === 0) return;
  pendingBytes = 0;
  const batch = compactWriteItems(pendingWrites.splice(0));
  let remaining = batch.length;
  batch.forEach(item => writeToTerminal(item.data, { suppressInput: item.suppressInput }, () => {
    remaining -= 1;
    if (remaining === 0) scrollToBottomSoon();
  }));
}

function compactWriteItems(items) {
  const compacted = [];
  for (const item of items) {
    if (!item?.data) continue;
    const tail = compacted[compacted.length - 1];
    if (tail && tail.suppressInput === item.suppressInput) {
      tail.data += item.data;
    } else {
      compacted.push({ ...item });
    }
  }
  return compacted;
}

function resetOptimisticEcho() {
  optimisticEchoPending = '';
  optimisticEchoPendingAt = 0;
}

function isPrintableEchoInput(data) {
  if (!props.optimisticEcho || !term || !data || typeof data !== 'string') return false;
  if (replaySuppressDepth > 0 || mobileCopyMode.value) return false;
  if (data.length > 128) return false;
  if (data.includes('\x1b')) return false;
  return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data);
}

function echoLocalInput(data) {
  if (!isPrintableEchoInput(data)) return;
  optimisticEchoPending += data;
  optimisticEchoPendingAt = Date.now();
  term.write(data);
}

function stripOptimisticEcho(data, options = {}) {
  if (!props.optimisticEcho || options.suppressInput || !optimisticEchoPending) return data;
  if (Date.now() - optimisticEchoPendingAt > OPTIMISTIC_ECHO_TTL) {
    resetOptimisticEcho();
    return data;
  }
  if (!data || typeof data !== 'string') return data;

  if (data.startsWith(optimisticEchoPending)) {
    const stripped = data.slice(optimisticEchoPending.length);
    resetOptimisticEcho();
    return stripped;
  }
  if (optimisticEchoPending.startsWith(data)) {
    optimisticEchoPending = optimisticEchoPending.slice(data.length);
    optimisticEchoPendingAt = Date.now();
    return '';
  }

  resetOptimisticEcho();
  return data;
}

// 对外暴露的 write：上划时缓存，否则直接写并锁底
function smartWrite(data, options = {}) {
  const output = stripOptimisticEcho(data, options);
  if (!output) return;
  const item = { data: output, suppressInput: Boolean(options.suppressInput) };
  if (userScrolled || mobileCopyMode.value) hasNewOutput.value = true;
  if (mobileCopyMode.value || (isMobileViewport() && userScrolled)) {
    pendingWrites.push(item);
    pendingBytes += output.length;
    // 缓存过多时不能丢弃中间片段（会打乱终端控制序列），直接恢复跟随并全部写入
    if (pendingBytes > PENDING_MAX_BYTES && !mobileCopyMode.value) {
      setUserScrolled(false);
      flushPending();
    }
  } else {
    // xterm write is async; scroll after render so mobile Codex output stays pinned.
    writeToTerminal(output, options, scrollToBottomSoon);
  }
}

function resumeOutputForInput() {
  if (mobileCopyMode.value) return;
  setUserScrolled(false);
  if (pendingWrites.length > 0) flushPending();
  else scrollToBottomSoon();
}

function writeToTerminal(data, options = {}, callback) {
  if (!term) return;
  let releaseSuppression = null;
  if (options.suppressInput) {
    terminalResponseWriteSuppressDepth += 1;
    markTerminalResponseSuppression(1200);
    let released = false;
    const fallbackTimer = setTimeout(() => releaseSuppression?.(), 10000);
    releaseSuppression = () => {
      if (released) return;
      released = true;
      clearTimeout(fallbackTimer);
      terminalResponseWriteSuppressDepth = Math.max(0, terminalResponseWriteSuppressDepth - 1);
      markTerminalResponseSuppression(300);
    };
  }
  term.write(data, () => {
    releaseSuppression?.();
    callback?.();
  });
}

function markTerminalResponseSuppression(ms) {
  terminalResponseSuppressUntil = Math.max(terminalResponseSuppressUntil, Date.now() + ms);
}

function beginReplay() {
  resetOptimisticEcho();
  replaySuppressDepth += 1;
  markTerminalResponseSuppression(5000);
}

function endReplay() {
  replaySuppressDepth = Math.max(0, replaySuppressDepth - 1);
  markTerminalResponseSuppression(300);
}

// 程序查询终端颜色（OSC 10/11/4）、光标位置、设备属性时由 xterm 应答，Agent 靠这些选配色。
// 多个设备连同一会话时都会应答，重复的应答会被当成输入，所以只让正在使用的设备应答。
const TERMINAL_RESPONSE_ACTIVE_MS = 5 * 60 * 1000;
function canAnswerTerminalQueries() {
  if (suppressingTerminalResponses() || !lastW || !lastH) return false;
  if (typeof document !== 'undefined') {
    if (document.visibilityState === 'hidden') return false;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
  }
  return recentlyActive(TERMINAL_RESPONSE_ACTIVE_MS);
}

function suppressingTerminalResponses() {
  return replaySuppressDepth > 0 || terminalResponseWriteSuppressDepth > 0 || Date.now() < terminalResponseSuppressUntil;
}

function resetTerminalAutoResponseFilter() {
  terminalAutoResponsePending = '';
  terminalAutoResponsePendingAt = 0;
}

function setTerminalAutoResponsePending(value) {
  terminalAutoResponsePending = value;
  terminalAutoResponsePendingAt = value ? Date.now() : 0;
}

function shouldHoldCsiAutoResponsePrefix(seq) {
  const body = seq.slice(2);
  return /^[?>]?[0-9;]*$/.test(body);
}

function shouldHoldOscAutoResponsePrefix(seq) {
  const body = seq.slice(2);
  return body === '' || /^(?:1|10|11|12|4|4;\d*)$/.test(body) || /^(?:10|11|12|4;\d*);/.test(body);
}

function stripTerminalAutoResponses(data, { holdPartial = false } = {}) {
  if (!data || typeof data !== 'string') return data;
  if (terminalAutoResponsePending && Date.now() - terminalAutoResponsePendingAt > 1500) {
    resetTerminalAutoResponseFilter();
  }
  const input = terminalAutoResponsePending + data;
  resetTerminalAutoResponseFilter();
  let output = '';

  for (let i = 0; i < input.length;) {
    if (input[i] !== '\x1b') {
      output += input[i];
      i += 1;
      continue;
    }

    if (i + 1 >= input.length) {
      if (holdPartial) setTerminalAutoResponsePending(input.slice(i));
      else output += input.slice(i);
      break;
    }

    const next = input[i + 1];
    if (next === '[') {
      let end = i + 2;
      while (end < input.length) {
        const code = input.charCodeAt(end);
        if (code >= 0x40 && code <= 0x7e) break;
        end += 1;
      }
      if (end >= input.length) {
        const pending = input.slice(i);
        if (holdPartial || shouldHoldCsiAutoResponsePrefix(pending)) setTerminalAutoResponsePending(pending);
        else output += pending;
        break;
      }
      const seq = input.slice(i, end + 1);
      if (!/^\x1b\[[?>]?[0-9;]*[cR]$/.test(seq)) output += seq;
      i = end + 1;
      continue;
    }

    if (next === ']') {
      let end = -1;
      let endLen = 1;
      for (let j = i + 2; j < input.length; j += 1) {
        if (input[j] === '\x07') {
          end = j;
          break;
        }
        if (input[j] === '\x1b') {
          if (j + 1 >= input.length) break;
          if (input[j + 1] === '\\') {
            end = j;
            endLen = 2;
            break;
          }
        }
      }
      if (end === -1) {
        const pending = input.slice(i);
        if (holdPartial || shouldHoldOscAutoResponsePrefix(pending)) setTerminalAutoResponsePending(pending);
        else output += pending;
        if (terminalAutoResponsePending.length > 2048) resetTerminalAutoResponseFilter();
        break;
      }
      const seq = input.slice(i, end + endLen);
      if (!/^\x1b\](?:(?:4;\d+)|10|11|12);/.test(seq)) output += seq;
      i = end + endLen;
      continue;
    }

    output += input[i];
    i += 1;
  }

  return output;
}

onMounted(() => {
  updateMobileUi();
  mobileMediaQuery = window.matchMedia?.('(max-width: 700px), (pointer: coarse)');
  if (mobileMediaQuery) {
    if (mobileMediaQuery.addEventListener) {
      mobileMediaQuery.addEventListener('change', updateMobileUi);
      mobileMediaQueryCleanup = () => mobileMediaQuery.removeEventListener('change', updateMobileUi);
    } else if (mobileMediaQuery.addListener) {
      mobileMediaQuery.addListener(updateMobileUi);
      mobileMediaQueryCleanup = () => mobileMediaQuery.removeListener(updateMobileUi);
    }
  }
  window.addEventListener('resize', updateMobileUi);

  const td = THEMES[props.theme] || THEMES.cyber;
  const fontDef = FONT_FAMILIES.find(f => f.id === settings.fontFamily) || FONT_FAMILIES[0];
  const terminalTheme = withSelectionTheme(td.term);

  term = new Terminal({
    theme:       terminalTheme,
    fontFamily:  fontDef.value,
    fontSize:    settings.fontSize,
    lineHeight:  settings.lineHeight,
    cursorBlink: settings.cursorBlink,
    cursorStyle: settings.cursorStyle,
    scrollback:  settings.scrollback,
    smoothScrollDuration: 0,    // 每个滚轮事件都做动画会让触控板滚动发粘
    allowProposedApi: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(termRef.value);
  if (termRef.value?.offsetWidth && termRef.value?.offsetHeight) enableWebgl();
  configureInputMode(termRef.value?.querySelector('.xterm-helper-textarea'));
  selectionDisposable = term.onSelectionChange(() => {
    terminalSelection.value = term.getSelection();
  });

  if (wrapRef.value) wrapRef.value.style.background = td.bg;

  // terminal open 后立即聚焦，确保键盘输入直接进 xterm
  nextTick(() => focusTerm());

  // 监听 viewport scroll 检测用户是否上划
  // xterm 渲染后 viewport 元素才存在，用 MutationObserver 等它出现
  const vpObserver = new MutationObserver(() => {
    const vp = term.element?.querySelector('.xterm-viewport');
    configureInputMode(termRef.value?.querySelector('.xterm-helper-textarea'));
    if (vp) {
      bindViewport(vp);
      vpObserver.disconnect();
    }
  });
  vpObserver.observe(termRef.value, { childList: true, subtree: true });
  // 如果已经存在直接绑定
  const vp0 = termRef.value?.querySelector('.xterm-viewport');
  if (vp0) {
    bindViewport(vp0);
    vpObserver.disconnect();
  }

  term.onData(data => {
    const shouldSuppress = suppressingTerminalResponses();
    const input = stripTerminalAutoResponses(data, { holdPartial: shouldSuppress });
    if (!input) {
      // 纯终端应答：不算用户输入，不回显、不拉回底部、不记入当前行
      if (data && !shouldSuppress && canAnswerTerminalQueries()) {
        resetTerminalAutoResponseFilter();
        emit('response', data);
      }
      return;
    }
    resumeOutputForInput();
    echoLocalInput(input);
    emit('input', input);
    // currentLine 统一由 App.vue 的 onTermInput 通过 trackInput() 更新
    // 这里不再重复处理，避免双重追踪
  });

  // ── 复制：Ctrl+Shift+C 或右键 Copy ──────────────────────────────────────
  term.attachCustomKeyEventHandler(e => {
    if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyC') {
      const sel = term.getSelection();
      if (sel) {
        copyText(sel);
        return false;
      }
      return true;
    }
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
      const sel = term.getSelection();
      if (sel) copyText(sel);
      return false;
    }
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.code === 'KeyV') {
      doPaste();
      return false;
    }
    return true;
  });

  // ── 粘贴：监听原生 paste 事件（Ctrl+V / 手机长按粘贴） ──────────────────
  // 图片走上传，文字走浏览器剪贴板；Ctrl/Cmd+V 在捕获阶段转到隐藏输入框。
  termRef.value.addEventListener('paste', onTerminalPaste);
  termRef.value.addEventListener('keydown', onTerminalKeydownCapture, true);

  termRef.value.addEventListener('contextmenu', onContextMenu);
  termRef.value.addEventListener('touchstart', onTermTouchStart, { passive: true });
  termRef.value.addEventListener('touchmove', onTermTouchMove, { passive: true });
  termRef.value.addEventListener('touchend', clearLongPressTimer, { passive: true });
  termRef.value.addEventListener('touchcancel', clearLongPressTimer, { passive: true });

  watch(() => props.theme, t => {
    const theme = THEMES[t] || THEMES.cyber;
    term.options.theme = withSelectionTheme(theme.term);
    if (wrapRef.value) wrapRef.value.style.background = theme.bg;
  });

  // 实时响应 settings 变化
  watch(() => settings.fontSize,    v => { if (term) term.options.fontSize    = v; fitAndSync(); });
  watch(() => settings.lineHeight,   v => { if (term) term.options.lineHeight  = v; fitAndSync(); });
  watch(() => settings.cursorBlink,  v => { if (term) term.options.cursorBlink = v; });
  watch(() => settings.cursorStyle,  v => { if (term) term.options.cursorStyle = v; });
  watch(() => settings.fontFamily,   v => {
    const f = FONT_FAMILIES.find(f => f.id === v) || FONT_FAMILIES[0];
    if (term) term.options.fontFamily = f.value;
    fitAndSync();
  });
  watch(() => settings.scrollback,   v => { if (term) term.options.scrollback = v; });

  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width === lastW && height === lastH) continue;
      const wasHidden = !lastW || !lastH;
      lastW = width; lastH = height;
      if (!width || !height) {
        clearTimeout(resizeTimer);
        disableWebgl();
      } else {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          // 隐藏（v-show）期间测出的字宽不可靠，重新显示时重新测量
          if (wasHidden) {
            enableWebgl();
            remeasureFont({ forceResize: true });
          }
          else {
            fitAddon.fit();
            emit('resize', { cols: term.cols, rows: term.rows });
          }
          if (!userScrolled && !mobileCopyMode.value) scrollToBottomSoon();
        }, 80);
      }
    }
  });
  resizeObserver.observe(wrapRef.value);

  // 网页字体异步加载：终端先按后备字体测了字宽，字体换上后必须重测，否则选区和文字宽度对不上
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (fonts) {
    const onFontsLoaded = () => scheduleFontRemeasure();
    fonts.ready?.then(onFontsLoaded).catch(() => {});
    fonts.addEventListener?.('loadingdone', onFontsLoaded);
    fontsCleanup = () => fonts.removeEventListener?.('loadingdone', onFontsLoaded);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  clearTimeout(resizeTimer);
  clearTimeout(uploadHintTimer);
  uploadQueue.length = 0;
  termUploadAbort?.abort();
  clearLongPressTimer();
  window.removeEventListener('resize', updateMobileUi);
  mobileMediaQueryCleanup?.();
  fontsCleanup?.();
  clearTimeout(fontRemeasureTimer);
  unbindViewport();
  termRef.value?.removeEventListener('contextmenu', onContextMenu);
  termRef.value?.removeEventListener('paste', onTerminalPaste);
  termRef.value?.removeEventListener('keydown', onTerminalKeydownCapture, true);
  termRef.value?.removeEventListener('touchstart', onTermTouchStart);
  termRef.value?.removeEventListener('touchmove', onTermTouchMove);
  termRef.value?.removeEventListener('touchend', clearLongPressTimer);
  termRef.value?.removeEventListener('touchcancel', clearLongPressTimer);
  clearNativePasteFallback();
  clearTimeout(autoScrollTimer);
  clearTimeout(scrollIdleTimer);
  stopInertia();
  disableWebgl();
  selectionDisposable?.dispose();
  term?.dispose();
});

function scheduleFontRemeasure() {
  clearTimeout(fontRemeasureTimer);
  fontRemeasureTimer = setTimeout(() => remeasureFont(), 50);
}

// xterm 只在字体选项变化时重测字宽并清空字形宽度缓存，这里切换一次选项强制刷新
function remeasureFont({ forceResize = false } = {}) {
  if (!term || !lastW || !lastH) return;
  const family = term.options.fontFamily;
  term.options.fontFamily = 'monospace';
  term.options.fontFamily = family;
  fitAndSync({ force: forceResize });
  if (!userScrolled && !mobileCopyMode.value) scrollToBottomSoon();
}

// 列数变化必须同步给 PTY，否则程序按旧宽度排版，超出的字符在右侧被裁掉
function fitAndSync({ force = false } = {}) {
  if (!term || !fitAddon) return;
  const { cols, rows } = term;
  fitAddon.fit();
  if (force || term.cols !== cols || term.rows !== rows) {
    emit('resize', { cols: term.cols, rows: term.rows });
  }
}

function write(data, options = {}) { smartWrite(data, options); }
function writeReplay(data) { smartWrite(data, { suppressInput: true }); }
function fit() {
  fitAddon?.fit();
  if (!userScrolled && !mobileCopyMode.value) scrollToBottomSoon();
}
function scrollToBottom() {
  setUserScrolled(false);
  flushPending();
  term?.scrollToBottom();
}
function jumpToBottom() {
  scrollToBottom();
  scrollToBottomSoon();
  if (!isMobileViewport()) focusTerm();
}
function clear() {
  pendingWrites.splice(0);
  pendingBytes = 0;
  resetOptimisticEcho();
  term?.clear();
}

// 供外部（SymbolBar 通过 App）同步更新行追踪，保持与键盘输入相同的逻辑
function trackInput(data) {
  resumeOutputForInput();
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
defineExpose({ write, writeReplay, beginReplay, endReplay, fit, scrollToBottom, clear, trackInput, getCols, getRows });

function withSelectionTheme(theme = {}) {
  return {
    ...theme,
    selectionBackground: theme.selectionBackground || TERMINAL_SELECTION_BG,
    selectionForeground: theme.selectionForeground || TERMINAL_SELECTION_FG,
  };
}

watch(() => props.symbolMode, mode => {
  if (mode !== 'shell') mobileModifier.value = '';
});

function onMobileModifier(modifier) {
  mobileModifier.value = mobileModifier.value === modifier ? '' : modifier;
  focusMobileInput();
  nextTick(() => focusMobileInput());
}

function onSymbolInput(data) {
  emitMobileInput(data);
}

function ctrlChar(data) {
  if (data === '\x1b[A') return '\x1b[1;5A';
  if (data === '\x1b[B') return '\x1b[1;5B';
  if (data === '\x1b[C') return '\x1b[1;5C';
  if (data === '\x1b[D') return '\x1b[1;5D';
  if (data === '\x1b[H') return '\x1b[1;5H';
  if (data === '\x1b[F') return '\x1b[1;5F';
  if (data === '\x1b[3~') return '\x1b[3;5~';
  if (data.length !== 1) return data;

  const ch = data[0];
  const code = ch.toUpperCase().charCodeAt(0);
  if (code >= 64 && code <= 95) return String.fromCharCode(code - 64);
  if (ch === '?') return '\x7f';
  return data;
}

function fnKey(data) {
  const fnMap = {
    '1': '\x1bOP',
    '2': '\x1bOQ',
    '3': '\x1bOR',
    '4': '\x1bOS',
    '5': '\x1b[15~',
    '6': '\x1b[17~',
    '7': '\x1b[18~',
    '8': '\x1b[19~',
    '9': '\x1b[20~',
    '0': '\x1b[21~',
    '-': '\x1b[23~',
    '=': '\x1b[24~',
  };
  if (fnMap[data]) return fnMap[data];
  if (data === '\x1b[A') return '\x1b[5~';
  if (data === '\x1b[B') return '\x1b[6~';
  if (data === '\x1b[D') return '\x1b[H';
  if (data === '\x1b[C') return '\x1b[F';
  return data;
}

function applyMobileModifier(data) {
  const modifier = mobileModifier.value;
  if (!modifier || !data) return data;
  mobileModifier.value = '';
  if (modifier === 'ctrl') return ctrlChar(data);
  if (modifier === 'alt') return `\x1b${data}`;
  if (modifier === 'fn') return fnKey(data);
  return data;
}

function emitMobileInput(data) {
  if (!data) return;
  const input = applyMobileModifier(data);
  echoLocalInput(input);
  emit('input', input);
  nextTick(() => focusMobileInput());
}

function onMobileInput(e) {
  if (mobileInputComposing) return;
  let value = e.target.value;
  e.target.value = '';
  if (!value) return;
  // Android（keyCode 229 / Unidentified）下 Enter 可能以 '\n' 走 input 事件而非 keydown，
  // 按当前回车模式归一化为 '\r'，避免"回车不发送"
  if (mobileEnterSends.value && value.includes('\n')) {
    value = value.replace(/\n/g, '\r');
  }
  emitMobileInput(value);
}

function onMobileCompositionStart() {
  mobileInputComposing = true;
}

function onMobileCompositionEnd(e) {
  mobileInputComposing = false;
  const value = e.target.value;
  if (value) emitMobileInput(value);
  e.target.value = '';
}

function onMobileKeydown(e) {
  if (mobileInputComposing) return;
  const mapped = {
    Enter: mobileEnterSends.value ? '\r' : '\n',
    Backspace: '\x7f',
    Tab: '\t',
    Escape: '\x1b',
    ArrowUp: '\x1b[A',
    ArrowDown: '\x1b[B',
    ArrowRight: '\x1b[C',
    ArrowLeft: '\x1b[D',
    Home: '\x1b[H',
    End: '\x1b[F',
    Delete: '\x1b[3~',
  }[e.key];
  if (!mapped) return;
  e.preventDefault();
  e.target.value = '';
  emitMobileInput(mapped);
}

function onMobilePaste(e) {
  const text = e.clipboardData?.getData('text');
  if (!text) return;
  e.preventDefault();
  e.target.value = '';
  emitMobileInput(text);
}

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

function getTerminalBufferText() {
  const buffer = term?.buffer?.active;
  if (!buffer) return terminalSelection.value || '';

  const rows = [];
  for (let i = 0; i < buffer.length; i += 1) {
    const line = buffer.getLine(i);
    if (!line) continue;
    const text = line.translateToString(true);
    if (line.isWrapped && rows.length > 0) {
      rows[rows.length - 1] += text;
    } else {
      rows.push(text);
    }
  }
  return rows.join('\n').replace(/\n+$/g, '');
}

function openMobileCopyMode() {
  if (!isMobileViewport()) return;
  clearLongPressTimer();
  ctxMenu.show = false;
  suppressTerminalFocusUntil = Date.now() + 1200;
  blurTerminalInputs();
  copyModeOpenedNearBottom = isNearBottom();
  setUserScrolled(true);
  mobileCopyText.value = getTerminalBufferText();
  mobileCopyMode.value = true;
  nextTick(() => {
    const el = mobileCopyTextRef.value;
    if (!el) return;
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  });
}

function blurTerminalInputs() {
  mobileInputRef.value?.blur?.();
  termRef.value?.querySelector('.xterm-helper-textarea')?.blur?.();
  const active = document.activeElement;
  if (active?.blur && wrapRef.value?.contains(active)) active.blur();
}

function closeMobileCopyMode() {
  mobileCopyMode.value = false;
  mobileCopyText.value = '';
  suppressTerminalFocusUntil = Date.now() + 800;
  if (copyModeOpenedNearBottom || isNearBottom()) {
    setUserScrolled(false);
    flushPending();
    scrollToBottomSoon();
  }
  nextTick(() => blurTerminalInputs());
}

function copyMobileText() {
  const el = mobileCopyTextRef.value;
  const selected = getSelectedMobileCopyText(el);
  copyText(selected || mobileCopyText.value);
}

function getSelectedMobileCopyText(el) {
  if (!el) return '';
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return '';
  const selected = selection.toString();
  if (!selected) return '';
  const nodeInside = node => {
    const target = node?.nodeType === 1 ? node : node?.parentNode;
    return !!target && el.contains(target);
  };
  return nodeInside(selection.anchorNode) || nodeInside(selection.focusNode) ? selected : '';
}

function copyTerminalSelection() {
  const sel = term?.getSelection() || terminalSelection.value;
  copyText(sel);
  terminalSelection.value = '';
}

function clearLongPressTimer() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  touchStartPoint = null;
  touchMoved = false;
}

function onTermTouchStart(e) {
  if (!isMobileViewport() || mobileCopyMode.value) return;
  const touch = e.touches?.[0];
  if (!touch) return;
  touchStartPoint = { x: touch.clientX, y: touch.clientY };
  touchMoved = false;
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    if (!touchMoved) {
      suppressTerminalFocusUntil = Date.now() + 1200;
      blurTerminalInputs();
      openContextMenuAt(touch.clientX, touch.clientY);
    }
  }, 650);
}

function onTermTouchMove(e) {
  if (!isMobileViewport()) return;
  const touch = e.touches?.[0];
  if (!touch || !touchStartPoint) return;
  const dx = Math.abs(touch.clientX - touchStartPoint.x);
  const dy = touch.clientY - touchStartPoint.y;
  if (dx > 10 || Math.abs(dy) > 10) {
    touchMoved = true;
    clearTimeout(longPressTimer);
    longPressTimer = null;
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
      .then(text => {
        if (text) {
          resumeOutputForInput();
          emit('paste', text);
        }
      })
      .catch(() => {
        // HTTP 下无权限，用户需要用右键菜单或 Ctrl+Shift+V 触发原生粘贴
      });
  }
}

function isPasteShortcut(e) {
  if (e.altKey) return false;
  if (!(e.ctrlKey || e.metaKey)) return false;
  return e.key?.toLowerCase?.() === 'v' || e.code === 'KeyV';
}

function focusPasteTrapForNativePaste() {
  awaitingPaste = true;
  clearNativePasteFallback();
  const input = pasteInputRef.value;
  if (!input) {
    awaitingPaste = false;
    doPaste();
    return;
  }
  input.value = '';
  input.removeAttribute('readonly');
  try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  input.select?.();
  nativePasteFallbackTimer = setTimeout(() => {
    if (!awaitingPaste) return;
    awaitingPaste = false;
    doPaste();
    nextTick(() => focusTerm());
  }, 160);
}

function onTerminalKeydownCapture(e) {
  if (e.shiftKey && (e.key === 'PageUp' || e.key === 'Home')) beginScrollBack();
  else if (e.shiftKey && (e.key === 'PageDown' || e.key === 'End')) markUserScrollIntent();
  if (!isPasteShortcut(e)) return;
  focusPasteTrapForNativePaste();
  e.stopPropagation();
}

function onContextMenu(e) {
  e.preventDefault();
  clearLongPressTimer();
  if (isMobileViewport()) {
    suppressTerminalFocusUntil = Date.now() + 1200;
    blurTerminalInputs();
  }
  openContextMenuAt(e.clientX, e.clientY);
}
function openContextMenuAt(x, y) {
  ctxMenu.x = Math.min(x, window.innerWidth - 168);
  ctxMenu.y = Math.min(y, window.innerHeight - 176);
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
      .then(text => {
        if (text) {
          resumeOutputForInput();
          emit('paste', text);
        }
      })
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
  clearNativePasteFallback();
  handleClipboardPaste(e);
  nextTick(() => focusTerm());
}

function clearNativePasteFallback() {
  clearTimeout(nativePasteFallbackTimer);
  nativePasteFallbackTimer = null;
}
function onTrapBlur() {
  awaitingPaste = false;
  // 焦点离开 paste-trap 时立即还给 xterm
  nextTick(() => focusTerm());
}
// paste-trap 收到非粘贴按键时（用户直接打字），把焦点和输入转发给 xterm
function onTrapKeydown(e) {
  if (e.key === 'v' && (e.ctrlKey || e.metaKey)) return; // 允许 Ctrl+V 完成粘贴
  // 其他任何键：把输入转发给 PTY，焦点归还 xterm
  awaitingPaste = false;
  pasteInputRef.value.value = '';
  e.preventDefault();
  // 将这次按键作为 PTY 输入发送
  if (e.key.length === 1) emit('input', e.key);
  nextTick(() => focusTerm());
}
function ctxTextSelect() {
  openMobileCopyMode();
}
function ctxSelectAll() { ctxMenu.show = false; term?.selectAll(); }
function ctxClear()     { ctxMenu.show = false; term?.clear(); }
</script>

<style scoped>
.terminal-wrap {
  position: relative;
  display: flex; flex-direction: column; width: 100%; height: 100%; overflow: hidden;
}
.term-container {
  flex: 1; min-height: 0; overflow: hidden; padding: 0;
  background: var(--bg);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 14%, transparent), transparent 120px),
    var(--bg);
}
.term-container :deep(.xterm) {
  width: 100%;
  height: 100%;
}
.term-container.drag-over {
  outline: 2px dashed var(--border-strong);
  outline: 2px dashed color-mix(in srgb, var(--neon) 75%, transparent);
  outline-offset: -4px;
  background: var(--bg2);
  background: color-mix(in srgb, var(--neon) 5%, var(--bg));
}

.mobile-input-trap {
  position: absolute;
  left: 8px;
  bottom: 8px;
  z-index: 2;
  width: 2px;
  height: 24px;
  padding: 0;
  border: 0;
  outline: 0;
  opacity: 0.01;
  color: transparent;
  background: transparent;
  caret-color: transparent;
  resize: none;
  pointer-events: none;
  font-size: 16px;
  line-height: 1;
  user-select: text;
  -webkit-user-select: text;
}

.mobile-copy-layer {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  color: var(--text);
  background-color: var(--bg);
  background: var(--bg);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 94%, transparent), color-mix(in srgb, var(--bg) 96%, transparent)),
    var(--bg);
  border: 1px solid var(--border);
  border-color: color-mix(in srgb, var(--neon) 22%, transparent);
}

.mobile-copy-toolbar {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--hairline);
  background-color: var(--panel);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 92%, transparent);
}

.mobile-copy-action,
.mobile-selection-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-color: color-mix(in srgb, var(--neon) 24%, transparent);
  border-radius: var(--radius-sm);
  background-color: var(--panel2);
  background: var(--panel2);
  background: color-mix(in srgb, var(--panel2) 88%, transparent);
  color: var(--text);
  cursor: pointer;
  line-height: 1;
  --app-icon-size: 16px;
}

.mobile-copy-action:active,
.mobile-selection-copy:active {
  background: var(--panel3);
  background: color-mix(in srgb, var(--neon) 14%, var(--panel2));
  color: var(--neon);
}

.mobile-copy-text {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  box-sizing: border-box;
  display: block;
  margin: 0;
  border: 0;
  outline: 0;
  resize: none;
  padding: 10px;
  color: inherit;
  background-color: var(--bg);
  background: var(--bg);
  font-family: 'RemoteCC MesloLGM NF', 'MesloLGM NF', 'RemoteCC MesloLGL NF', 'MesloLGL NF', 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  user-select: text;
  -webkit-user-select: text;
  -webkit-touch-callout: default;
  touch-action: pan-y;
  cursor: text;
}

.mobile-selection-copy {
  position: absolute;
  right: 10px;
  top: 10px;
  z-index: 7;
  box-shadow: 0 10px 24px color-mix(in srgb, #000000 24%, transparent);
}

.img-upload-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: var(--symbol-button-height, 30px);
  min-height: var(--symbol-button-height, 30px);
  min-width: 42px;
  background: var(--panel2);
  background: color-mix(in srgb, var(--neon) 8%, var(--panel2));
  border: 1px solid var(--border);
  border-color: color-mix(in srgb, var(--neon) 24%, transparent);
  border-radius: var(--radius-sm);
  color: var(--neon);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  transition: background .12s, border-color .12s, transform .12s, opacity .12s;
  user-select: none;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
  flex: 0 0 42px;
}
.img-upload-btn:hover { background: var(--panel3); background: color-mix(in srgb, var(--neon) 15%, transparent); border-color: var(--border-strong); transform: translateY(-1px); }
.img-upload-btn.uploading { opacity: .6; cursor: default; }
.jump-bottom-btn {
  position: absolute;
  right: 14px;
  bottom: 43px;
  z-index: 6;
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; min-width: 28px; padding: 0 8px;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--text);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  box-shadow: 0 8px 22px color-mix(in srgb, #000000 28%, transparent);
  cursor: pointer;
  --app-icon-size: 14px;
}
.jump-bottom-btn.has-new {
  color: var(--neon);
  border-color: color-mix(in srgb, var(--neon) 45%, transparent);
}
.jump-bottom-btn:hover { background: var(--panel2); }
.img-upload-progress {
  position: absolute;
  left: 10px;
  bottom: 43px;
  z-index: 5;
  width: min(300px, calc(100vw - 20px));
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--text);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--border);
  border-color: color-mix(in srgb, var(--neon) 28%, transparent);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  box-shadow: 0 8px 22px color-mix(in srgb, #000000 28%, transparent);
  --app-icon-size: 12px;
}
.iup-row { display: flex; align-items: center; gap: 6px; color: var(--neon); }
.iup-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iup-cancel {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; flex: none;
  border: none; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer;
}
.iup-cancel:hover { color: var(--danger); background: var(--panel2); }
.iup-track { height: 3px; margin: 5px 0 4px; border-radius: 2px; background: var(--panel2); overflow: hidden; }
.iup-bar { height: 100%; background: var(--neon); transition: width .2s; }
.iup-detail { display: flex; gap: 8px; justify-content: space-between; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.img-path-hint.error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, transparent);
}
.img-path-hint {
  position: absolute;
  left: 10px;
  bottom: 43px;
  z-index: 5;
  display: inline-flex; align-items: center; gap: 5px;
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--neon);
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--border);
  border-color: color-mix(in srgb, var(--neon) 28%, transparent);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  box-shadow: 0 8px 22px color-mix(in srgb, #000000 28%, transparent);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: min(260px, calc(100vw - 20px));
  pointer-events: none;
  --app-icon-size: 12px;
}
@media (max-width: 700px) {
  .term-container :deep(.xterm-viewport) {
    touch-action: pan-y;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .term-container :deep(.xterm-screen) {
    touch-action: manipulation;
  }
  .terminal-shortcuts {
    display: flex;
  }
  .img-upload-btn {
    width: 100%;
    min-width: 0;
    flex: 1 1 auto;
    height: var(--symbol-button-height, 29px);
    min-height: var(--symbol-button-height, 29px);
  }
  .img-path-hint, .img-upload-progress, .jump-bottom-btn {
    bottom: 78px;
  }
}

@media (min-width: 701px) {
  .terminal-shortcuts {
    display: none;
  }
  .img-path-hint, .img-upload-progress {
    bottom: 10px;
  }
  .jump-bottom-btn {
    bottom: 14px;
  }
}
</style>

<style>
.ctx-overlay {
  position: fixed; inset: 0; z-index: 9999;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}
.ctx-menu {
  position: fixed; background-color: var(--panel); background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 4px; min-width: 200px;
  box-shadow: var(--shadow), 0 0 16px var(--glow); z-index: 10000;
}
.ctx-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; cursor: pointer; color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  padding: 8px 10px; border-radius: var(--radius-sm); text-align: left; transition: background .1s;
}
.ctx-item:hover { background: var(--panel2); background: color-mix(in srgb, var(--neon) 10%, transparent); }
.ctx-icon {
  color: var(--neon); font-size: 13px; width: 16px; text-align: center; flex-shrink: 0;
  line-height: 1; overflow: visible; --app-icon-size: 13px;
}
.ctx-kbd  { margin-left: auto; color: var(--muted); font-size: 10px; }
.ctx-divider { height: 1px; background: var(--hairline); margin: 3px 6px; }
.paste-trap {
  position: fixed; top: -9999px; left: -9999px;
  width: 1px; height: 1px; opacity: 0; pointer-events: none;
}
</style>
