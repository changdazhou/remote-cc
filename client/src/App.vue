<template>
  <div class="app-root" :style="appChromeVars">

    <!-- ── Login ─────────────────────────────────────────────────────── -->
    <div v-if="!authed" class="login-overlay">
      <div class="login-box">
        <div class="login-logo">
          Remote<span class="logo-cc">CC</span>
        </div>
        <div class="login-sub">{{ t.login_sub }}</div>
        <input v-model="loginUser" class="neon-input" :placeholder="t.login_user"
          autocomplete="username" @keyup.enter="doLogin" />
        <input v-model="loginPass" class="neon-input" type="password" :placeholder="t.login_pass"
          autocomplete="current-password" @keyup.enter="doLogin" />
        <div v-if="loginError" class="login-error">{{ t.login_error }}</div>
        <button class="start-btn" :disabled="logging" @click="doLogin">
          {{ logging ? t.login_loading : t.login_btn }}
        </button>
      </div>
    </div>

    <!-- ── Main ──────────────────────────────────────────────────────── -->
    <template v-else>

      <!-- Global topbar (always visible) -->
      <header class="topbar">
        <div class="topbar-left">
          <!-- Session switcher (only when in terminal view) -->
          <div v-if="view === 'terminal'" class="session-switcher" ref="switcherRef">
            <button class="switcher-btn" @click="switcherOpen = !switcherOpen">
              <span class="switcher-dot" :class="currentMeta?.alive ? 'live' : 'dead'"></span>
              <span class="switcher-name">{{ currentMeta?.name || '…' }}</span>
              <AppIcon name="chevron" class="switcher-chevron" :class="{ open: switcherOpen }" />
            </button>
            <!-- Dropdown -->
            <div v-if="switcherOpen" class="switcher-dropdown">
              <div class="switcher-section-label">SESSIONS</div>
              <button
                v-for="s in aliveSessions" :key="s.sessionId"
                class="switcher-item"
                :class="{ current: s.sessionId === activeSessionId }"
                @click="pickSession(s)"
              >
                <span class="switcher-dot live"></span>
                <span class="switcher-item-name">{{ s.name }}</span>
                <span class="switcher-item-cwd">{{ shortCwd(s.workingDir) }}</span>
                <button class="switcher-kill-btn" :title="t.stop_session"
                  @click.stop="killSession(s); switcherOpen = false">
                  <AppIcon name="trash" />
                </button>
              </button>
              <div v-if="!aliveSessions.length" class="switcher-empty">{{ t.no_sessions }}</div>
              <div class="switcher-divider"></div>
              <button v-if="currentMeta?.alive"
                class="switcher-item switcher-danger"
                @click="killSession(currentMeta); switcherOpen = false">
                <AppIcon name="trash" /> {{ t.stop_session }}
              </button>
              <button class="switcher-item switcher-new" @click="switcherOpen = false; view = 'home'">
                <AppIcon name="plus" /> {{ t.new_conv }}
              </button>
            </div>
          </div>
          <!-- Home button -->
          <button v-else class="topbar-brand" @click="view = 'home'">
            Remote<span class="logo-cc">CC</span>
          </button>
        </div>

        <div class="topbar-right">
          <!-- Multi-client indicator -->
          <span v-if="view === 'terminal' && (currentMeta?.clientCount || 0) > 1"
            class="topbar-badge" :title="t.topbar_multi_attached_title">
            <AppIcon name="users" />{{ currentMeta.clientCount }}
          </span>
          <!-- Home -->
          <button
            class="topbar-icon-btn"
            :class="{ active: view === 'home' }"
            @click="view = 'home'" :title="t.topbar_home_title">
            <AppIcon name="home" />
          </button>
          <!-- Shell slots -->
          <button
            v-for="id in visibleShellIds"
            :key="id"
            class="topbar-icon-btn shell-slot-btn"
            :class="{ active: view === 'shell' && activeShellId === id }"
            @click="openShell(id)" :title="shellTitle(id)">
            <AppIcon name="terminal" />
            <span v-if="visibleShellIds.length > 1" class="topbar-icon-index">{{ id }}</span>
          </button>
          <!-- Files -->
          <button class="topbar-icon-btn" :class="{ active: view === 'files' }"
            @click="toggleOverlay('files')" :title="t.topbar_files_title">
            <AppIcon name="folder" />
          </button>
          <!-- Settings -->
          <button class="topbar-icon-btn" :class="{ active: view === 'settings' }"
            @click="toggleOverlay('settings')" :title="t.topbar_settings_title">
            <AppIcon name="settings" />
          </button>
          <!-- Help -->
          <button class="topbar-icon-btn" :class="{ active: view === 'help' }"
            @click="toggleOverlay('help')" :title="t.topbar_help_title">
            <AppIcon name="help" />
          </button>
        </div>
      </header>

      <!-- Content -->
      <div class="content" :class="{ 'is-terminal': view === 'terminal' || view === 'shell' }">

        <!-- ── Home: conversation list ───────────────────────────────── -->
        <div v-show="view === 'home'" class="home-view">
          <ConversationList
            :sessions="sessionList"
            :loading="sessionsLoading"
            @open="openSession"
            @new="view = 'new-session'"
            @kill="killSession"
            @delete="deleteSession"
            @rename="renameSession"
            @log="openLog"
          />
        </div>

        <!-- ── New conversation ──────────────────────────────────────── -->
        <div v-show="view === 'new-session'" class="new-view">
          <NewConversation @start="startSession" @cancel="view = 'home'" />
        </div>

        <!-- ── Log viewer ────────────────────────────────────────────── -->
        <div v-show="view === 'log'" class="log-view">
          <LogViewer v-if="logTarget" :session="logTarget" @close="view = prevView" />
        </div>

        <!-- ── Settings ─────────────────────────────────────────────── -->
        <div v-show="view === 'settings'" class="settings-view">
          <SettingsPage @logout="doLogout" />
        </div>

        <!-- ── Help ─────────────────────────────────────────────────────── -->
        <div v-show="view === 'help'" class="help-view">
          <HelpPage />
        </div>

        <!-- ── Files ─────────────────────────────────────────────────── -->
        <div v-show="view === 'files'" class="files-view">
          <FileBrowser
            :initial-path="fileBrowserInitialPath"
            @close="toggleOverlay('files')"
            @path-change="rememberFileBrowserPath"
          />
        </div>

        <!-- ── Shared terminal ──────────────────────────────────────── -->
        <div v-if="shellActive && openedShellIds.length" v-show="view === 'shell'" class="shell-view">
          <ShellTerminal
            v-for="id in openedShellIds"
            v-show="id === activeShellId"
            :key="id"
            :theme="theme"
            :shell-id="id"
            :initial-cwd="settings.shellDefaultCwd || '/'"
            @close="closeShell"
          />
        </div>

        <!-- ── Terminals (always in DOM, v-show to switch) ───────────── -->
        <div v-show="view === 'terminal'" class="terminal-view">
          <div v-if="activeTerminalStatusVisible" class="terminal-status" :class="`is-${activeTerminalStatus}`">
            <span class="terminal-status-dot"></span>
            <span>{{ activeTerminalStatusLabel }}</span>
          </div>
          <Terminal
            v-for="entry in termList"
            :key="entry.sid"
            v-show="entry.sid === activeSessionId"
            :theme="theme"
            optimistic-echo
            :ref="el => setTermRef(entry.sid, el)"
            @input="onTermInput(entry.sid, $event)"
            @resize="onTermResize(entry.sid, $event)"
            @paste="onTermPaste(entry.sid, $event)"
          />
        </div>

      </div>
    </template>

    <!-- ── Kill confirm dialog ─────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="killConfirm.show" class="kc-overlay" @click="killConfirm.show = false">
        <div class="kc-box" @click.stop>
          <div class="kc-title">{{ t.stop_session }}</div>
          <div class="kc-msg">终止 <strong>{{ killConfirm.session?.name }}</strong>？会话将结束并退出终端。</div>
          <div class="kc-btns">
            <button class="kc-cancel" @click="killConfirm.show = false">{{ t.cancel }}</button>
            <button class="kc-ok" @click="confirmKillAndExit">{{ t.stop_btn }} <AppIcon name="stop" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, shallowReactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { login, logout, isLoggedIn, getSavedUsername, createWS, api, setUnauthorizedHandler } from './api/index.js';
import Terminal          from './components/Terminal.vue';
import LogViewer         from './components/LogViewer.vue';
import ConversationList  from './components/ConversationList.vue';
import NewConversation   from './components/NewConversation.vue';
import SettingsPage      from './components/SettingsPage.vue';
import HelpPage          from './components/HelpPage.vue';
import FileBrowser       from './components/FileBrowser.vue';
import ShellTerminal     from './components/ShellTerminal.vue';
import AppIcon           from './components/AppIcon.vue';
import {
  applySettings,
  getLocalSettingsUpdatedAt,
  markSettingsSynced,
  settings,
  snapshotSettings,
  COLOR_THEMES,
} from './settings.js';
import { useI18n } from './i18n.js';
import { route, navigate } from './router.js';

const { t } = useI18n();

// ── Themes ────────────────────────────────────────────────────────────────────
const THEME_LIST = COLOR_THEMES;
const theme  = computed(() => settings.colorTheme);
function setTheme(id) { settings.colorTheme = id; }
const appChromeVars = computed(() => ({
  '--topbar-h': `${Math.min(64, Math.max(38, Number(settings.topbarHeight) || 44))}px`,
}));
const fileBrowserInitialPath = computed(() =>
  settings.fileBrowserLastPath || settings.fileBrowserDefaultPath || '/'
);

