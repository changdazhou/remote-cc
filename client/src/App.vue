<template>
  <div class="app-root">

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
              <span class="switcher-chevron" :class="{ open: switcherOpen }">{{ icons.chevron }}</span>
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
                <span class="switcher-dot live">{{ icons.status_live }}</span>
                <span class="switcher-item-name">{{ s.name }}</span>
                <span class="switcher-item-cwd">{{ shortCwd(s.workingDir) }}</span>
                <button class="switcher-kill-btn" :title="t.stop_session"
                  @click.stop="killSession(s); switcherOpen = false">{{ icons.delete }}</button>
              </button>
              <div v-if="!aliveSessions.length" class="switcher-empty">{{ t.no_sessions }}</div>
              <div class="switcher-divider"></div>
              <button v-if="currentMeta?.alive"
                class="switcher-item switcher-danger"
                @click="killSession(currentMeta); switcherOpen = false">
                {{ icons.delete }} {{ t.stop_session }}
              </button>
              <button class="switcher-item switcher-new" @click="switcherOpen = false; view = 'home'">
                {{ icons.new }} {{ t.new_conv }}
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
            class="topbar-badge" title="Multiple terminals attached">
            {{ icons.attach }}{{ currentMeta.clientCount }}
          </span>
          <!-- Home (only in terminal view) -->
          <button v-if="view === 'terminal'"
            class="topbar-icon-btn"
            @click="view = 'home'" title="主页">
            {{ icons.home }}
          </button>
          <!-- Settings -->
          <button class="topbar-icon-btn" :class="{ active: view === 'settings' }"
            @click="toggleOverlay('settings')" title="设置">
            {{ icons.settings }}
          </button>
          <!-- Help -->
          <button class="topbar-icon-btn" :class="{ active: view === 'help' }"
            @click="toggleOverlay('help')" title="帮助">
            ?
          </button>
        </div>
      </header>

      <!-- Content -->
      <div class="content" :class="{ 'is-terminal': view === 'terminal' }">

        <!-- ── Home: conversation list ───────────────────────────────── -->
        <div v-show="view === 'home'" class="home-view">
          <ConversationList
            :sessions="sessionList"
            :loading="!wsReady"
            :icons="icons"
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

        <!-- ── Terminals (always in DOM, v-show to switch) ───────────── -->
        <div v-show="view === 'terminal'" class="terminal-view">
          <Terminal
            v-for="entry in termList"
            :key="entry.sid"
            v-show="entry.sid === activeSessionId"
            :theme="theme"
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
            <button class="kc-ok" @click="confirmKillAndExit">{{ t.stop_btn }} {{ icons.kill }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { login, isLoggedIn, getSavedUsername, createWS, api } from './api/index.js';
import Terminal          from './components/Terminal.vue';
import LogViewer         from './components/LogViewer.vue';
import ConversationList  from './components/ConversationList.vue';
import NewConversation   from './components/NewConversation.vue';
import SettingsPage      from './components/SettingsPage.vue';
import HelpPage          from './components/HelpPage.vue';
import { settings, COLOR_THEMES, getIcons } from './settings.js';
import { useI18n } from './i18n.js';
import { route, navigate } from './router.js';

const { t } = useI18n();

// ── Themes ────────────────────────────────────────────────────────────────────
const THEME_LIST = COLOR_THEMES;
const theme  = computed(() => settings.colorTheme);
const icons  = computed(() => getIcons(settings.colorTheme));
function setTheme(id) { settings.colorTheme = id; }

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

function initControlWS() {
  if (controlWS && controlWS.readyState < 2) return;
  controlWS = createWS();
  controlWS.onopen    = () => { wsReady.value = true; };
  controlWS.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'session_list') sessionList.value = msg.sessions;
    } catch (_) {}
  };
  controlWS.onclose   = () => { wsReady.value = false; reconnTimer = setTimeout(initControlWS, 3000); };
  controlWS.onerror   = () => {};
}

function sendControl(obj) {
  if (controlWS?.readyState === 1) controlWS.send(JSON.stringify(obj));
}

// ── Session list (from server) ────────────────────────────────────────────────
const sessionList = ref([]);
const aliveSessions = computed(() => sessionList.value.filter(s => s.alive));
const deadSessions  = computed(() => sessionList.value.filter(s => !s.alive));

