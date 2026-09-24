<template>
  <div class="sh-root">
    <div v-if="statusVisible" class="sh-status" :class="`is-${status}`">
      <span class="sh-status-dot"></span>
      <span>{{ statusLabel }}</span>
    </div>
    <Terminal
      ref="terminalRef"
      class="sh-terminal"
      :theme="theme"
      symbol-mode="shell"
      @input="onInput"
      @response="sendInput"
      @resize="onResize"
      @paste="onPaste"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Terminal from './Terminal.vue';
import { api, createWS } from '../api/index.js';
import { useI18n } from '../i18n.js';

const { t } = useI18n();
const props = defineProps({
  theme: { type: String, default: 'cyber' },
  initialCwd: { type: String, default: '/' },
  shellId: { type: String, default: '1' },
});
const terminalRef = ref(null);
const status = ref('connecting');
const cwd = ref(props.initialCwd || '/');
const transport = ref('ws');
const connectedBadgeVisible = ref(false);
let ws = null;
let closing = false;
let wsRun = 0;
let readyTimer = null;
let fallbackTimer = null;
let heartbeatTimer = null;
let heartbeatTimeout = null;
let httpRun = 0;
let connectedBadgeTimer = null;
let replayingOutput = false;
let wsUpgradeTimer = null;
const WS_FALLBACK_DELAY = 3000;
const WS_HEARTBEAT_INTERVAL = 25000;
const WS_HEARTBEAT_TIMEOUT = 8000;
const HTTP_POLL_WAIT = 5000;
const WS_UPGRADE_MIN = 30000;
const WS_UPGRADE_MAX = 300000;
let wsUpgradeDelay = WS_UPGRADE_MIN;
let hasConnected = false;
let reconnectNoticePending = false;

const statusLabel = computed(() => {
  if (status.value === 'connected') return `${t.value.shell_status_connected} · ${transport.value.toUpperCase()}`;
  if (status.value === 'connecting') return t.value.shell_status_reconnecting;
  if (status.value === 'closed') return t.value.shell_status_closed;
  if (status.value === 'error') return t.value.shell_status_error;
  return status.value;
});
const statusVisible = computed(() => status.value !== 'connected' || connectedBadgeVisible.value);

function clearTimers() {
  clearTimeout(readyTimer);
  clearTimeout(fallbackTimer);
  clearInterval(heartbeatTimer);
  clearTimeout(heartbeatTimeout);
  clearTimeout(connectedBadgeTimer);
  clearTimeout(wsUpgradeTimer);
  heartbeatTimer = null;
  heartbeatTimeout = null;
  connectedBadgeTimer = null;
  wsUpgradeTimer = null;
}

// HTTP 回退后周期性尝试重新升级到 WS，避免一次 WS 断开后永久停留在长轮询。
// 失败会自动回落 HTTP 并按指数退避重排，成功则重置退避。
function scheduleWsUpgrade() {
  clearTimeout(wsUpgradeTimer);
  wsUpgradeTimer = setTimeout(() => {
    wsUpgradeTimer = null;
    if (closing || transport.value !== 'http') return;
    wsUpgradeDelay = Math.min(wsUpgradeDelay * 2, WS_UPGRADE_MAX);
    start();
  }, wsUpgradeDelay);
}

function markHeartbeatAlive() {
  clearTimeout(heartbeatTimeout);
  heartbeatTimeout = null;
}

function endReplayState() {
  if (!replayingOutput) return;
  replayingOutput = false;
  terminalRef.value?.endReplay?.();
}

function refreshTerminalView() {
  nextTick(() => {
    terminalRef.value?.fit?.();
    terminalRef.value?.scrollToBottom?.();
  });
}

function markDisconnected() {
  if (hasConnected) reconnectNoticePending = true;
  connectedBadgeVisible.value = false;
  clearTimeout(connectedBadgeTimer);
  connectedBadgeTimer = null;
}