function rememberFileBrowserPath(path) {
  const nextPath = String(path || '').trim();
  if (nextPath) settings.fileBrowserLastPath = nextPath;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const authed     = ref(isLoggedIn());
const loginUser  = ref(getSavedUsername());
const loginPass  = ref('');
const loginError = ref('');
const logging    = ref(false);

async function doLogin() {
  if (logging.value) return;
  loginError.value = '';
  logging.value = true;
  try {
    await login(loginUser.value, loginPass.value);
    settings.username = loginUser.value;
    authed.value = true;
    await syncSettingsFromServer();
    settings.username = loginUser.value;
    init();
  } catch (e) {
    loginError.value = 'Invalid credentials';
  } finally {
    logging.value = false;
  }
}

// ── Control WS (session list only) ───────────────────────────────────────────
let controlWS = null;
let reconnTimer = null;
const wsReady = ref(false);
const WS_FALLBACK_DELAY = 3000;
const HTTP_POLL_WAIT = 5000;
const CONTROL_HTTP_POLL_WAIT = 3000;
const CONTROL_WS_FALLBACK_DELAY = 2000;
let controlHttpTimer = null;
let controlFallbackTimer = null;
let controlHttpRun = 0;

const sessionList = ref([]);
const sessionsLoading = ref(true);
const aliveSessions = computed(() => sessionList.value.filter(s => s.alive));
const deadSessions  = computed(() => sessionList.value.filter(s => !s.alive));

function applySessionList(sessions) {
  sessionList.value = Array.isArray(sessions) ? sessions : [];
  sessionsLoading.value = false;
}

function initControlWS() {
  refreshSessionList();
  startControlHttpFallback(CONTROL_WS_FALLBACK_DELAY);

  if (controlWS && controlWS.readyState < 2) return;
  controlWS = createWS();
  controlWS.onopen    = () => {
    wsReady.value = true;
    clearTimeout(controlFallbackTimer);
    stopControlHttpPolling();
  };
  controlWS.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'session_list') applySessionList(msg.sessions);
    } catch (_) {}
  };
  controlWS.onclose   = () => {
    wsReady.value = false;
    clearTimeout(controlFallbackTimer);
    // WS 断开时验证 token 是否仍有效；401 会由 setUnauthorizedHandler 处理
    refreshSessionList();
    startControlHttpFallback(0);
    reconnTimer = setTimeout(initControlWS, 3000);
  };
  controlWS.onerror   = () => {
    if (!wsReady.value) startControlHttpFallback(0);
  };
}

function refreshSessionList() {
  return api.getActiveSessions()
    .then(applySessionList)
    .catch(() => {});
}

function stopControlHttpPolling() {
  controlHttpRun++;
  clearTimeout(controlHttpTimer);
  controlHttpTimer = null;
}

function startControlHttpFallback(delay = CONTROL_HTTP_POLL_WAIT) {
  if (!authed.value) return;
  clearTimeout(controlFallbackTimer);
  controlFallbackTimer = setTimeout(() => {
    if (!authed.value || wsReady.value) return;
    startControlHttpPolling(0);
  }, Math.max(0, delay));
}

function startControlHttpPolling(delay = 0) {
  if (!authed.value || wsReady.value) return;
  const run = ++controlHttpRun;
  clearTimeout(controlHttpTimer);
  controlHttpTimer = setTimeout(async () => {
    if (run !== controlHttpRun || !authed.value || wsReady.value) return;
    await refreshSessionList();
    if (run === controlHttpRun && authed.value && !wsReady.value) {
      startControlHttpPolling(CONTROL_HTTP_POLL_WAIT);
    }
  }, Math.max(0, delay));
}

function sendControlHttp(obj) {
  let request = null;
  if (obj?.type === 'kill' && obj.sessionId) {
    request = api.terminal.kill(obj.sessionId);
  } else if (obj?.type === 'delete' && obj.sessionId) {
    request = api.terminal.deleteSession(obj.sessionId);
  } else if (obj?.type === 'rename' && obj.sessionId) {
    request = api.terminal.rename(obj.sessionId, obj.name || '');
  } else if (obj?.type === 'list') {
    request = Promise.resolve({ ok: true });
  }
  if (!request) return;
  request.then(refreshSessionList).catch(() => {});
}

function sendControl(obj) {
  if (controlWS?.readyState === WebSocket.OPEN) {
    controlWS.send(JSON.stringify(obj));
    return;
  }
  sendControlHttp(obj);
}

// ── Terminal sessions (client-side instances) ─────────────────────────────────
// termList: reactive array of session objects — Vue can track array mutations
// Each entry: { sid, ws, alive, wsStarted, name, workingDir, agent, resumeSessionId, attachSessionId, _destroy }
const termList = reactive([]);   // Array<SessionEntry>
const termRefs = {};             // { [sid]: Terminal component instance }

const activeSessionId = ref('');
const activeEntry = computed(() => findEntry(activeSessionId.value));
function entryWSOpen(entry) {
  return entry?.ws?.readyState === WebSocket.OPEN;
}
const activeTerminalAlive = computed(() => {
  const entry = activeEntry.value;
  if (!entry) return false;
  if (entryWSOpen(entry)) return true;
  const listed = sessionList.value.find(s => s.sessionId === entry.sid || s.sessionId === entry.attachSessionId);
  return listed?.alive ?? entry.alive;
});
const activeTerminalStatus = computed(() => {
  const entry = activeEntry.value;
  if (!entry) return 'closed';
  if (entryWSOpen(entry)) return 'connected';
  if (entry.connectionStatus === 'connecting' && activeTerminalAlive.value && !entry._reconnectNoticePending) return 'connected';
  return entry.connectionStatus || (activeTerminalAlive.value ? 'connected' : 'closed');
});
const activeTerminalStatusVisible = computed(() => {
  const entry = activeEntry.value;
  if (!entry) return false;
  return activeTerminalStatus.value !== 'connected' || !!entry.connectedBadgeVisible;
});
const activeTerminalStatusLabel = computed(() => {
  const entry = activeEntry.value;
  const transport = entryWSOpen(entry) ? 'ws' : (entry?.transport || 'ws');
  if (activeTerminalStatus.value === 'connected') return `${t.value.shell_status_connected} · ${transport.toUpperCase()}`;
  if (activeTerminalStatus.value === 'connecting') return t.value.shell_status_reconnecting;
  if (activeTerminalStatus.value === 'closed') return t.value.shell_status_closed;
  if (activeTerminalStatus.value === 'error') return t.value.shell_status_error;
  return activeTerminalStatus.value;
});
const currentMeta = computed(() => {
  const fromList = sessionList.value.find(s => s.sessionId === activeSessionId.value);
  if (fromList) return fromList;
  const entry = termList.find(e => e.sid === activeSessionId.value);
  if (entry) return { sessionId: entry.sid, name: entry.name, workingDir: entry.workingDir, agent: entry.agent, alive: entry.alive, clientCount: 0 };
  return null;
});

function findEntry(sid) { return termList.find(e => e.sid === sid); }

function clearEntryConnectionBadge(entry) {
  if (!entry?._connectedBadgeTimer) return;
  clearTimeout(entry._connectedBadgeTimer);
  entry._connectedBadgeTimer = null;
}

function markEntryDisconnected(entry) {
  if (!entry) return;
  if (entry._hasConnected) entry._reconnectNoticePending = true;
  entry.connectedBadgeVisible = false;
  clearEntryConnectionBadge(entry);
}

function markEntryConnected(entry, transport, { refresh = true } = {}) {
  if (!entry) return;
  const shouldShowBadge = !entry._hasConnected ||
    entry._reconnectNoticePending ||
    entry.connectionStatus !== 'connected' ||
    entry.transport !== transport;
  const shouldRefresh = refresh || entry._reconnectNoticePending;
  entry.transport = transport;
  entry.connectionStatus = 'connected';
  entry.alive = true;
  entry._hasConnected = true;
  entry._reconnectNoticePending = false;
  if (shouldShowBadge) {
    entry.connectedBadgeVisible = true;
    clearEntryConnectionBadge(entry);
    entry._connectedBadgeTimer = setTimeout(() => {
      entry.connectedBadgeVisible = false;
      entry._connectedBadgeTimer = null;
    }, 3000);
  }
  if (shouldRefresh) {
    nextTick(() => {
      const el = termRefs[entry.sid];
      el?.fit?.();
      el?.scrollToBottom?.();
    });
  }
}