// ── Terminal sessions (client-side instances) ─────────────────────────────────
// termList: reactive array of session objects — Vue can track array mutations
// Each entry: { sid, ws, alive, wsStarted, name, workingDir, resumeSessionId, attachSessionId, _destroy }
const termList = reactive([]);   // Array<SessionEntry>
const termRefs = {};             // { [sid]: Terminal component instance }

const activeSessionId = ref('');
const currentMeta = computed(() => {
  const fromList = sessionList.value.find(s => s.sessionId === activeSessionId.value);
  if (fromList) return fromList;
  const entry = termList.find(e => e.sid === activeSessionId.value);
  if (entry) return { sessionId: entry.sid, name: entry.name, workingDir: entry.workingDir, alive: entry.alive, clientCount: 0 };
  return null;
});

function findEntry(sid) { return termList.find(e => e.sid === sid); }

// ── Per-session WS ────────────────────────────────────────────────────────────
function connectEntryWS(entry) {
  if (entry._destroy) { entry._destroy(); entry._destroy = null; }

  let destroyed = false;
  let reconnDelay = 1000;
  let reconnTimeout = null;

  const ws = createWS();
  entry.ws = ws;

  ws.onopen = () => {
    reconnDelay = 1000;
    // Fit terminal now that WS is ready
    const el = termRefs[entry.sid];
    if (el) el.fit();

    if (entry.attachSessionId) {
      ws.send(JSON.stringify({ type: 'attach', sessionId: entry.attachSessionId }));
    } else {
      ws.send(JSON.stringify({
        type: 'start',
        workingDir: entry.workingDir,
        resumeSessionId: entry.resumeSessionId || '',
        name: entry.name,
        cols: 80, rows: 24,
      }));
    }
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
          return;
        }
        case 'session_list':
          sessionList.value = msg.sessions;
          return;
        case 'replay_start':
          return;
        case 'replay_end': {
          const el = termRefs[entry.sid];
          if (el) {
            el.fit();
            // 恢复历史会话后滚到底部（输入框位置）
            nextTick(() => el.scrollToBottom());
          }
          return;
        }
        case 'exit': {
          entry.alive = false;
          const el = termRefs[entry.sid];
          if (el) el.write(`\r\n\x1b[33m[${t.value.exited} ${msg.exitCode}]\x1b[0m\r\n`);
          return;
        }
        case 'error': {
          const el = termRefs[entry.sid];
          if (el) el.write(`\r\n\x1b[31m[${t.value.error_prefix}${msg.message}]\x1b[0m\r\n`);
          return;
        }
        case 'detached': {
          const el = termRefs[entry.sid];
          if (el) el.write(`\r\n\x1b[33m[${t.value.taken_over}]\x1b[0m\r\n`);
          return;
        }
      }
    } catch (_) {}
    // Raw PTY data
    const el = termRefs[entry.sid];
    if (el) el.write(data);
  };

  ws.onerror = () => {};

  ws.onclose = () => {
    if (destroyed) return;
    const el = termRefs[entry.sid];
    if (el) el.write(`\r\n\x1b[33m[${t.value.disconnected} ${(reconnDelay/1000).toFixed(1)}${t.value.reconnecting}]\x1b[0m\r\n`);
    reconnTimeout = setTimeout(() => {
      if (destroyed) return;
      reconnDelay = Math.min(reconnDelay * 1.5, 15000);
      connectEntryWS(entry);
    }, reconnDelay);
  };

  entry._destroy = () => {
    destroyed = true;
    clearTimeout(reconnTimeout);
    try { ws.close(); } catch (_) {}
  };
}

// ── Navigation ────────────────────────────────────────────────────────────────
const view         = ref('home');
const prevView     = ref('home');
const logTarget    = ref(null);
const switcherOpen = ref(false);
const switcherRef  = ref(null);

function openSession(s) {
  // Already have this session open
  const existing = findEntry(s.sessionId);
  if (existing) {
    activeSessionId.value = s.sessionId;
    view.value = 'terminal';
    switcherOpen.value = false;
    return;
  }

  const entry = {
    sid: s.sessionId,
    ws: null,
    alive: !!s.alive,
    wsStarted: false,
    name: s.name || s.sessionId,
    workingDir: s.workingDir || '',
    resumeSessionId: '',
    attachSessionId: s.sessionId,
    _destroy: null,
  };
  termList.push(entry);
  activeSessionId.value = s.sessionId;
  view.value = 'terminal';
  switcherOpen.value = false;

  // Wait for Terminal component to mount before connecting WS
  nextTick(() => connectEntryWS(entry));
}