function markConnected(nextTransport, { refresh = true } = {}) {
  const shouldShowBadge = !hasConnected || reconnectNoticePending || status.value !== 'connected' || transport.value !== nextTransport;
  const shouldRefresh = refresh || reconnectNoticePending;
  transport.value = nextTransport;
  status.value = 'connected';
  hasConnected = true;
  reconnectNoticePending = false;
  if (nextTransport === 'ws') {
    wsUpgradeDelay = WS_UPGRADE_MIN;
    clearTimeout(wsUpgradeTimer);
    wsUpgradeTimer = null;
  }
  if (shouldShowBadge) {
    connectedBadgeVisible.value = true;
    clearTimeout(connectedBadgeTimer);
    connectedBadgeTimer = setTimeout(() => {
      connectedBadgeVisible.value = false;
      connectedBadgeTimer = null;
    }, 3000);
  }
  if (shouldRefresh) refreshTerminalView();
}

function start() {
  const run = ++wsRun;
  cleanup(false);
  closing = false;
  status.value = 'connecting';
  transport.value = 'ws';
  const socket = createWS();
  ws = socket;

  function forceHttpReconnect(message) {
    if (run !== wsRun || closing) return;
    endReplayState();
    markDisconnected();
    wsRun++;
    clearTimers();
    try { socket.close(); } catch (_) {}
    startHttp();
  }

  function switchToHttpFallback(message) {
    if (run !== wsRun || closing || status.value === 'connected') return;
    forceHttpReconnect(message);
  }

  fallbackTimer = setTimeout(switchToHttpFallback, WS_FALLBACK_DELAY);

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    clearTimeout(heartbeatTimeout);
    heartbeatTimer = setInterval(() => {
      if (run !== wsRun || closing || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: 'shell_ping', shellId: props.shellId, ts: Date.now() }));
      } catch (_) {
        forceHttpReconnect();
        return;
      }
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = setTimeout(() => {
        forceHttpReconnect();
      }, WS_HEARTBEAT_TIMEOUT);
    }, WS_HEARTBEAT_INTERVAL);
  }

  socket.onopen = () => {
    if (run !== wsRun) return;
    clearTimeout(fallbackTimer);
    nextTick(() => {
      if (run !== wsRun || socket.readyState !== WebSocket.OPEN) return;
      terminalRef.value?.fit();
      socket.send(JSON.stringify({
        type: 'shell_start',
        shellId: props.shellId,
        cwd: cwd.value || '/',
        cols: terminalRef.value?.getCols?.() ?? 80,
        rows: terminalRef.value?.getRows?.() ?? 24,
      }));
      readyTimer = setTimeout(() => {
        if (run !== wsRun || status.value !== 'connecting') return;
        status.value = 'error';
        switchToHttpFallback();
      }, 3000);
    });
  };

  socket.onmessage = (evt) => {
    if (run !== wsRun) return;
    const data = evt.data;
    try {
      const msg = JSON.parse(data);
      if (!msg?.type) throw 0;
      if (msg.type === 'session_list') return;
      if (msg.type === 'shell_replay_start') {
        replayingOutput = true;
        terminalRef.value?.beginReplay?.();
        terminalRef.value?.clear?.();
        return;
      }
      if (msg.type === 'shell_replay_end') {
        endReplayState();
        terminalRef.value?.fit?.();
        refreshTerminalView();
        return;
      }
      if (msg.type === 'shell_ready') {
        clearTimeout(readyTimer);
        cwd.value = msg.cwd || cwd.value;
        markConnected('ws');
        markHeartbeatAlive();
        startHeartbeat();
        return;
      }
      if (msg.type === 'shell_pong') {
        markHeartbeatAlive();
        return;
      }
      if (msg.type === 'shell_error') {
        clearTimeout(readyTimer);
        status.value = 'error';
        return;
      }
      if (msg.type === 'shell_exit') {
        clearTimeout(readyTimer);
        status.value = 'closed';
        return;
      }
    } catch (_) {}
    terminalRef.value?.write(data, { suppressInput: replayingOutput });
  };

  socket.onclose = () => {
    clearTimers();
    endReplayState();
    if (run !== wsRun || closing) return;
    markDisconnected();
    status.value = 'closed';
    setTimeout(() => {
      if (run !== wsRun || closing) return;
      startHttp();
    }, 1000);
  };
  socket.onerror = () => {};
}