// ── Per-session WS ────────────────────────────────────────────────────────────
function connectEntryWS(entry) {
  if (entry._destroy) { entry._destroy(); entry._destroy = null; }

  let destroyed = false;
  let reconnDelay = 1000;
  let reconnTimeout = null;
  let fallbackTimer = null;
  let heartbeatTimer = null;
  let heartbeatTimeout = null;
  let opened = false;

  const ws = createWS();
  entry.ws = ws;
  entry.transport = 'ws';
  entry.connectionStatus = 'connecting';

  function clearWsTimers() {
    clearTimeout(reconnTimeout);
    clearTimeout(fallbackTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(heartbeatTimeout);
    reconnTimeout = null;
    fallbackTimer = null;
    heartbeatTimer = null;
    heartbeatTimeout = null;
  }

  function endEntryReplay() {
    if (!entry._replayingOutput) return;
    entry._replayingOutput = false;
    termRefs[entry.sid]?.endReplay?.();
  }

  function forceHttpFallback() {
    if (destroyed) return;
    destroyed = true;
    endEntryReplay();
    markEntryDisconnected(entry);
    clearWsTimers();
    try { ws.close(); } catch (_) {}
    startEntryHttp(entry);
  }

  function switchToHttpFallback() {
    if (destroyed || opened) return;
    forceHttpFallback();
  }

  fallbackTimer = setTimeout(switchToHttpFallback, WS_FALLBACK_DELAY);

  function markHeartbeatAlive() {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    clearTimeout(heartbeatTimeout);
    heartbeatTimer = setInterval(() => {
      if (destroyed || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: 'terminal_ping', sessionId: entry.attachSessionId || entry.sid, ts: Date.now() }));
      } catch (_) {
        forceHttpFallback();
        return;
      }
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = setTimeout(forceHttpFallback, 8000);
    }, 25000);
  }

  ws.onopen = () => {
    opened = true;
    clearTimeout(fallbackTimer);
    reconnDelay = 1000;
    markEntryConnected(entry, 'ws', { refresh: false });

    // nextTick 确保 Terminal 组件已 mount 并完成初始 fit
    nextTick(() => {
      const el = termRefs[entry.sid];
      if (el) el.fit();

      const cols = el?.getCols?.() ?? 80;
      const rows = el?.getRows?.() ?? 24;

      if (entry.attachSessionId) {
        ws.send(JSON.stringify({ type: 'attach', sessionId: entry.attachSessionId }));
        // attach 后再发 resize，覆盖服务端 PTY 的旧尺寸
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const el2 = termRefs[entry.sid];
            if (el2) el2.fit();
            ws.send(JSON.stringify({ type: 'resize', cols: el2?.getCols?.() ?? cols, rows: el2?.getRows?.() ?? rows }));
          }
        }, 300);
      } else {
        ws.send(JSON.stringify({
          type: 'start',
          workingDir: entry.workingDir,
          agent: entry.agent || 'claude',
          resumeSessionId: entry.resumeSessionId || '',
          name: entry.name,
          cols, rows,
        }));
      }
    });
  };

  ws.onmessage = (evt) => {
    const data = evt.data;
    try {
      const msg = JSON.parse(data);
      if (!msg?.type) throw 0;

      switch (msg.type) {
        case 'session_id': {
          const realId = msg.sessionId;
          if (entry.sid !== realId) {
            const oldSid = entry.sid;
            // Move termRef
            const el = termRefs[oldSid];
            delete termRefs[oldSid];
            // Update entry.sid in-place (reactive array element)
            entry.sid = realId;
            if (el) termRefs[realId] = el;
            // Update activeSessionId if it was pointing to the placeholder
            if (activeSessionId.value === oldSid) activeSessionId.value = realId;
            // Mark as attach for reconnect
            entry.attachSessionId = realId;
            localStorage.setItem('rcc_last_session', realId);
          }
          markEntryConnected(entry, 'ws');
          markHeartbeatAlive();
          startHeartbeat();
          return;
        }
        case 'terminal_pong':
          markHeartbeatAlive();
          return;
        case 'session_list':
          applySessionList(msg.sessions);
          if (entry.connectionStatus === 'connecting') markEntryConnected(entry, 'ws', { refresh: false });
          return;
        case 'replay_start': {
          entry._replayingOutput = true;
          if (entry.connectionStatus !== 'connected') markEntryConnected(entry, 'ws', { refresh: false });
          const el = termRefs[entry.sid];
          if (el) {
            el.beginReplay?.();
            el.clear();
          }
          return;
        }
        case 'replay_end': {
          if (entry.connectionStatus !== 'connected') markEntryConnected(entry, 'ws', { refresh: false });
          const el = termRefs[entry.sid];
          if (el) {
            el.endReplay?.();
            el.fit();
            nextTick(() => el.scrollToBottom());
            // 发送当前实际尺寸（replay 结束时 PTY 应该知道正确宽度）
            ws.send(JSON.stringify({ type: 'resize', cols: el.getCols?.() ?? 80, rows: el.getRows?.() ?? 24 }));
          }
          entry._replayingOutput = false;
          return;
        }
        case 'exit': {
          handleEntryExit(entry, msg.exitCode);
          return;
        }
        case 'error': {
          entry.connectionStatus = 'error';
          entry.connectedBadgeVisible = false;
          clearEntryConnectionBadge(entry);
          return;
        }
        case 'detached': {
          entry.connectionStatus = 'closed';
          entry.connectedBadgeVisible = false;
          clearEntryConnectionBadge(entry);
          return;
        }
      }
    } catch (_) {}
    // Raw PTY data
    if (entry.connectionStatus !== 'connected') markEntryConnected(entry, 'ws', { refresh: false });
    const el = termRefs[entry.sid];
    if (el) el.write(data, { suppressInput: !!entry._replayingOutput });
  };

  ws.onerror = () => {
    if (!opened) switchToHttpFallback();
  };

  ws.onclose = () => {
    clearWsTimers();
    endEntryReplay();
    if (destroyed) return;
    if (!opened) {
      switchToHttpFallback();
      return;
    }
    markEntryDisconnected(entry);
    entry.connectionStatus = 'connecting';
    reconnTimeout = setTimeout(() => {
      if (destroyed) return;
      reconnDelay = Math.min(reconnDelay * 1.5, 15000);
      connectEntryWS(entry);
    }, reconnDelay);
  };

  entry._destroy = () => {
    destroyed = true;
    endEntryReplay();
    clearWsTimers();
    try { ws.close(); } catch (_) {}
  };
}

function applyHttpSessionSnapshot(entry, snapshot, shouldClear = false) {
  if (!snapshot) return;
  const realId = snapshot.sessionId;
  if (realId && entry.sid !== realId) {
    const oldSid = entry.sid;
    const el = termRefs[oldSid];
    delete termRefs[oldSid];
    entry.sid = realId;
    if (el) termRefs[realId] = el;
    if (activeSessionId.value === oldSid) activeSessionId.value = realId;
    entry.attachSessionId = realId;
    localStorage.setItem('rcc_last_session', realId);
  }
  if (snapshot.name) entry.name = snapshot.name;
  if (typeof snapshot.alive === 'boolean') entry.alive = snapshot.alive;

  const el = termRefs[entry.sid];
  const shouldRefresh = Boolean(shouldClear || snapshot.reset || snapshot.output || entry._reconnectNoticePending);
  const suppressReplayInput = Boolean(shouldClear || snapshot.reset);
  if ((shouldClear || snapshot.reset) && el) el.clear();
  if (snapshot.output && el) el.write(snapshot.output, { suppressInput: suppressReplayInput });
  if (el && snapshot.output) nextTick(() => el.scrollToBottom());
  if (snapshot.alive === false) {
    entry.connectionStatus = 'closed';
    entry.connectedBadgeVisible = false;
    clearEntryConnectionBadge(entry);
    return;
  }
  markEntryConnected(entry, 'http', { refresh: shouldRefresh });
}

function handleEntryExit(entry, exitCode) {
  if (entry._exitHandled) return;
  entry._exitHandled = true;
  entry.alive = false;
  entry.connectionStatus = 'closed';
  entry.connectedBadgeVisible = false;
  clearEntryConnectionBadge(entry);
  setTimeout(() => {
    const sid = entry.sid;
    entry._destroy?.();
    clearEntryConnectionBadge(entry);
    const idx = termList.findIndex(e => e.sid === sid);
    if (idx !== -1) { delete termRefs[sid]; termList.splice(idx, 1); }
    if (activeSessionId.value === sid) {
      activeSessionId.value = '';
      view.value = 'home';
    }
  }, 1500);
}

function handleHttpExit(entry, exitCode) {
  handleEntryExit(entry, exitCode);
}

async function startEntryHttp(entry) {
  if (entry._destroy) { entry._destroy(); entry._destroy = null; }

  let destroyed = false;
  let retryDelay = 1000;
  let openRetryDelay = 1000;
  let pollController = null;
  entry.transport = 'http';
  entry.connectionStatus = 'connecting';
  entry.ws = null;
  entry._abortHttpPoll = () => {
    try { pollController?.abort(); } catch (_) {}
  };

  const poll = async (cursor) => {
    while (!destroyed) {
      pollController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      try {
        const result = await api.terminal.poll(entry.attachSessionId || entry.sid, cursor, HTTP_POLL_WAIT, {
          signal: pollController?.signal,
        });
        if (pollController?.signal.aborted) continue;
        retryDelay = 1000;
        if (destroyed) return;
        markEntryConnected(entry, 'http', {
          refresh: Boolean(result.reset || result.output || entry._reconnectNoticePending),
        });
        if (result.reset) termRefs[entry.sid]?.clear?.();
        if (result.output) termRefs[entry.sid]?.write?.(result.output, { suppressInput: !!result.reset });
        cursor = result.cursor ?? cursor;
        if (result.alive === false) {
          handleHttpExit(entry, result.exitCode);
          return;
        }
      } catch (_) {
        if (destroyed) return;
        if (pollController?.signal.aborted) continue;
        markEntryDisconnected(entry);
        entry.connectionStatus = 'connecting';
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 1.5, 15000);
      } finally {
        pollController = null;
      }
    }
  };

  entry._destroy = () => {
    destroyed = true;
    entry._abortHttpPoll = null;
    try { pollController?.abort(); } catch (_) {}
  };

  while (!destroyed) {
    try {
      await nextTick();
      const el = termRefs[entry.sid];
      if (el) el.fit();
      const cols = el?.getCols?.() ?? 80;
      const rows = el?.getRows?.() ?? 24;
      const snapshot = entry.attachSessionId
        ? await api.terminal.attach(entry.attachSessionId, { cols, rows })
        : await api.terminal.start({
            workingDir: entry.workingDir,
            agent: entry.agent || 'claude',
            resumeSessionId: entry.resumeSessionId || '',
            name: entry.name,
            cols,
            rows,
          });
      if (destroyed) return;
      applyHttpSessionSnapshot(entry, snapshot, !!entry.attachSessionId);
      poll(snapshot.cursor ?? 0);
      return;
    } catch (_) {
      if (destroyed) return;
      markEntryDisconnected(entry);
      entry.connectionStatus = 'connecting';
      await new Promise(resolve => setTimeout(resolve, openRetryDelay));
      openRetryDelay = Math.min(openRetryDelay * 1.5, 15000);
    }
  }
}

function interruptEntryHttpPoll(entry) {
  try { entry?._abortHttpPoll?.(); } catch (_) {}
}

// ── Navigation ────────────────────────────────────────────────────────────────
const view         = ref('home');
const prevView     = ref('home');
const logTarget    = ref(null);
const switcherOpen = ref(false);
const switcherRef  = ref(null);
const shellActive  = ref(false);
const activeShellId = ref('1');
const shellOpenIds = reactive(new Set());

function normalizedShellSlotCount() {
  return Math.min(6, Math.max(1, Number(settings.shellTerminalSlots) || 1));
}

function sortShellIds(ids) {
  return [...ids].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || String(a).localeCompare(String(b)));
}

const configuredShellIds = computed(() =>
  Array.from({ length: normalizedShellSlotCount() }, (_, i) => String(i + 1))
);
const visibleShellIds = computed(() => sortShellIds(new Set([...configuredShellIds.value, ...shellOpenIds])));
const openedShellIds = computed(() => sortShellIds(shellOpenIds));

function shellTitle(id) {
  return visibleShellIds.value.length > 1 ? `${t.value.topbar_shell_title} ${id}` : t.value.topbar_shell_title;
}

function openSession(s) {
  // Already have this session open
  const existing = findEntry(s.sessionId);
  if (existing) {
    activeSessionId.value = s.sessionId;
    view.value = 'terminal';
    switcherOpen.value = false;
    return;
  }

  const entry = shallowReactive({
    sid: s.sessionId,
    ws: null,
    alive: !!s.alive,
    wsStarted: false,
    name: s.name || s.sessionId,
    workingDir: s.workingDir || '',
    agent: s.agent || 'claude',
    resumeSessionId: '',
    attachSessionId: s.sessionId,
    transport: 'ws',
    connectionStatus: 'connecting',
    connectedBadgeVisible: false,
    _destroy: null,
  });
  termList.push(entry);
  activeSessionId.value = s.sessionId;
  view.value = 'terminal';
  switcherOpen.value = false;

  // Wait for Terminal component to mount before connecting WS
  nextTick(() => connectEntryWS(entry));
}