function startSession({ workingDir, name, resumeSessionId }) {
  // Deduplicate pending sessions
  for (const entry of termList) {
    if (entry.attachSessionId === '' &&
        entry.workingDir === workingDir &&
        (entry.resumeSessionId || '') === (resumeSessionId || '')) {
      activeSessionId.value = entry.sid;
      view.value = 'terminal';
      return;
    }
  }

  const placeholder = `pending-${Date.now()}`;
  const entry = {
    sid: placeholder,
    ws: null,
    alive: true,
    wsStarted: false,
    name: name || ((workingDir || '~').split('/').pop() || 'root'),
    workingDir: workingDir || '~',
    resumeSessionId: resumeSessionId || '',
    attachSessionId: '',
    _destroy: null,
  };
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

function doLogout() {
  import('./api/index.js').then(({ logout }) => logout());
  authed.value = false;
  view.value = 'home';
  settings.username = '';
}

// Terminal event handlers
function onTermInput(sid, data) {
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN) entry.ws.send(data);
  // 同步更新当前行追踪（键盘输入已由 terminal 内部 onData 处理，
  // 但 SymbolBar 的输入绕过了 onData，所以这里统一补充）
  const el = termRefs[sid];
  if (el?.trackInput) el.trackInput(data);
}
function onTermResize(sid, { cols, rows }) {
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN)
    entry.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}
function onTermPaste(sid, text) {
  const entry = findEntry(sid);
  if (entry?.ws?.readyState === WebSocket.OPEN) entry.ws.send(text);
}
function setTermRef(sid, el) {
  if (el) termRefs[sid] = el;
  else delete termRefs[sid];
}