function cleanup(kill = true) {
  closing = true;
  endReplayState();
  clearTimers();
  httpRun++;
  if (ws && ws.readyState === WebSocket.OPEN && kill) {
    try { ws.send(JSON.stringify({ type: 'shell_kill', shellId: props.shellId })); } catch (_) {}
  }
  if ((!ws || ws.readyState !== WebSocket.OPEN) && kill) {
    api.shell.kill(props.shellId).catch(() => {});
  }
  try { ws?.close(); } catch (_) {}
  ws = null;
}

function sendInput(data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'shell_input', shellId: props.shellId, data }));
  } else if (status.value === 'connected' || status.value === 'connecting') {
    api.shell.input({
      data,
      cols: terminalRef.value?.getCols?.() ?? 80,
      rows: terminalRef.value?.getRows?.() ?? 24,
    }, props.shellId).catch(() => {});
  }
}

function onInput(data) {
  sendInput(data);
  terminalRef.value?.trackInput?.(data);
}

function onResize({ cols, rows }) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'shell_resize', shellId: props.shellId, cols, rows }));
  } else if (status.value === 'connected' || status.value === 'connecting') {
    api.shell.resize({ cols, rows }, props.shellId).catch(() => {});
  }
}

function onPaste(text) {
  sendInput(text);
}

function applyHttpSnapshot(snapshot, clearFirst = false) {
  if (!snapshot) return;
  clearTimeout(readyTimer);
  cwd.value = snapshot.cwd || cwd.value;
  const shouldRefresh = Boolean(clearFirst || snapshot.reset || snapshot.output || reconnectNoticePending);
  const suppressReplayInput = Boolean(clearFirst || snapshot.reset);
  if (clearFirst || snapshot.reset) terminalRef.value?.clear?.();
  if (snapshot.output) terminalRef.value?.write?.(snapshot.output, { suppressInput: suppressReplayInput });
  if (snapshot.alive === false) {
    status.value = 'closed';
    refreshTerminalView();
    return;
  }
  markConnected('http', { refresh: shouldRefresh });
}

async function startHttp() {
  const run = ++httpRun;
  clearTimers();
  try { ws?.close(); } catch (_) {}
  ws = null;
  closing = false;
  status.value = 'connecting';
  transport.value = 'http';

  try {
    await nextTick();
    terminalRef.value?.fit?.();
    const snapshot = await api.shell.start({
      cwd: cwd.value || '/',
      cols: terminalRef.value?.getCols?.() ?? 80,
      rows: terminalRef.value?.getRows?.() ?? 24,
    }, props.shellId);
    if (run !== httpRun || closing) return;
    applyHttpSnapshot(snapshot, true);
    pollHttp(run, snapshot.cursor ?? 0);
    scheduleWsUpgrade();
  } catch (e) {
    if (run !== httpRun || closing) return;
    status.value = 'error';
    setTimeout(() => {
      if (run === httpRun && !closing) startHttp();
    }, 2000);
  }
}

async function pollHttp(run, cursor) {
  let retryDelay = 1000;
  while (run === httpRun && !closing) {
    try {
      const result = await api.shell.poll(cursor, HTTP_POLL_WAIT, props.shellId);
      if (run !== httpRun || closing) return;
      retryDelay = 1000;
      applyHttpSnapshot(result, false);
      cursor = result.cursor ?? cursor;
      if (result.alive === false) return;
    } catch (_) {
      if (run !== httpRun || closing) return;
      markDisconnected();
      status.value = 'connecting';
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      if (run !== httpRun || closing) return;
      startHttp();
      return;
    }
  }
}

onMounted(start);
onBeforeUnmount(() => cleanup(false));
</script>

<style scoped>
.sh-root {
  position: relative;
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background: transparent;
}
.sh-terminal {
  flex: 1; min-height: 0;
}
.sh-status {
  position: absolute;
  z-index: 4;
  top: 8px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: min(220px, calc(100% - 20px));
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--panel) 84%, transparent);
  color: var(--muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
  box-shadow: 0 8px 20px color-mix(in srgb, #000 20%, transparent);
}
.sh-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
  flex-shrink: 0;
}
.sh-status.is-connected {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 36%, var(--border));
}
.sh-status.is-connecting {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 36%, var(--border));
}
.sh-status.is-closed,
.sh-status.is-error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 36%, var(--border));
}
</style>