function startSession({ workingDir, name, resumeSessionId, agent = 'claude' }) {
  // Deduplicate pending sessions
  for (const entry of termList) {
    if (entry.attachSessionId === '' &&
        (entry.agent || 'claude') === agent &&
        entry.workingDir === workingDir &&
        (entry.resumeSessionId || '') === (resumeSessionId || '')) {
      activeSessionId.value = entry.sid;
      view.value = 'terminal';
      return;
    }
  }

  const placeholder = `pending-${Date.now()}`;
  const entry = shallowReactive({
    sid: placeholder,
    ws: null,
    alive: true,
    wsStarted: false,
    name: name || ((workingDir || '~').split('/').pop() || 'root'),
    workingDir: workingDir || '~',
    agent,
    resumeSessionId: resumeSessionId || '',
    attachSessionId: '',
    transport: 'ws',
    connectionStatus: 'connecting',
    connectedBadgeVisible: false,
    _destroy: null,
  });
  termList.push(entry);
  activeSessionId.value = placeholder;
  view.value = 'terminal';

  nextTick(() => connectEntryWS(entry));
}

function pickSession(s) { openSession(s); }

// ── Kill confirm (from terminal view: shows dialog, then goes home) ───────────
const killConfirm = reactive({ show: false, session: null });

function killSession(s) {
  // From terminal view: show confirm dialog
  if (view.value === 'terminal') {
    killConfirm.session = s;
    killConfirm.show = true;
    switcherOpen.value = false;
  } else {
    // From home list: kill directly (ConversationList has its own confirm)
    sendControl({ type: 'kill', sessionId: s.sessionId });
  }
}

function confirmKillAndExit() {
  const s = killConfirm.session;
  killConfirm.show = false;
  if (!s) return;
  sendControl({ type: 'kill', sessionId: s.sessionId });
  // Clean up local state and go home
  const idx = termList.findIndex(e => e.sid === s.sessionId);
  if (idx !== -1) {
    termList[idx]._destroy?.();
    clearEntryConnectionBadge(termList[idx]);
    delete termRefs[s.sessionId];
    termList.splice(idx, 1);
  }
  activeSessionId.value = '';
  view.value = 'home';
}

function deleteSession(s) {
  sendControl({ type: 'delete', sessionId: s.sessionId });
  const idx = termList.findIndex(e => e.sid === s.sessionId);
  if (idx !== -1) {
    termList[idx]._destroy?.();
    clearEntryConnectionBadge(termList[idx]);
    delete termRefs[s.sessionId];
    termList.splice(idx, 1);
  }
  if (activeSessionId.value === s.sessionId) {
    activeSessionId.value = '';
    view.value = 'home';
  }
}

function renameSession({ sessionId, name }) {
  sendControl({ type: 'rename', sessionId, name });
}

function openLog(s) {
  prevView.value = view.value;
  logTarget.value = s;
  view.value = 'log';
}

function openShell(id = '1') {
  const shellId = String(id || '1');
  shellOpenIds.add(shellId);
  activeShellId.value = shellId;
  shellActive.value = true;
  view.value = 'shell';
  switcherOpen.value = false;
}

function closeShell() {
  shellActive.value = false;
  view.value = 'home';
}

function doLogout() {
  logout();
  authed.value = false;
  view.value = 'home';
  shellActive.value = false;
  shellOpenIds.clear();
  activeShellId.value = '1';
  remoteSettingsReady = false;
  clearTimeout(settingsSaveTimer);
  clearTimeout(reconnTimer);
  clearTimeout(controlFallbackTimer);
  stopControlHttpPolling();
  for (const entry of termList) {
    entry._destroy?.();
    clearEntryConnectionBadge(entry);
  }
  termList.splice(0);
  settings.username = '';
  sessionsLoading.value = true;
}

// token 失效时（服务重启等）自动回到登录页
setUnauthorizedHandler(() => {
  authed.value = false;
  view.value = 'home';
  shellActive.value = false;
  shellOpenIds.clear();
  activeShellId.value = '1';
  remoteSettingsReady = false;
  clearTimeout(settingsSaveTimer);
  // 清理所有 WS 连接
  clearTimeout(reconnTimer);
  clearTimeout(controlFallbackTimer);
  stopControlHttpPolling();
  controlWS?.close();
  for (const entry of termList) {
    entry._destroy?.();
    clearEntryConnectionBadge(entry);
  }
  termList.splice(0);
  sessionList.value = [];
  sessionsLoading.value = true;
});

// ── Settings persistence ──────────────────────────────────────────────────────
let remoteSettingsReady = false;
let applyingRemoteSettings = false;
let settingsSaveTimer = null;

function currentSettingsUsername() {
  return loginUser.value || getSavedUsername() || settings.username || '';
}

async function syncSettingsFromServer() {
  if (!isLoggedIn()) return;
  remoteSettingsReady = false;
  const localSnapshot = {
    ...snapshotSettings(),
    username: currentSettingsUsername(),
  };
  const localUpdatedAt = getLocalSettingsUpdatedAt();

  try {
    const remote = await api.getSettings();
    if (remote?.persisted) {
      if (settingsTimestamp(localUpdatedAt) > settingsTimestamp(remote.updatedAt)) {
        const saved = await api.saveSettings(localSnapshot);
        markSettingsSynced(saved?.updatedAt);
      } else {
        applyingRemoteSettings = true;
        applySettings(remote.settings, { updatedAt: remote.updatedAt });
        settings.username = currentSettingsUsername();
      }
    } else {
      const saved = await api.saveSettings(localSnapshot);
      markSettingsSynced(saved?.updatedAt);
    }
    remoteSettingsReady = true;
  } catch (e) {
    if (e?.message !== 'Unauthorized') {
      remoteSettingsReady = false;
    }
  } finally {
    setTimeout(() => { applyingRemoteSettings = false; }, 0);
  }
}

function settingsTimestamp(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : 0;
}

function queueSettingsSave() {
  if (!authed.value || !remoteSettingsReady || applyingRemoteSettings) return;
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    api.saveSettings(snapshotSettings())
      .then(saved => markSettingsSynced(saved?.updatedAt))
      .catch(e => {
        if (e?.message !== 'Unauthorized') remoteSettingsReady = false;
      });
  }, 500);
}

watch(settings, queueSettingsSave, { deep: true });

// Terminal event handlers
function onTermInput(sid, data) {
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN) {
    entry.ws.send(data);
  } else if (entry?.transport === 'http') {
    const el = termRefs[sid];
    interruptEntryHttpPoll(entry);
    api.terminal.input(entry.attachSessionId || entry.sid, {
      data,
      cols: el?.getCols?.() ?? 80,
      rows: el?.getRows?.() ?? 24,
    }).catch(() => {});
  }
  // 同步更新当前行追踪（键盘输入已由 terminal 内部 onData 处理，
  // 但 SymbolBar 的输入绕过了 onData，所以这里统一补充）
  const el = termRefs[sid];
  if (el?.trackInput) el.trackInput(data);
}
function onTermResize(sid, { cols, rows }) {
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN) {
    entry.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
  } else if (entry?.transport === 'http') {
    api.terminal.resize(entry.attachSessionId || entry.sid, { cols, rows }).catch(() => {});
  }
}
function onTermPaste(sid, text) {
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN) {
    entry.ws.send(text);
  } else if (entry?.transport === 'http') {
    const el = termRefs[sid];
    interruptEntryHttpPoll(entry);
    api.terminal.input(entry.attachSessionId || entry.sid, {
      data: text,
      cols: el?.getCols?.() ?? 80,
      rows: el?.getRows?.() ?? 24,
    }).catch(() => {});
  }
}

// 文件浏览器 → 向当前活跃终端发送文本（如 cd 命令）
function sendToActiveTerminal(text) {
  const sid = activeSessionId.value;
  if (!sid) {
    // 没有活跃会话，切到 terminal/home 提示
    prevView.value = view.value;
    view.value = 'home';
    return;
  }
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN) {
    entry.ws.send(text);
    view.value = 'terminal';
  } else if (entry?.transport === 'http') {
    const el = termRefs[sid];
    interruptEntryHttpPoll(entry);
    api.terminal.input(entry.attachSessionId || entry.sid, {
      data: text,
      cols: el?.getCols?.() ?? 80,
      rows: el?.getRows?.() ?? 24,
    }).catch(() => {});
    view.value = 'terminal';
  }
}
function setTermRef(sid, el) {
  if (el) termRefs[sid] = el;
  else delete termRefs[sid];
}

// ── Restore ───────────────────────────────────────────────────────────────────
async function tryRestore() {
  try {
    const sessions = await api.getActiveSessions();
    applySessionList(sessions);
    const lastId = localStorage.getItem('rcc_last_session');
    const alive = sessions.find(s => s.sessionId === lastId && s.alive);
    if (alive) openSession(alive);
  } catch (e) {
    // 401 已由 apiFetch 触发 handleUnauthorized；其余网络错误也退出登录
    if (e?.message !== 'Unauthorized') {
      authed.value = false;
    }
  }
}

// ── Switcher click-outside ────────────────────────────────────────────────────
function onDocClick(e) {
  if (switcherOpen.value && switcherRef.value && !switcherRef.value.contains(e.target))
    switcherOpen.value = false;
}

// ── visualViewport ────────────────────────────────────────────────────────────
let vpCleanup = null;
function initVP() {
  if (!window.visualViewport) return;
  const handler = () => document.documentElement.style.setProperty('--vvh', window.visualViewport.height + 'px');
  window.visualViewport.addEventListener('resize', handler);
  window.visualViewport.addEventListener('scroll', handler);
  handler();
  vpCleanup = () => {
    window.visualViewport.removeEventListener('resize', handler);
    window.visualViewport.removeEventListener('scroll', handler);
  };
}

function init() {
  initControlWS();

  const r = route.value;
  if (r.name === 'session' && r.params.id) {
    api.getActiveSessions().then(sessions => {
      applySessionList(sessions);
      const s = sessions.find(x => x.sessionId === r.params.id && x.alive);
      if (s) openSession(s);
      else { navigate('home'); tryRestore(); }
    }).catch(e => {
      if (e?.message !== 'Unauthorized') authed.value = false;
    });
  } else if (r.name === 'new-session') {
    view.value = 'new-session';
  } else if (r.name === 'settings') {
    view.value = 'settings';
  } else {
    tryRestore();
  }
}

// 同步 view → hash（只关注 terminal 和 home）
watch([view, activeSessionId], ([v, sid]) => {
  if (v === 'terminal' && sid && !sid.startsWith('pending-')) {
    navigate('session', { id: sid });
  } else if (v === 'home') {
    navigate('home');
  }
});