// ── Restore ───────────────────────────────────────────────────────────────────
async function tryRestore() {
  try {
    const sessions = await api.getActiveSessions();
    const lastId = localStorage.getItem('rcc_last_session');
    const alive = sessions.find(s => s.sessionId === lastId && s.alive);
    if (alive) openSession(alive);
  } catch (_) {}
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
      const s = sessions.find(x => x.sessionId === r.params.id && x.alive);
      if (s) openSession(s);
      else { navigate('home'); tryRestore(); }
    }).catch(() => { navigate('home'); tryRestore(); });
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
  if (authed.value) init();
  document.addEventListener('click', onDocClick);
  initVP();
});
onBeforeUnmount(() => {
  clearTimeout(reconnTimer);
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
[data-theme="cyber"]    { --neon:#00ffd5; --neon2:#89dceb; --bg:#0d0d0d; --bg2:#111318; --bg3:#1a1f2e; --text:#cdd6f4; --muted:#7c8099; --border:#00ffd518; --glow:#00ffd528; }
[data-theme="mocha"]    { --neon:#cba6f7; --neon2:#f5c2e7; --bg:#1e1e2e; --bg2:#181825; --bg3:#232336; --text:#cdd6f4; --muted:#6c7086; --border:#cba6f718; --glow:#cba6f728; }
[data-theme="gruvbox"]  { --neon:#fabd2f; --neon2:#fe8019; --bg:#282828; --bg2:#1d2021; --bg3:#32302f; --text:#ebdbb2; --muted:#928374; --border:#fabd2f18; --glow:#fabd2f28; }
[data-theme="nord"]     { --neon:#88c0d0; --neon2:#81a1c1; --bg:#2e3440; --bg2:#242933; --bg3:#343d4a; --text:#d8dee9; --muted:#4c566a; --border:#88c0d018; --glow:#88c0d028; }
[data-theme="dracula"]  { --neon:#ff79c6; --neon2:#bd93f9; --bg:#282a36; --bg2:#1e1f29; --bg3:#313244; --text:#f8f8f2; --muted:#6272a4; --border:#ff79c618; --glow:#ff79c628; }
[data-theme="solarized"]{ --neon:#268bd2; --neon2:#2aa198; --bg:#002b36; --bg2:#073642; --bg3:#0d4050; --text:#839496; --muted:#586e75; --border:#268bd218; --glow:#268bd228; }

/* ── 浅色主题 ────────────────────────────────────────────────────────────── */
[data-theme="latte"]    { --neon:#8839ef; --neon2:#04a5e5; --bg:#eff1f5; --bg2:#e6e9ef; --bg3:#dce0e8; --text:#4c4f69; --muted:#8c8fa1; --border:#8839ef22; --glow:#8839ef20; }
[data-theme="paper"]    { --neon:#1a73e8; --neon2:#0598bc; --bg:#fafafa; --bg2:#f0f0f0; --bg3:#e8e8e8; --text:#24292e; --muted:#6a737d; --border:#1a73e820; --glow:#1a73e818; }
[data-theme="day"]      { --neon:#0969da; --neon2:#218bff; --bg:#ffffff; --bg2:#f6f8fa; --bg3:#eaeef2; --text:#1f2328; --muted:#57606a; --border:#0969da1e; --glow:#0969da18; }

/* ── 浅色主题全局适配 ────────────────────────────────────────────────────── */
/* 浅色模式下，某些深色 hardcode 颜色需要反转 */
html[data-light] body,
html[data-light] #app { background: var(--bg); color: var(--text); }

/* 浅色模式下状态点保持高对比 */
html[data-light] .switcher-dot.live,
html[data-light] .cl-status.live { background: #1a7f37; box-shadow: 0 0 4px #1a7f3750; }
html[data-light] .switcher-dot.dead,
html[data-light] .cl-status.dead { background: var(--muted); box-shadow: none; }

/* 浅色模式下 border 稍微明显 */
html[data-light] { --border: color-mix(in srgb, var(--neon) 25%, var(--muted) 15%); }

/* ═══════════════════════════════════════════════════════════════════════════
   UI STYLE THEMES
   每套风格覆盖相同的 CSS 变量集，让所有组件自动适配
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── default (Cyberpunk): 赛博朋克，霓虹发光，高对比 ─────────────────────── */
/* default 风格已由颜色主题变量定义，无需额外覆盖 */

/* ── minimal (Terminal): 极简终端感，方形/无装饰/纯色 ───────────────────── */
[data-ui-style="minimal"] {
  --glow: transparent;
  /* 更粗的边框，更高可见度 */
  --border: color-mix(in srgb, var(--muted) 40%, transparent);
  /* 轻微去饱和，降低颜色强度 */
  --neon-opacity: 0.8;
}
/* 无圆角 */
[data-ui-style="minimal"] .topbar,
[data-ui-style="minimal"] .login-box,
[data-ui-style="minimal"] .switcher-dropdown,
[data-ui-style="minimal"] .cl-item,
[data-ui-style="minimal"] .nc-card,
[data-ui-style="minimal"] .sp-section,
[data-ui-style="minimal"] .sp-style-card,
[data-ui-style="minimal"] .sp-color-card {
  border-radius: 0 !important;
}
/* 无阴影、无发光 */
[data-ui-style="minimal"] * {
  box-shadow: none !important;
  text-shadow: none !important;
}
/* 顶栏：细底部边框+纯色背景 */
[data-ui-style="minimal"] .topbar {
  border-bottom: 1px solid var(--muted) !important;
  border-bottom-opacity: 0.4;
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
[data-ui-style="minimal"] .sp-select {
  border-radius: 0 !important;
}
/* session 状态点：正方形 */
[data-ui-style="minimal"] .switcher-dot,
[data-ui-style="minimal"] .cl-status {
  border-radius: 2px !important;
}
/* 卡片列表：用左边框区分当前 */
[data-ui-style="minimal"] .cl-item:hover {
  background: color-mix(in srgb, var(--neon) 5%, transparent) !important;
  border-color: var(--muted) !important;
}

/* ── glass (Frosted): 毛玻璃，半透明，柔和渐变 ───────────────────────────── */
[data-ui-style="glass"] {
  /* 降低背景不透明度，营造通透感 */
  --bg-opacity: 0.85;
}
/* 整体背景加细微渐变 */
[data-ui-style="glass"] body,
[data-ui-style="glass"] html {
  background: linear-gradient(135deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 80%, var(--neon)) 100%) !important;
}
/* 顶栏毛玻璃 */
[data-ui-style="glass"] .topbar {
  background: color-mix(in srgb, var(--bg2) 60%, transparent) !important;
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border-bottom: 1px solid rgba(255,255,255,0.08) !important;
}
/* 登录框：毛玻璃卡片 */
[data-ui-style="glass"] .login-box {
  background: color-mix(in srgb, var(--bg2) 55%, transparent) !important;
  backdrop-filter: blur(32px) saturate(2);
  -webkit-backdrop-filter: blur(32px) saturate(2);
  border: 1px solid rgba(255,255,255,0.12) !important;
  border-radius: 20px !important;
}
/* dropdown 毛玻璃 */
[data-ui-style="glass"] .switcher-dropdown {
  background: color-mix(in srgb, var(--bg2) 55%, transparent) !important;
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 14px !important;
}
/* 卡片：毛玻璃 */
[data-ui-style="glass"] .cl-item,
[data-ui-style="glass"] .nc-card,
[data-ui-style="glass"] .sp-style-card,
[data-ui-style="glass"] .sp-color-card {
  background: color-mix(in srgb, var(--bg2) 50%, transparent) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 14px !important;
}
/* 内容区毛玻璃 */
[data-ui-style="glass"] .home-view,
[data-ui-style="glass"] .new-view,
[data-ui-style="glass"] .settings-view,
[data-ui-style="glass"] .log-view {
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  backdrop-filter: blur(4px);
}
/* 按钮圆角更大 */
[data-ui-style="glass"] .start-btn,
[data-ui-style="glass"] .cl-new-btn,
[data-ui-style="glass"] .nc-start,
[data-ui-style="glass"] .topbar-icon-btn {
  border-radius: 20px !important;
}
/* 输入框圆角 */
[data-ui-style="glass"] .neon-input,
[data-ui-style="glass"] .nc-input {
  background: color-mix(in srgb, var(--bg) 50%, transparent) !important;
  backdrop-filter: blur(8px);
  border-radius: 12px !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
}
[data-ui-style="glass"] .neon-input:focus,
[data-ui-style="glass"] .nc-input:focus {
  border-color: color-mix(in srgb, var(--neon) 60%, transparent) !important;
  background: color-mix(in srgb, var(--bg) 40%, transparent) !important;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); }
body { font-family: 'JetBrains Mono', monospace; }
</style>

<style scoped>
.app-root {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: var(--bg);
}

/* ── Login ─────────────────────────────────────────────────────── */
.login-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(12px);
}
.login-box {
  background: var(--bg2); border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--neon) 25%, transparent);
  padding: 40px 32px; width: min(380px, 92vw);
  display: flex; flex-direction: column; gap: 14px;
  box-shadow: 0 0 80px var(--glow);
}
.login-logo {
  font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 800;
  text-align: center; letter-spacing: 1px; color: var(--text);
}
.logo-cc      { color: #fabd2f; text-shadow: 0 0 20px #fabd2f80; }
.logo-bracket { color: var(--muted); font-weight: 300; }
.logo-rcc     { color: var(--neon); text-shadow: 0 0 20px var(--neon); }
.logo-accent  { color: var(--neon); text-shadow: 0 0 20px var(--neon); }
.logo-dim     { color: var(--muted); font-weight: 400; margin-right: 2px; }
.login-sub {
  font-family: 'Syne', sans-serif; font-size: 11px; color: var(--muted);
  text-align: center; letter-spacing: 3px; text-transform: uppercase;
  margin-top: -8px; margin-bottom: 2px;
}
.neon-input {
  width: 100%; background: var(--bg); color: var(--text);
  border: 1px solid color-mix(in srgb, var(--neon) 22%, transparent);
  border-radius: 7px; font-family: 'JetBrains Mono', monospace; font-size: 13px;
  padding: 11px 14px; outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.neon-input:focus {
  border-color: var(--neon);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 12%, transparent);
}
.login-error { color: #f38ba8; font-size: 12px; text-align: center; }
.start-btn {
  background: transparent; border: 1px solid var(--neon); border-radius: 7px;
  color: var(--neon); font-family: 'Syne', sans-serif; font-size: 13px;
  font-weight: 800; letter-spacing: 3px; padding: 13px; cursor: pointer;
  transition: background .2s, box-shadow .2s;
}
.start-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--neon) 8%, transparent);
  box-shadow: 0 0 24px var(--glow);
}
.start-btn:disabled { opacity: .45; cursor: not-allowed; }

/* ── Global topbar ─────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; height: 44px; flex-shrink: 0;
  background: var(--bg2);
  border-bottom: 1px solid var(--border);
  gap: 10px; position: relative; z-index: 50;
}
.topbar-left  { display: flex; align-items: center; min-width: 0; flex: 1; }
.topbar-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.topbar-brand {
  font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800;
  color: var(--text); background: none; border: none; cursor: pointer;
  letter-spacing: 0.5px; padding: 0; transition: color .15s;
}
.topbar-brand:hover { color: var(--neon); }

.topbar-badge {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: var(--neon); opacity: .7;
}

.topbar-icon-btn {
  background: none; border: none; cursor: pointer;
  color: var(--muted); font-size: 16px;
  width: 30px; height: 30px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  transition: color .15s, background .15s;
  flex-shrink: 0;
}
.topbar-icon-btn:hover  { color: var(--text);  background: color-mix(in srgb, var(--neon) 8%, transparent); }
.topbar-icon-btn.active { color: var(--neon);  background: color-mix(in srgb, var(--neon) 12%, transparent); }

/* ── Session switcher ──────────────────────────────────────────── */
.session-switcher { position: relative; min-width: 0; flex: 1; }

.switcher-btn {
  display: flex; align-items: center; gap: 6px;
  background: none; border: none; cursor: pointer;
  padding: 4px 8px; border-radius: 6px;
  max-width: 100%; min-width: 0;
  transition: background .15s;
}
.switcher-btn:hover { background: color-mix(in srgb, var(--neon) 8%, transparent); }

.switcher-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  font-size: 0; /* 隐藏图标文字，只显示圆点背景 */
  display: inline-block;
}
.switcher-dot.live { background: #a6e3a1; box-shadow: 0 0 5px #a6e3a1; }
.switcher-dot.dead { background: var(--muted); }

.switcher-name {
  font-family: 'Syne', sans-serif; font-size: 13px; font-weight: 700;
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
  background: var(--bg2); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 8px 40px #00000060, 0 0 20px var(--glow);
  overflow: hidden; z-index: 200;
  padding: 6px;
}
.switcher-section-label {
  font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700;
  letter-spacing: 2px; color: var(--muted); padding: 4px 8px 2px;
}
.switcher-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; cursor: pointer;
  padding: 8px 10px; border-radius: 6px; text-align: left;
  transition: background .12s;
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
.switcher-divider { height: 1px; background: var(--border); margin: 6px 0; }
.switcher-new {
  color: var(--neon) !important;
  font-family: 'Syne', sans-serif !important; font-size: 12px !important; font-weight: 700;
}
.switcher-danger {
  color: #f38ba8 !important;
  font-family: 'Syne', sans-serif !important; font-size: 12px !important; font-weight: 700;
}
.switcher-danger:hover { background: color-mix(in srgb, #f38ba8 10%, transparent) !important; }
.switcher-empty {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: var(--muted); padding: 6px 10px; opacity: .6;
}
.switcher-kill-btn {
  background: none; border: none; cursor: pointer; color: var(--muted);
  font-size: 11px; padding: 2px 5px; border-radius: 4px; margin-left: auto;
  flex-shrink: 0; transition: color .12s, background .12s;
}
.switcher-kill-btn:hover { color: #f9e2af; background: color-mix(in srgb, #f9e2af 10%, transparent); }


/* ── Content area ──────────────────────────────────────────────── */
.content {
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
}
.content.is-terminal {
  height: calc(var(--vvh, 100dvh) - 44px);
  max-height: calc(var(--vvh, 100dvh) - 44px);
}

.home-view, .new-view, .log-view, .settings-view, .help-view {
  flex: 1; overflow: auto; display: flex; flex-direction: column;
}

/* Terminal fills its parent */
.terminal-view {
  flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden;
}
</style>

<style>
/* Kill confirm — global (Teleport to body) */
.kc-overlay {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.kc-box {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px 28px;
  width: min(340px, 88vw);
  box-shadow: 0 8px 40px #00000080, 0 0 20px var(--glow);
  display: flex; flex-direction: column; gap: 16px;
}
.kc-title {
  font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 800;
  color: var(--text);
}
.kc-msg {
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
  color: var(--muted); line-height: 1.5;
}
.kc-msg strong { color: var(--text); }
.kc-btns { display: flex; gap: 10px; justify-content: flex-end; }
.kc-cancel {
  background: none; border: 1px solid var(--border); border-radius: 7px;
  color: var(--muted); font-family: 'Syne', sans-serif; font-size: 12px;
  padding: 8px 16px; cursor: pointer; transition: border-color .15s, color .15s;
}
.kc-cancel:hover { border-color: var(--neon); color: var(--text); }
.kc-ok {
  background: color-mix(in srgb, #f38ba8 10%, transparent);
  border: 1px solid #f38ba860; border-radius: 7px;
  color: #f38ba8; font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700;
  padding: 8px 16px; cursor: pointer; transition: background .15s;
}
.kc-ok:hover { background: color-mix(in srgb, #f38ba8 20%, transparent); }
</style>