onMounted(() => {
  document.addEventListener('click', onDocClick);
  initVP();
  if (authed.value) {
    syncSettingsFromServer().finally(init);
  }
});
onBeforeUnmount(() => {
  clearTimeout(reconnTimer);
  clearTimeout(settingsSaveTimer);
  clearTimeout(controlFallbackTimer);
  stopControlHttpPolling();
  controlWS?.close();
  for (const entry of termList) entry._destroy?.();
  document.removeEventListener('click', onDocClick);
  vpCleanup?.();
});

function toggleOverlay(name) {
  if (view.value === name) {
    view.value = prevView.value || 'home';
  } else {
    prevView.value = view.value;
    view.value = name;
  }
}

function shortCwd(p) {
  if (!p) return '';
  return p.replace(/^\/paddle\//, '~/').replace(/^\/root\//, '~/').replace(/^\/home\/[^/]+\//, '~/');
}
</script>

<style>
/* ── Color theme variables ───────────────────────────────────────────────── */
:root,
[data-theme="cyber"] {
  --neon:#7CFF6B; --neon2:#43D9C8;
  --bg:#070A08; --bg2:#0C110E; --bg3:#121A15;
  --panel:#0D1410; --panel2:#111C16; --panel3:#17251D;
  --text:#E8F2EA; --muted:#7F9184; --subtle:#4B5B50;
  --border:#7CFF6B1F; --border-strong:#7CFF6B4A; --glow:#7CFF6B24;
  --success:#7CFF6B; --warning:#F5D76E; --danger:#FF6B6B;
  --shadow:0 18px 58px #00000074; --hairline:color-mix(in srgb, var(--border) 72%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#080D0A; --overlay:#00000078;
}
[data-theme="mocha"] {
  --neon:#C4B5FD; --neon2:#67E8F9;
  --bg:#101116; --bg2:#151721; --bg3:#1C2030;
  --panel:#171A24; --panel2:#1F2433; --panel3:#2A3042;
  --text:#ECEEF5; --muted:#8A8F9D; --subtle:#565C6C;
  --border:#C4B5FD20; --border-strong:#C4B5FD4A; --glow:#C4B5FD24;
  --success:#86EFAC; --warning:#FACC15; --danger:#F87171;
  --shadow:0 18px 56px #0000006B; --hairline:color-mix(in srgb, var(--border) 72%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#11131B; --overlay:#05060A78;
}
[data-theme="gruvbox"] {
  --neon:#FFB86B; --neon2:#5EEAD4;
  --bg:#130F0B; --bg2:#1A1410; --bg3:#241B14;
  --panel:#1D1711; --panel2:#2A1F17; --panel3:#38291E;
  --text:#F4E7D2; --muted:#A49280; --subtle:#6B5B4B;
  --border:#FFB86B22; --border-strong:#FFB86B4F; --glow:#FFB86B24;
  --success:#A3E635; --warning:#FBBF24; --danger:#F97373;
  --shadow:0 18px 56px #00000072; --hairline:color-mix(in srgb, var(--border) 74%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#14100C; --overlay:#05030278;
}
[data-theme="nord"] {
  --neon:#7DD3FC; --neon2:#C4B5FD;
  --bg:#0F1720; --bg2:#14202C; --bg3:#1B2A39;
  --panel:#162332; --panel2:#1F3042; --panel3:#2A4055;
  --text:#E6EEF6; --muted:#8BA0B2; --subtle:#536270;
  --border:#7DD3FC24; --border-strong:#7DD3FC4F; --glow:#7DD3FC22;
  --success:#A3E635; --warning:#FCD34D; --danger:#FB7185;
  --shadow:0 18px 56px #00000068; --hairline:color-mix(in srgb, var(--border) 72%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#101A24; --overlay:#04080D78;
}
[data-theme="dracula"] {
  --neon:#FF6BAA; --neon2:#8AB4FF;
  --bg:#130D16; --bg2:#1A1220; --bg3:#261A2E;
  --panel:#1E1425; --panel2:#2A1B34; --panel3:#382544;
  --text:#FFF4FA; --muted:#A891B0; --subtle:#65536B;
  --border:#FF6BAA23; --border-strong:#FF6BAA4F; --glow:#FF6BAA22;
  --success:#6EE7B7; --warning:#F9D86A; --danger:#FF6B8A;
  --shadow:0 18px 56px #00000070; --hairline:color-mix(in srgb, var(--border) 72%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#150F19; --overlay:#06030978;
}
[data-theme="solarized"] {
  --neon:#2DD4BF; --neon2:#38BDF8;
  --bg:#071818; --bg2:#0C2323; --bg3:#123030;
  --panel:#0E2827; --panel2:#153635; --panel3:#1D4644;
  --text:#E0F2EF; --muted:#83A6A1; --subtle:#4D6663;
  --border:#2DD4BF23; --border-strong:#2DD4BF4F; --glow:#2DD4BF22;
  --success:#34D399; --warning:#FBBF24; --danger:#F87171;
  --shadow:0 18px 56px #0000006D; --hairline:color-mix(in srgb, var(--border) 72%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#081D1C; --overlay:#03101078;
}
[data-theme="carbon"] {
  --neon:#DDE3EA; --neon2:#A3E635;
  --bg:#080A0D; --bg2:#0E1116; --bg3:#161B22;
  --panel:#10141A; --panel2:#171D25; --panel3:#232B36;
  --text:#EFF4F8; --muted:#8B96A3; --subtle:#5B6470;
  --border:#DDE3EA22; --border-strong:#DDE3EA55; --glow:#DDE3EA18;
  --success:#A3E635; --warning:#EAB308; --danger:#FF5C6C;
  --shadow:0 18px 56px #00000074; --hairline:color-mix(in srgb, var(--border) 74%, #ffffff0A);
  --radius:8px; --radius-sm:5px; --input-bg:#0A0D11; --overlay:#03040680;
}
[data-theme="ember"] {
  --neon:#FF7A3D; --neon2:#FFD166;
  --bg:#140A06; --bg2:#1D0F09; --bg3:#2A160D;
  --panel:#201109; --panel2:#2D180D; --panel3:#3D2112;
  --text:#F8E8D8; --muted:#B58A70; --subtle:#75584B;
  --border:#FF7A3D24; --border-strong:#FF7A3D55; --glow:#FF7A3D24;
  --success:#84CC16; --warning:#FFD166; --danger:#F43F5E;
  --shadow:0 18px 58px #00000076; --hairline:color-mix(in srgb, var(--border) 76%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#170B06; --overlay:#07030280;
}
[data-theme="aurora"] {
  --neon:#22D3EE; --neon2:#A78BFA;
  --bg:#07111C; --bg2:#0B1724; --bg3:#102235;
  --panel:#0D1D2D; --panel2:#132A3F; --panel3:#1C3A53;
  --text:#E6F6FF; --muted:#8AA6BA; --subtle:#536579;
  --border:#22D3EE24; --border-strong:#22D3EE52; --glow:#22D3EE22;
  --success:#6EE7B7; --warning:#FDE047; --danger:#FB7185;
  --shadow:0 18px 56px #00000070; --hairline:color-mix(in srgb, var(--border) 74%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#081421; --overlay:#02070C80;
}
[data-theme="orchid"] {
  --neon:#D946EF; --neon2:#22D3EE;
  --bg:#120A1A; --bg2:#1A0F25; --bg3:#261536;
  --panel:#1E112B; --panel2:#2B183D; --panel3:#3A2350;
  --text:#F7EDFF; --muted:#A78BB5; --subtle:#665070;
  --border:#D946EF24; --border-strong:#D946EF52; --glow:#D946EF22;
  --success:#34D399; --warning:#FACC15; --danger:#F43F5E;
  --shadow:0 18px 56px #00000072; --hairline:color-mix(in srgb, var(--border) 74%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#140B1D; --overlay:#05020880;
}
[data-theme="matrix"] {
  --neon:#00FF87; --neon2:#00B8A9;
  --bg:#030805; --bg2:#07120B; --bg3:#0D1C12;
  --panel:#07120A; --panel2:#0D1D12; --panel3:#14301D;
  --text:#E5FFF1; --muted:#6EA986; --subtle:#3F6A52;
  --border:#00FF8722; --border-strong:#00FF8754; --glow:#00FF8726;
  --success:#00FF87; --warning:#D9F99D; --danger:#FF5F72;
  --shadow:0 18px 58px #00000078; --hairline:color-mix(in srgb, var(--border) 78%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#040B07; --overlay:#01040382;
}
[data-theme="neon"] {
  --neon:#00E5FF; --neon2:#FF2BD6;
  --bg:#050712; --bg2:#080B1C; --bg3:#101530;
  --panel:#0A0F22; --panel2:#111834; --panel3:#1B2450;
  --text:#EEF8FF; --muted:#8AA0C5; --subtle:#566382;
  --border:#00E5FF24; --border-strong:#00E5FF54; --glow:#00E5FF24;
  --success:#7CFF6B; --warning:#FDE047; --danger:#FF4D8D;
  --shadow:0 18px 60px #00000076; --hairline:color-mix(in srgb, var(--border) 76%, #ffffff08);
  --radius:8px; --radius-sm:5px; --input-bg:#060917; --overlay:#02030A82;
}

/* ── 浅色主题 ────────────────────────────────────────────────────────────── */
[data-theme="latte"] {
  --neon:#6D5EF6; --neon2:#0E7490;
  --bg:#F6F4EF; --bg2:#EEEAE1; --bg3:#E2DDD2;
  --panel:#FFFFFF; --panel2:#F3F0E8; --panel3:#E8E2D7;
  --text:#262A32; --muted:#747987; --subtle:#A5A09A;
  --border:#29313D1A; --border-strong:#6D5EF653; --glow:#6D5EF61A;
  --success:#15803D; --warning:#B7791F; --danger:#E11D48;
  --shadow:0 16px 42px #2E241217; --hairline:#262A3217;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#1F29335F;
}
[data-theme="paper"] {
  --neon:#0E7490; --neon2:#6B7280;
  --bg:#FBFBF8; --bg2:#F0EFEA; --bg3:#E4E2DA;
  --panel:#FFFFFF; --panel2:#F7F6F1; --panel3:#EBE8DF;
  --text:#1F2933; --muted:#667085; --subtle:#9BA1AA;
  --border:#1F29331A; --border-strong:#0E74904A; --glow:#0E749014;
  --success:#166534; --warning:#A16207; --danger:#B91C1C;
  --shadow:0 16px 42px #1F293314; --hairline:#1F293317;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#1118275F;
}
[data-theme="day"] {
  --neon:#2563EB; --neon2:#0E7490;
  --bg:#FFFFFF; --bg2:#F4F6F8; --bg3:#E8EDF3;
  --panel:#FFFFFF; --panel2:#F8FAFC; --panel3:#EEF2F7;
  --text:#1B2430; --muted:#64748B; --subtle:#94A3B8;
  --border:#1B24301B; --border-strong:#2563EB4A; --glow:#2563EB16;
  --success:#116329; --warning:#8A5A00; --danger:#CF222E;
  --shadow:0 16px 42px #1B243012; --hairline:#1B243018;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#1118275F;
}
[data-theme="mist"] {
  --neon:#0891B2; --neon2:#2563EB;
  --bg:#F3F8FA; --bg2:#E7F0F4; --bg3:#D7E5EA;
  --panel:#FFFFFF; --panel2:#F0F7FA; --panel3:#E1EEF3;
  --text:#1F2A32; --muted:#637481; --subtle:#96A8B2;
  --border:#1F2A321A; --border-strong:#0891B24A; --glow:#0891B214;
  --success:#166534; --warning:#A16207; --danger:#BE123C;
  --shadow:0 16px 42px #0F344014; --hairline:#1F2A3217;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#0F172A5F;
}
[data-theme="sage"] {
  --neon:#2F855A; --neon2:#0F766E;
  --bg:#F3F7F0; --bg2:#E8EFE4; --bg3:#D9E6D2;
  --panel:#FFFFFF; --panel2:#F0F6EC; --panel3:#E1ECD9;
  --text:#23302A; --muted:#68786D; --subtle:#98A699;
  --border:#23302A1A; --border-strong:#2F855A4A; --glow:#2F855A14;
  --success:#15803D; --warning:#8A5A00; --danger:#B91C1C;
  --shadow:0 16px 42px #1F3A2414; --hairline:#23302A17;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#1020165F;
}
[data-theme="pearl"] {
  --neon:#C026D3; --neon2:#2563EB;
  --bg:#FCF7FB; --bg2:#F4ECF5; --bg3:#E9DCE8;
  --panel:#FFFFFF; --panel2:#F9F0F8; --panel3:#EFDFEF;
  --text:#2B2430; --muted:#776A7D; --subtle:#AA9EAD;
  --border:#2B24301A; --border-strong:#C026D34A; --glow:#C026D314;
  --success:#15803D; --warning:#A16207; --danger:#BE123C;
  --shadow:0 16px 42px #4A154B12; --hairline:#2B243017;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#1F10225F;
}
[data-theme="contrast"] {
  --neon:#111827; --neon2:#1D4ED8;
  --bg:#FAFAFA; --bg2:#EFEFEF; --bg3:#E2E2E2;
  --panel:#FFFFFF; --panel2:#F4F4F5; --panel3:#E4E4E7;
  --text:#111827; --muted:#4B5563; --subtle:#71717A;
  --border:#1118272B; --border-strong:#11182780; --glow:#11182712;
  --success:#166534; --warning:#854D0E; --danger:#B91C1C;
  --shadow:0 16px 36px #11182712; --hairline:#11182722;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#1118275F;
}
[data-theme="ivory"] {
  --neon:#9A3412; --neon2:#0F766E;
  --bg:#FFFDF7; --bg2:#F7F0E2; --bg3:#ECE0C8;
  --panel:#FFFFFF; --panel2:#FBF5E8; --panel3:#F0E3CB;
  --text:#2A241C; --muted:#786C5E; --subtle:#AA9B86;
  --border:#2A241C1A; --border-strong:#9A34124A; --glow:#9A341214;
  --success:#166534; --warning:#A16207; --danger:#B91C1C;
  --shadow:0 16px 42px #4B341214; --hairline:#2A241C17;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#2A241C5F;
}
[data-theme="skyline"] {
  --neon:#0369A1; --neon2:#7C3AED;
  --bg:#F7FBFF; --bg2:#EAF3FB; --bg3:#DCEAF6;
  --panel:#FFFFFF; --panel2:#F0F7FD; --panel3:#DFEEF8;
  --text:#17212B; --muted:#617586; --subtle:#95A7B5;
  --border:#17212B1A; --border-strong:#0369A14A; --glow:#0369A114;
  --success:#166534; --warning:#8A5A00; --danger:#B91C1C;
  --shadow:0 16px 42px #0B3A5A12; --hairline:#17212B17;
  --radius:8px; --radius-sm:5px; --input-bg:#FFFFFF; --overlay:#0F172A5F;
}

/* ── 浅色主题全局适配 ────────────────────────────────────────────────────── */
/* 浅色模式下，某些深色 hardcode 颜色需要反转 */
html[data-light] body,
html[data-light] #app { background: var(--bg); color: var(--text); }

/* 浅色模式下状态点保持高对比 */
html[data-light] .switcher-dot.live,
html[data-light] .cl-status.live { background: var(--success); box-shadow: 0 0 4px color-mix(in srgb, var(--success) 35%, transparent); }
html[data-light] .switcher-dot.dead,
html[data-light] .cl-status.dead { background: var(--muted); box-shadow: none; }

/* ═══════════════════════════════════════════════════════════════════════════
   UI STYLE THEMES
   每套风格覆盖相同的 CSS 变量集，让所有组件自动适配
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── default (Command): 控制台工作台，细边线，清晰层级 ───────────────────── */

/* ── minimal (Focus): 高密度、低干扰、直角 ─────────────────────────────── */
[data-ui-style="minimal"] {
  --glow: transparent;
  --shadow: none;
  --border: color-mix(in srgb, var(--muted) 36%, transparent);
  --border-strong: color-mix(in srgb, var(--muted) 58%, transparent);
  --hairline: color-mix(in srgb, var(--muted) 32%, transparent);
  --radius: 0px;
  --radius-sm: 0px;
}
/* 无圆角 */
[data-ui-style="minimal"] .topbar,
[data-ui-style="minimal"] .login-box,
[data-ui-style="minimal"] .switcher-dropdown,
[data-ui-style="minimal"] .cl-item,
[data-ui-style="minimal"] .nc-card,
[data-ui-style="minimal"] .sp-section,
[data-ui-style="minimal"] .sp-style-card,
[data-ui-style="minimal"] .sp-color-card,
[data-ui-style="minimal"] .fb-entry,
[data-ui-style="minimal"] .fb-tool-btn,
[data-ui-style="minimal"] .fb-preview-copy,
[data-ui-style="minimal"] .sh-btn {
  border-radius: 0 !important;
}
/* 无阴影、无发光 */
[data-ui-style="minimal"] * {
  box-shadow: none !important;
  text-shadow: none !important;
}
/* 顶栏：细底部边框+纯色背景 */
[data-ui-style="minimal"] .topbar {
  border-bottom: 1px solid var(--hairline) !important;
}
/* 登录框：纯色边框 */
[data-ui-style="minimal"] .login-box {
  border: 1px solid var(--muted) !important;
}
/* 按钮：方角+更细 */
[data-ui-style="minimal"] .start-btn,
[data-ui-style="minimal"] .topbar-icon-btn,
[data-ui-style="minimal"] .cl-new-btn,
[data-ui-style="minimal"] .nc-start,
[data-ui-style="minimal"] .nc-cancel,
[data-ui-style="minimal"] .sp-step-btn {
  border-radius: 0 !important;
}
/* 输入框：方角 */
[data-ui-style="minimal"] .neon-input,
[data-ui-style="minimal"] .nc-input,
[data-ui-style="minimal"] .sp-select,
[data-ui-style="minimal"] .sp-input,
[data-ui-style="minimal"] .fb-path-input,
[data-ui-style="minimal"] .fb-mkdir-input {
  border-radius: 0 !important;
}
/* session 状态点：正方形 */
[data-ui-style="minimal"] .switcher-dot,
[data-ui-style="minimal"] .cl-status {
  border-radius: 2px !important;
}
/* 卡片列表：用左边框区分当前 */
[data-ui-style="minimal"] .cl-item:hover {
  background: color-mix(in srgb, var(--neon) 4%, var(--panel)) !important;
  border-color: var(--border-strong) !important;
}

/* ── glass (Layered): 半透明面板与轻量阴影 ─────────────────────────────── */
[data-ui-style="glass"] {
  --shadow: 0 18px 68px #0000005E;
  --radius: 8px;
  --radius-sm: 6px;
}
/* 顶栏毛玻璃 */
[data-ui-style="glass"] .topbar {
  background: color-mix(in srgb, var(--panel) 82%, transparent) !important;
  backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, #ffffff14) !important;
}
/* 登录框：毛玻璃卡片 */
[data-ui-style="glass"] .login-box {
  background: color-mix(in srgb, var(--panel) 78%, transparent) !important;
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  border: 1px solid color-mix(in srgb, var(--border) 68%, #ffffff16) !important;
}
/* dropdown 毛玻璃 */
[data-ui-style="glass"] .switcher-dropdown {
  background: color-mix(in srgb, var(--panel) 82%, transparent) !important;
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
  border: 1px solid color-mix(in srgb, var(--border) 68%, #ffffff16) !important;
}
/* 卡片：毛玻璃 */
[data-ui-style="glass"] .cl-item,
[data-ui-style="glass"] .nc-card,
[data-ui-style="glass"] .sp-style-card,
[data-ui-style="glass"] .sp-color-card,
[data-ui-style="glass"] .fb-list-panel,
[data-ui-style="glass"] .fb-preview-panel {
  background: color-mix(in srgb, var(--panel) 78%, transparent) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-color: color-mix(in srgb, var(--border) 70%, #ffffff12) !important;
}
/* 按钮圆角更大 */
[data-ui-style="glass"] .start-btn,
[data-ui-style="glass"] .cl-new-btn,
[data-ui-style="glass"] .nc-start,
[data-ui-style="glass"] .topbar-icon-btn {
  border-radius: var(--radius) !important;
}
/* 输入框圆角 */
[data-ui-style="glass"] .neon-input,
[data-ui-style="glass"] .nc-input {
  background: color-mix(in srgb, var(--input-bg) 74%, transparent) !important;
  backdrop-filter: blur(8px);
  border-color: color-mix(in srgb, var(--border) 78%, #ffffff16) !important;
}
[data-ui-style="glass"] .neon-input:focus,
[data-ui-style="glass"] .nc-input:focus {
  border-color: color-mix(in srgb, var(--neon) 66%, transparent) !important;
  background: color-mix(in srgb, var(--input-bg) 66%, transparent) !important;
}

/* ── dense (Compact): 高信息密度，保留清晰触控目标 ─────────────────────── */
[data-ui-style="dense"] {
  --shadow: 0 10px 34px #00000046;
  --radius: 6px;
  --radius-sm: 4px;
  --topbar-h: 40px;
}
[data-ui-style="dense"] .topbar {
  padding-inline: 10px !important;
}
[data-ui-style="dense"] .topbar-icon-btn {
  width: 29px !important;
  height: 29px !important;
}
[data-ui-style="dense"] .cl-item,
[data-ui-style="dense"] .nc-field,
[data-ui-style="dense"] .sp-section,
[data-ui-style="dense"] .fb-entry {
  border-radius: var(--radius-sm) !important;
}
[data-ui-style="dense"] .cl-list,
[data-ui-style="dense"] .sp-body,
[data-ui-style="dense"] .fb-list {
  gap: 6px !important;
}
[data-ui-style="dense"] .nc-card {
  gap: 12px !important;
  padding-top: 14px !important;
}
[data-ui-style="dense"] .symbol-bar {
  padding: 4px 6px !important;
}

/* ── studio: 柔和分区、低噪声，弱化网格感 ─────────────────────────────── */
[data-ui-style="studio"] {
  --shadow: 0 16px 46px color-mix(in srgb, #000000 30%, transparent);
  --border: color-mix(in srgb, var(--muted) 24%, transparent);
  --hairline: color-mix(in srgb, var(--muted) 18%, transparent);
  --radius: 8px;
  --radius-sm: 7px;
}
[data-ui-style="studio"] .app-root {
  background:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--neon) 6%, transparent), transparent 28%),
    radial-gradient(circle at 82% 12%, color-mix(in srgb, var(--neon2) 5%, transparent), transparent 30%),
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 54%, transparent), transparent 300px),
    var(--bg) !important;
  background-size: auto !important;
}
[data-ui-style="studio"] .topbar,
[data-ui-style="studio"] .cl-item,
[data-ui-style="studio"] .nc-field,
[data-ui-style="studio"] .sp-color-card,
[data-ui-style="studio"] .sp-style-card,
[data-ui-style="studio"] .fb-list-panel,
[data-ui-style="studio"] .fb-preview-panel {
  border-color: color-mix(in srgb, var(--muted) 22%, transparent) !important;
}
[data-ui-style="studio"] .topbar-icon-btn.active,
[data-ui-style="studio"] .cl-item:hover,
[data-ui-style="studio"] .fb-entry.active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--neon) 12%, transparent) !important;
}

/* ── contrast (Signal): 高对比边界和更明确的焦点态 ───────────────────── */
[data-ui-style="contrast"] {
  --glow: transparent;
  --border: color-mix(in srgb, var(--text) 28%, transparent);
  --border-strong: color-mix(in srgb, var(--text) 70%, transparent);
  --hairline: color-mix(in srgb, var(--text) 22%, transparent);
  --shadow: 0 10px 28px color-mix(in srgb, #000000 24%, transparent);
  --radius: 5px;
  --radius-sm: 3px;
}
[data-ui-style="contrast"] .topbar,
[data-ui-style="contrast"] .topbar-right,
[data-ui-style="contrast"] .cl-item,
[data-ui-style="contrast"] .nc-field,
[data-ui-style="contrast"] .sp-style-card,
[data-ui-style="contrast"] .sp-color-card,
[data-ui-style="contrast"] .fb-list-panel,
[data-ui-style="contrast"] .fb-preview-panel,
[data-ui-style="contrast"] .symbol-bar {
  border-color: var(--border-strong) !important;
}
[data-ui-style="contrast"] .topbar-icon-btn:hover,
[data-ui-style="contrast"] .topbar-icon-btn.active,
[data-ui-style="contrast"] .cl-new-btn,
[data-ui-style="contrast"] .nc-start,
[data-ui-style="contrast"] .sp-primary-btn {
  background: var(--neon) !important;
  border-color: var(--neon) !important;
  color: var(--bg) !important;
}
[data-ui-style="contrast"] button:focus-visible,
[data-ui-style="contrast"] input:focus-visible,
[data-ui-style="contrast"] select:focus-visible {
  outline: 3px solid var(--neon2) !important;
  outline-offset: 2px !important;
}

/* ── cyberpunk: 原始霓虹赛博感，强化网格、扫描线和发光边界 ───────────── */
[data-ui-style="cyberpunk"] {
  --shadow: 0 18px 70px color-mix(in srgb, var(--neon) 12%, #000000 72%);
  --border: color-mix(in srgb, var(--neon) 22%, transparent);
  --border-strong: color-mix(in srgb, var(--neon) 58%, transparent);
  --hairline: color-mix(in srgb, var(--neon) 18%, transparent);
  --radius: 7px;
  --radius-sm: 4px;
}
[data-ui-style="cyberpunk"] .app-root {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 70%, transparent), transparent 280px),
    repeating-linear-gradient(0deg, transparent 0 18px, color-mix(in srgb, var(--neon) 4%, transparent) 19px),
    linear-gradient(90deg, color-mix(in srgb, var(--neon) 6%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--neon2) 4%, transparent) 1px, transparent 1px),
    var(--bg) !important;
  background-size: auto, auto, 24px 24px, 24px 24px, auto !important;
}
[data-ui-style="cyberpunk"] .topbar,
[data-ui-style="cyberpunk"] .cl-item,
[data-ui-style="cyberpunk"] .nc-field,
[data-ui-style="cyberpunk"] .sp-style-card,
[data-ui-style="cyberpunk"] .sp-color-card,
[data-ui-style="cyberpunk"] .fb-list-panel,
[data-ui-style="cyberpunk"] .fb-preview-panel,
[data-ui-style="cyberpunk"] .symbol-bar {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--neon) 10%, transparent), 0 0 18px var(--glow) !important;
}
[data-ui-style="cyberpunk"] .topbar-icon-btn.active,
[data-ui-style="cyberpunk"] .cl-new-btn,
[data-ui-style="cyberpunk"] .nc-start {
  text-shadow: 0 0 10px color-mix(in srgb, var(--neon) 50%, transparent);
}

/* ── blueprint: 工程蓝图式细线和冷调底纹 ─────────────────────────────── */
[data-ui-style="blueprint"] {
  --shadow: 0 14px 42px color-mix(in srgb, #000000 38%, transparent);
  --border: color-mix(in srgb, var(--neon2) 26%, transparent);
  --border-strong: color-mix(in srgb, var(--neon2) 56%, transparent);
  --hairline: color-mix(in srgb, var(--neon2) 18%, transparent);
  --radius: 5px;
  --radius-sm: 3px;
}
[data-ui-style="blueprint"] .app-root {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 42%, transparent), transparent 260px),
    linear-gradient(90deg, color-mix(in srgb, var(--neon2) 6%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--neon2) 6%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--neon2) 14%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--neon2) 14%, transparent) 1px, transparent 1px),
    var(--bg) !important;
  background-size: auto, 20px 20px, 20px 20px, 100px 100px, 100px 100px, auto !important;
}
[data-ui-style="blueprint"] .topbar,
[data-ui-style="blueprint"] .cl-item,
[data-ui-style="blueprint"] .nc-field,
[data-ui-style="blueprint"] .sp-color-card,
[data-ui-style="blueprint"] .sp-style-card,
[data-ui-style="blueprint"] .fb-entry {
  border-style: solid !important;
}

/* ── ink: 低饱和纸墨风，降低发光和背景噪声 ───────────────────────────── */
[data-ui-style="ink"] {
  --glow: transparent;
  --shadow: 0 8px 28px color-mix(in srgb, #000000 14%, transparent);
  --border: color-mix(in srgb, var(--text) 16%, transparent);
  --border-strong: color-mix(in srgb, var(--text) 38%, transparent);
  --hairline: color-mix(in srgb, var(--text) 12%, transparent);
  --radius: 8px;
  --radius-sm: 6px;
}
[data-ui-style="ink"] .app-root {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 34%, transparent), transparent 220px),
    var(--bg) !important;
  background-size: auto !important;
}
[data-ui-style="ink"] .topbar,
[data-ui-style="ink"] .cl-item,
[data-ui-style="ink"] .nc-field,
[data-ui-style="ink"] .sp-color-card,
[data-ui-style="ink"] .sp-style-card,
[data-ui-style="ink"] .fb-list-panel,
[data-ui-style="ink"] .fb-preview-panel {
  background: color-mix(in srgb, var(--panel) 94%, transparent) !important;
}
[data-ui-style="ink"] * {
  text-shadow: none !important;
}

@supports not (background: color-mix(in srgb, #000000 50%, #ffffff)) {
  :root {
    --hairline: rgba(255, 255, 255, .10);
  }
  html[data-light] {
    --hairline: rgba(17, 24, 39, .10);
  }
  [data-ui-style="minimal"],
  [data-ui-style="studio"],
  [data-ui-style="contrast"],
  [data-ui-style="cyberpunk"],
  [data-ui-style="blueprint"],
  [data-ui-style="ink"] {
    --border: rgba(255, 255, 255, .16);
    --border-strong: rgba(255, 255, 255, .36);
    --hairline: rgba(255, 255, 255, .10);
  }
  html[data-light][data-ui-style="minimal"],
  html[data-light][data-ui-style="studio"],
  html[data-light][data-ui-style="contrast"],
  html[data-light][data-ui-style="cyberpunk"],
  html[data-light][data-ui-style="blueprint"],
  html[data-light][data-ui-style="ink"] {
    --border: rgba(17, 24, 39, .16);
    --border-strong: rgba(17, 24, 39, .36);
    --hairline: rgba(17, 24, 39, .10);
  }
  [data-ui-style="studio"] {
    --shadow: 0 16px 46px rgba(0, 0, 0, .30);
  }
  [data-ui-style="contrast"] {
    --shadow: 0 10px 28px rgba(0, 0, 0, .24);
  }
  [data-ui-style="cyberpunk"] {
    --shadow: 0 18px 70px rgba(0, 0, 0, .72);
  }
  [data-ui-style="blueprint"] {
    --shadow: 0 14px 42px rgba(0, 0, 0, .38);
  }
  [data-ui-style="ink"] {
    --shadow: 0 8px 28px rgba(0, 0, 0, .14);
  }
  [data-ui-style="minimal"] .cl-item:hover,
  .ctx-item:hover {
    background: var(--panel2) !important;
  }
  .ctx-menu,
  .sym-popup,
  .cl-confirm-box,
  .kc-box,
  .help-sidebar,
  .help-md pre,
  .help-md img,
  .fb-toolbar,
  .fb-preview-header,
  .fb-line-nums,
  .fb-toast,
  .fb-drag-overlay,
  .dp-root,
  .dp-toolbar {
    background: var(--panel) !important;
  }
  .fb-preview-panel,
  .fb-preview-img {
    background: var(--bg) !important;
  }
  .sym-popup-overlay,
  .cl-confirm-overlay,
  .kc-overlay,
  .help-scrim,
  .fb-fs-overlay {
    background: var(--overlay) !important;
  }
  .fb-fs-box {
    background: var(--bg) !important;
  }
  ::selection {
    background: var(--border-strong);
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--border-strong);
    outline-offset: 2px;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); }
body {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color-scheme: dark;
}
html[data-light] body { color-scheme: light; }
button, input, select, textarea { font: inherit; }
button {
  -webkit-tap-highlight-color: transparent;
}
::selection {
  background: color-mix(in srgb, var(--neon) 36%, transparent);
  color: var(--text);
}
button:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--neon) 70%, transparent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .001ms !important;
  }
}
</style>

<style scoped>
.app-root {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--panel) 62%, transparent), transparent 260px),
    linear-gradient(90deg, color-mix(in srgb, var(--neon) 4%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--neon2) 3%, transparent) 1px, transparent 1px),
    var(--bg);
  background-size: auto, 28px 28px, 28px 28px, auto;
}

/* ── Login ─────────────────────────────────────────────────────── */
.login-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: color-mix(in srgb, var(--bg) 86%, transparent);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(12px);
}
.login-box {
  background: var(--panel); border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  padding: 40px 32px; width: min(380px, 92vw);
  display: flex; flex-direction: column; gap: 14px;
  box-shadow: var(--shadow), 0 0 44px var(--glow);
}
.login-logo {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 30px; font-weight: 800;
  text-align: center; color: var(--text);
}
.logo-cc      { color: var(--warning); text-shadow: 0 0 20px color-mix(in srgb, var(--warning) 45%, transparent); }
.logo-bracket { color: var(--muted); font-weight: 300; }
.logo-rcc     { color: var(--neon); text-shadow: 0 0 20px var(--neon); }
.logo-accent  { color: var(--neon); text-shadow: 0 0 20px var(--neon); }
.logo-dim     { color: var(--muted); font-weight: 400; margin-right: 2px; }
.login-sub {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: var(--muted);
  text-align: center; letter-spacing: 3px; text-transform: uppercase;
  margin-top: -8px; margin-bottom: 2px;
}
.neon-input {
  width: 100%; background: var(--input-bg); color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-family: 'JetBrains Mono', monospace; font-size: 13px;
  padding: 11px 14px; outline: none;
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.neon-input:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 12%, transparent);
}
.login-error { color: var(--danger); font-size: 12px; text-align: center; }
.start-btn {
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  color: var(--neon); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px;
  font-weight: 800; letter-spacing: 2px; padding: 13px; cursor: pointer;
  transition: background .2s, box-shadow .2s, border-color .2s;
}
.start-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--neon) 16%, transparent);
  box-shadow: 0 0 24px var(--glow);
}
.start-btn:disabled { opacity: .45; cursor: not-allowed; }

/* ── Global topbar ─────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px 0 14px; height: var(--topbar-h, 46px); flex-shrink: 0;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border-bottom: 1px solid var(--hairline);
  gap: 10px; position: relative; z-index: 50;
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 5%, transparent), 0 10px 26px color-mix(in srgb, #000000 18%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.topbar-left  { display: flex; align-items: center; min-width: 0; flex: 1; }
.topbar-right {
  display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: calc(var(--radius-sm) + 3px);
  background: color-mix(in srgb, var(--panel2) 58%, transparent);
}

.topbar-brand {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 15px; font-weight: 800;
  color: var(--text); background: none; border: none; cursor: pointer;
  padding: 2px 0; transition: color .15s, text-shadow .15s;
  letter-spacing: .2px;
}
.topbar-brand:hover { color: var(--neon); text-shadow: 0 0 18px var(--glow); }

.topbar-badge {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--neon); opacity: .7;
  display: flex; align-items: center; gap: 3px;
  --app-icon-size: 13px;
}

.topbar-icon-btn {
  background: transparent; border: 1px solid transparent; cursor: pointer;
  color: var(--muted); font-size: 16px;
  width: 31px; height: 31px; border-radius: var(--radius-sm);
  display: flex; align-items: center; justify-content: center;
  transition: color .15s, background .15s, border-color .15s, box-shadow .15s, transform .15s;
  flex-shrink: 0; line-height: 1; overflow: visible;
  --app-icon-size: 16px;
}
.topbar-icon-btn:hover  {
  color: var(--text);
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  border-color: var(--border);
  transform: translateY(-1px);
}
.topbar-icon-btn.active {
  color: var(--neon);
  background: color-mix(in srgb, var(--neon) 13%, transparent);
  border-color: var(--border-strong);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--neon) 16%, transparent), 0 0 16px var(--glow);
}
.shell-slot-btn {
  position: relative;
}
.topbar-icon-index {
  position: absolute;
  right: 3px;
  bottom: 2px;
  min-width: 10px;
  height: 10px;
  padding: 0 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: var(--panel3);
  border: 1px solid var(--border);
  color: var(--neon2);
  font-family: 'JetBrains Mono', monospace;
  font-size: 8px;
  font-weight: 800;
  line-height: 1;
}
.topbar-icon-btn.active .topbar-icon-index {
  color: var(--bg);
  background: var(--neon);
  border-color: var(--neon);
}

/* ── Session switcher ──────────────────────────────────────────── */
.session-switcher { position: relative; min-width: 0; flex: 1; }

.switcher-btn {
  display: flex; align-items: center; gap: 6px;
  background: none; border: none; cursor: pointer;
  padding: 4px 8px; border-radius: var(--radius-sm);
  max-width: 100%; min-width: 0;
  transition: background .15s;
  --app-icon-size: 12px;
}
.switcher-btn:hover { background: color-mix(in srgb, var(--neon) 8%, transparent); }

.switcher-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  font-size: 0; /* 隐藏图标文字，只显示圆点背景 */
  display: inline-block;
}
.switcher-dot.live { background: var(--success); box-shadow: 0 0 5px color-mix(in srgb, var(--success) 70%, transparent); }
.switcher-dot.dead { background: var(--muted); }

.switcher-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 13px; font-weight: 700;
  color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 200px;
}
.switcher-chevron {
  color: var(--muted); font-size: 11px; flex-shrink: 0;
  transition: transform .2s; display: inline-block;
}
.switcher-chevron.open { transform: rotate(180deg); }

.switcher-dropdown {
  position: absolute; top: calc(100% + 6px); left: 0;
  min-width: 240px; max-width: min(320px, 90vw);
  background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow), 0 0 20px var(--glow);
  overflow: hidden; z-index: 200;
  padding: 6px;
}
.switcher-section-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 9px; font-weight: 700;
  letter-spacing: 2px; color: var(--muted); padding: 4px 8px 2px;
}
.switcher-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; cursor: pointer;
  padding: 8px 10px; border-radius: var(--radius-sm); text-align: left;
  transition: background .12s;
  --app-icon-size: 14px;
}
.switcher-item:hover { background: color-mix(in srgb, var(--neon) 8%, transparent); }
.switcher-item.current { background: color-mix(in srgb, var(--neon) 12%, transparent); }
.switcher-item.dead { opacity: .5; }
.switcher-item-name {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 1;
}
.switcher-item-cwd {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--muted); white-space: nowrap; flex-shrink: 0;
}
.switcher-divider { height: 1px; background: var(--hairline); margin: 6px 0; }
.switcher-new {
  color: var(--neon) !important;
  font-family: 'JetBrains Mono', ui-monospace, monospace !important; font-size: 12px !important; font-weight: 700;
}
.switcher-danger {
  color: var(--danger) !important;
  font-family: 'JetBrains Mono', ui-monospace, monospace !important; font-size: 12px !important; font-weight: 700;
}
.switcher-danger:hover { background: color-mix(in srgb, var(--danger) 10%, transparent) !important; }
.switcher-empty {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--muted); padding: 6px 10px; opacity: .6;
}
.switcher-kill-btn {
  background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 2px 5px; border-radius: var(--radius-sm); margin-left: auto;
  flex-shrink: 0; transition: color .12s, background .12s;
  display: inline-flex; align-items: center; justify-content: center;
  line-height: 1; overflow: visible; --app-icon-size: 13px;
}
.switcher-kill-btn:hover { color: var(--warning); background: color-mix(in srgb, var(--warning) 10%, transparent); }


/* ── Content area ──────────────────────────────────────────────── */
.content {
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--panel) 18%, transparent), transparent 130px);
}
.content.is-terminal {
  height: calc(var(--vvh, 100dvh) - var(--topbar-h, 46px));
  max-height: calc(var(--vvh, 100dvh) - var(--topbar-h, 46px));
}

.home-view, .new-view, .log-view, .settings-view, .help-view, .files-view, .shell-view {
  flex: 1; overflow: auto; display: flex; flex-direction: column;
  min-height: 0;
}

/* Terminal fills its parent */
.terminal-view,
.shell-view {
  position: relative;
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
}
.terminal-status {
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
.terminal-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
  flex-shrink: 0;
}
.terminal-status.is-connected {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 36%, var(--border));
}
.terminal-status.is-connecting {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 36%, var(--border));
}
.terminal-status.is-closed,
.terminal-status.is-error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 36%, var(--border));
}
</style>

<style>
/* Kill confirm — global (Teleport to body) */
.kc-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background-color: var(--overlay);
  background: var(--overlay); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.kc-box {
  background-color: var(--panel);
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 24px 28px;
  width: min(340px, 88vw);
  box-shadow: var(--shadow), 0 0 20px var(--glow);
  display: flex; flex-direction: column; gap: 16px;
}
.kc-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 15px; font-weight: 800;
  color: var(--text);
}
.kc-msg {
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
  color: var(--muted); line-height: 1.5;
}
.kc-msg strong { color: var(--text); }
.kc-btns { display: flex; gap: 10px; justify-content: flex-end; }
.kc-cancel {
  background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--muted); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px;
  padding: 8px 16px; cursor: pointer; transition: border-color .15s, color .15s;
}
.kc-cancel:hover { border-color: var(--border-strong); color: var(--text); }
.kc-ok {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 50%, transparent); border-radius: var(--radius-sm);
  color: var(--danger); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; font-weight: 700;
  padding: 8px 16px; cursor: pointer; transition: background .15s;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  line-height: 1; --app-icon-size: 14px;
}
.kc-ok:hover { background: color-mix(in srgb, var(--danger) 18%, transparent); }
</style>
