<template>
  <div class="sp-root">
    <div class="sp-header">
      <div class="sp-title">{{ t.settings }}</div>
    </div>

    <div class="sp-body">

      <!-- ── 外观 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.appearance }}</div>

        <!-- UI 风格 -->
        <div class="sp-field">
          <label class="sp-label">{{ t.ui_style }}</label>
          <div class="sp-style-grid">
            <button
              v-for="s in UI_STYLES" :key="s.id"
              class="sp-style-card"
              :class="{ active: settings.uiStyle === s.id }"
              @click="settings.uiStyle = s.id"
            >
              <div class="sp-style-preview" :class="`preview-${s.id}`">
                <div class="pv-topbar"></div>
                <div class="pv-content">
                  <div class="pv-rail"></div>
                  <div class="pv-line"></div>
                  <div class="pv-line short"></div>
                  <div class="pv-line tiny"></div>
                </div>
              </div>
              <div class="sp-style-name">{{ t[`style_${s.id}`] || s.name }}</div>
              <div class="sp-style-desc">{{ t[`style_${s.id}_desc`] || s.desc }}</div>
            </button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.topbar_height }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.topbarHeight = Math.max(38, settings.topbarHeight - 2)"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.topbarHeight }}px</span>
            <button class="sp-step-btn" @click="settings.topbarHeight = Math.min(64, settings.topbarHeight + 2)"><AppIcon name="plus" /></button>
          </div>
        </div>

        <div class="sp-field">
          <label class="sp-label">{{ t.icon_style }}</label>
          <div class="sp-icon-style-grid">
            <button
              v-for="icon in ICON_STYLES"
              :key="icon.id"
              class="sp-icon-style-card"
              :class="{ active: settings.iconStyle === icon.id }"
              :data-icon-style="icon.id"
              @click="settings.iconStyle = icon.id"
            >
              <span class="sp-icon-style-preview" aria-hidden="true">
                <AppIcon name="home" :variant="icon.id" />
                <AppIcon name="terminal" :variant="icon.id" />
                <AppIcon name="folder" :variant="icon.id" />
              </span>
              <span class="sp-icon-style-text">
                <span class="sp-icon-style-name">{{ icon.name }}</span>
                <span class="sp-icon-style-desc">{{ t[`icon_${icon.id}_desc`] || icon.desc }}</span>
              </span>
              <AppIcon :name="settings.iconStyle === icon.id ? 'check' : 'settings'" :variant="icon.id" class="sp-icon-preview" />
            </button>
          </div>
        </div>

        <!-- 颜色主题 -->
        <div class="sp-field">
          <label class="sp-label">{{ t.color_theme }}</label>
          <!-- 深色主题 -->
          <div class="sp-theme-group-label">{{ t.dark_themes }}</div>
          <div class="sp-color-grid">
            <button
              v-for="ct in darkThemes" :key="ct.id"
              class="sp-color-card"
              :class="{ active: settings.colorTheme === ct.id }"
              :data-theme="ct.id"
              @click="settings.colorTheme = ct.id"
            >
              <span class="sp-color-preview" aria-hidden="true">
                <span class="sp-color-dot"></span>
                <span class="sp-color-pane"></span>
                <span class="sp-color-line"></span>
              </span>
              <span class="sp-color-name">{{ ct.name }}</span>
              <AppIcon :name="settings.colorTheme === ct.id ? 'check' : 'settings'" class="sp-icon-preview" />
            </button>
          </div>
          <!-- 浅色主题 -->
          <div class="sp-theme-group-label" style="margin-top:10px">{{ t.light_themes }}</div>
          <div class="sp-color-grid">
            <button
              v-for="ct in lightThemes" :key="ct.id"
              class="sp-color-card sp-color-card-light"
              :class="{ active: settings.colorTheme === ct.id }"
              :data-theme="ct.id"
              @click="settings.colorTheme = ct.id"
            >
              <span class="sp-color-preview" aria-hidden="true">
                <span class="sp-color-dot"></span>
                <span class="sp-color-pane"></span>
                <span class="sp-color-line"></span>
              </span>
              <span class="sp-color-name">{{ ct.name }}</span>
              <AppIcon :name="settings.colorTheme === ct.id ? 'check' : 'settings'" class="sp-icon-preview" />
            </button>
          </div>
        </div>
      </section>

      <!-- ── 终端 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.terminal_sec }}</div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.font }}</label>
          <select v-model="settings.fontFamily" class="sp-select">
            <option v-for="f in FONT_FAMILIES" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.font_size }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.fontSize = Math.max(8, settings.fontSize - 1)"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.fontSize }}px</span>
            <button class="sp-step-btn" @click="settings.fontSize = Math.min(24, settings.fontSize + 1)"><AppIcon name="plus" /></button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.line_height }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.lineHeight = Math.max(1.0, +(settings.lineHeight - 0.1).toFixed(1))"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.lineHeight.toFixed(1) }}</span>
            <button class="sp-step-btn" @click="settings.lineHeight = Math.min(2.0, +(settings.lineHeight + 0.1).toFixed(1))"><AppIcon name="plus" /></button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.cursor_style }}</label>
          <div class="sp-radio-group">
            <label v-for="c in ['block','underline','bar']" :key="c" class="sp-radio">
              <input type="radio" :value="c" v-model="settings.cursorStyle" />
              <span>{{ c }}</span>
            </label>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.cursor_blink }}</label>
          <label class="sp-toggle">
            <input type="checkbox" v-model="settings.cursorBlink" />
            <span class="sp-toggle-track"><span class="sp-toggle-thumb"></span></span>
          </label>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.scrollback }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.scrollback = Math.max(500, settings.scrollback - 500)"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.scrollback.toLocaleString() }}</span>
            <button class="sp-step-btn" @click="settings.scrollback = Math.min(50000, settings.scrollback + 500)"><AppIcon name="plus" /></button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.symbol_bar }}</label>
          <label class="sp-toggle">
            <input type="checkbox" v-model="settings.symbolBar" />
            <span class="sp-toggle-track"><span class="sp-toggle-thumb"></span></span>
          </label>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.mobile_keyboard_enter }}</label>
          <div class="sp-radio-group">
            <label v-for="item in mobileEnterOptions" :key="item.value" class="sp-radio">
              <input type="radio" :value="item.value" v-model="settings.mobileKeyboardEnter" />
              <span>{{ t[item.labelKey] }}</span>
            </label>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.shell_terminal_slots }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="changeShellSlots(-1)"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.shellTerminalSlots }}</span>
            <button class="sp-step-btn" @click="changeShellSlots(1)"><AppIcon name="plus" /></button>
          </div>
        </div>
      </section>

      <!-- ── 连接 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.connection }}</div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.reconnect_init }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.reconnectDelay = Math.max(500, settings.reconnectDelay - 500)"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.reconnectDelay / 1000 }}s</span>
            <button class="sp-step-btn" @click="settings.reconnectDelay = Math.min(10000, settings.reconnectDelay + 500)"><AppIcon name="plus" /></button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.reconnect_max }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.maxReconnectDelay = Math.max(5000, settings.maxReconnectDelay - 5000)"><AppIcon name="minus" /></button>
            <span class="sp-step-val">{{ settings.maxReconnectDelay / 1000 }}s</span>
            <button class="sp-step-btn" @click="settings.maxReconnectDelay = Math.min(60000, settings.maxReconnectDelay + 5000)"><AppIcon name="plus" /></button>
          </div>
        </div>
      </section>

      <!-- ── 远程控制 ─────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.remote_control }}</div>

        <div v-for="field in directoryFields" :key="field.key" class="sp-field">
          <label class="sp-label">{{ t[field.labelKey] }}</label>
          <div class="sp-path-row">
            <input
              v-model="settings[field.key]"
              class="sp-input"
              spellcheck="false"
              autocorrect="off"
              autocapitalize="off"
              :placeholder="field.fallback"
              @blur="normalizePathSetting(field.key, field.fallback)"
              @keyup.enter="normalizePathSetting(field.key, field.fallback)"
            />
            <button class="sp-icon-btn" :class="{ active: dirPickerTarget === field.key }" type="button" @click="toggleDirPicker(field.key)">
              <AppIcon name="folder" />
            </button>
          </div>
          <DirectoryPicker
            v-if="dirPickerTarget === field.key"
            :initial-path="settings[field.key] || field.fallback"
            @select="path => selectDirectory(field.key, path)"
            @cancel="dirPickerTarget = ''"
          />
        </div>

        <div class="sp-field">
          <label class="sp-label">{{ t.agent_commands }}</label>
          <div class="sp-agent-grid">
            <div v-for="field in agentCommandFields" :key="field.id" class="sp-agent-row">
              <span class="sp-agent-name">{{ field.name }}</span>
              <input
                v-model="settings[field.key]"
                class="sp-input"
                spellcheck="false"
                autocorrect="off"
                autocapitalize="off"
                :placeholder="field.placeholder"
                @blur="normalizeCommandSetting(field.key)"
                @keyup.enter="normalizeCommandSetting(field.key)"
              />
              <span class="sp-status" :class="agentStatusClass(field.id)">{{ agentStatusLabel(field.id) }}</span>
            </div>
            <div class="sp-inline-actions">
              <button class="sp-ghost-btn" type="button" @click="refreshAgents">
                <AppIcon v-if="agentLoading" name="spinner" spin />
                <AppIcon v-else name="check" />
                {{ t.refresh_agents }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- ── 语言 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.language }}</div>
        <div class="sp-field">
          <div class="sp-language-grid">
            <button
              v-for="lang in LANGUAGES" :key="lang.id"
              class="sp-language-card"
              :class="{ active: settings.language === lang.id }"
              @click="settings.language = lang.id"
            >
              <span class="sp-language-name">{{ lang.name }}</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ── 账户 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.account }}</div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.username }}</label>
          <span class="sp-value">{{ settings.username || '—' }}</span>
        </div>

        <div class="sp-field">
          <label class="sp-label">{{ t.change_password }}</label>
          <div class="sp-password-grid">
            <input
              v-model="passwordForm.current"
              class="sp-input"
              type="password"
              autocomplete="current-password"
              :placeholder="t.current_password"
            />
            <input
              v-model="passwordForm.next"
              class="sp-input"
              type="password"
              autocomplete="new-password"
              :placeholder="t.new_password"
            />
            <input
              v-model="passwordForm.confirm"
              class="sp-input"
              type="password"
              autocomplete="new-password"
              :placeholder="t.confirm_password"
              @keyup.enter="changePassword"
            />
          </div>
          <div class="sp-inline-actions">
            <button class="sp-primary-btn" :disabled="changingPassword || !passwordCanSubmit" @click="changePassword">
              <AppIcon v-if="changingPassword" name="spinner" spin />
              <AppIcon v-else name="check" />
              {{ changingPassword ? t.saving : t.update_password }}
            </button>
            <span v-if="passwordStatus" class="sp-status ok">{{ passwordStatus }}</span>
            <span v-if="passwordError" class="sp-status err">{{ passwordError }}</span>
          </div>
        </div>

        <div class="sp-field">
          <button class="sp-danger-btn" @click="$emit('logout')">{{ t.sign_out }}</button>
        </div>
      </section>

      <!-- ── 重置 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.reset_sec }}</div>
        <div class="sp-field">
          <button class="sp-ghost-btn" @click="onReset">{{ t.reset_btn }}</button>
        </div>
      </section>

    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { settings, UI_STYLES, ICON_STYLES, COLOR_THEMES, FONT_FAMILIES, resetSettings } from '../settings.js';
import { useI18n } from '../i18n.js';
import { api } from '../api/index.js';
import AppIcon from './AppIcon.vue';
import DirectoryPicker from './DirectoryPicker.vue';

const { t } = useI18n();
const emit = defineEmits(['logout']);

const darkThemes  = computed(() => COLOR_THEMES.filter(ct => ct.dark !== false));
const lightThemes = computed(() => COLOR_THEMES.filter(ct => ct.dark === false));

const directoryFields = [
  { key: 'fileBrowserDefaultPath', labelKey: 'file_browser_default_path', fallback: '/' },
  { key: 'shellDefaultCwd', labelKey: 'shell_default_cwd', fallback: '/' },
  { key: 'newConversationDefaultDir', labelKey: 'new_conv_default_dir', fallback: '~' },
];
const agentCommandFields = [
  { id: 'claude', key: 'claudeCommand', name: 'Claude Code', placeholder: 'claude' },
  { id: 'codex', key: 'codexCommand', name: 'Codex', placeholder: 'codex' },
  { id: 'grok', key: 'grokCommand', name: 'Grok', placeholder: 'grok' },
];
const mobileEnterOptions = [
  { value: 'send', labelKey: 'enter_send' },
  { value: 'newline', labelKey: 'enter_newline' },
];

const dirPickerTarget = ref('');
const agentStatuses = ref([]);
const agentLoading = ref(false);
const passwordForm = reactive({ current: '', next: '', confirm: '' });
const changingPassword = ref(false);
const passwordStatus = ref('');
const passwordError = ref('');
let agentTimer = null;
let agentRefreshTimer = null;

const passwordCanSubmit = computed(() =>
  Boolean(passwordForm.current && passwordForm.next.length >= 8 && passwordForm.confirm && passwordForm.next === passwordForm.confirm)
);

const LANGUAGES = [
  { id: 'zh', name: '中文' },
  { id: 'en', name: 'English' },
];

function onReset() {
  if (confirm(t.value.reset_confirm)) resetSettings();
}

function normalizePathSetting(key, fallback) {
  const value = String(settings[key] || '').trim();
  settings[key] = value || fallback;
  if (key === 'fileBrowserDefaultPath') settings.fileBrowserLastPath = '';
}

function normalizeCommandSetting(key) {
  settings[key] = String(settings[key] || '').trim();
}

function changeShellSlots(delta) {
  const current = Number(settings.shellTerminalSlots);
  const normalized = Number.isFinite(current) ? current : 1;
  settings.shellTerminalSlots = Math.min(6, Math.max(1, normalized + delta));
}

function toggleDirPicker(key) {
  dirPickerTarget.value = dirPickerTarget.value === key ? '' : key;
}

function selectDirectory(key, path) {
  settings[key] = path || '/';
  if (key === 'fileBrowserDefaultPath') settings.fileBrowserLastPath = '';
  dirPickerTarget.value = '';
}

const agentStatusMap = computed(() => Object.fromEntries(agentStatuses.value.map(item => [item.id, item])));

function agentStatusClass(id) {
  const status = agentStatusMap.value[id];
  return status?.available ? 'ok' : 'err';
}

function agentStatusLabel(id) {
  const status = agentStatusMap.value[id];
  if (agentLoading.value && !status) return t.value.agent_checking;
  if (!status) return t.value.agent_unknown;
  return status.available
    ? `${t.value.agent_available}: ${status.command || status.source || ''}`
    : t.value.agent_missing;
}

async function refreshAgents() {
  agentLoading.value = true;
  try {
    const list = await api.getAgents();
    agentStatuses.value = Array.isArray(list) ? list : [];
  } catch (_) {
    agentStatuses.value = [];
  } finally {
    agentLoading.value = false;
  }
}

function queueAgentRefresh() {
  clearTimeout(agentRefreshTimer);
  agentRefreshTimer = setTimeout(refreshAgents, 1200);
}

watch(() => [settings.claudeCommand, settings.codexCommand, settings.grokCommand], queueAgentRefresh);

onMounted(() => {
  refreshAgents();
  agentTimer = setInterval(refreshAgents, 15000);
});

onBeforeUnmount(() => {
  clearInterval(agentTimer);
  clearTimeout(agentRefreshTimer);
});

async function changePassword() {
  passwordStatus.value = '';
  passwordError.value = '';
  if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
    passwordError.value = t.value.password_required;
    return;
  }
  if (passwordForm.next !== passwordForm.confirm) {
    passwordError.value = t.value.password_mismatch;
    return;
  }
  if (passwordForm.next.length < 8) {
    passwordError.value = t.value.password_too_short;
    return;
  }
  changingPassword.value = true;
  try {
    await api.changePassword(passwordForm.current, passwordForm.next);
    passwordForm.current = '';
    passwordForm.next = '';
    passwordForm.confirm = '';
    passwordStatus.value = t.value.password_updated;
    setTimeout(() => emit('logout'), 900);
  } catch (err) {
    passwordError.value = err.message || t.value.password_update_failed;
  } finally {
    changingPassword.value = false;
  }
}
</script>

<style scoped>
.sp-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: transparent; overflow: hidden;
}

.sp-header {
  padding: 15px 20px 11px;
  border-bottom: 1px solid var(--hairline);
  flex-shrink: 0;
  background: color-mix(in srgb, var(--panel) 78%, transparent);
  box-shadow: inset 0 -1px 0 color-mix(in srgb, #ffffff 4%, transparent);
}
.sp-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 18px; font-weight: 800;
  color: var(--text);
}

.sp-body {
  flex: 1; overflow-y: auto; padding: 12px 18px 34px;
  display: flex; flex-direction: column; gap: 8px;
  scrollbar-width: thin; scrollbar-color: var(--muted) transparent;
  width: min(1120px, 100%);
  margin: 0 auto;
}

/* ── Section ─────────────────────────────────── */
.sp-section {
  padding: 18px 0 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--hairline) 72%, transparent);
  display: grid;
  grid-template-columns: minmax(128px, 170px) minmax(0, 1fr);
  column-gap: 24px;
  row-gap: 12px;
}
.sp-section:last-child { border-bottom: none; }

.sp-section-title {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 10px; font-weight: 800;
  color: var(--muted); letter-spacing: 2px; text-transform: uppercase;
  margin-bottom: 0;
  padding-top: 3px;
}

.sp-field {
  grid-column: 2;
  margin-bottom: 2px;
}
.sp-field:last-child { margin-bottom: 0; }

.sp-field-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 34px;
  padding: 4px 0;
}

.sp-label {
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text);
  flex-shrink: 0;
}
.sp-value {
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted);
}

/* ── UI Style grid ───────────────────────────── */
.sp-style-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}
.sp-style-card {
  width: 100%;
  min-width: 0;
  background: color-mix(in srgb, var(--panel) 82%, transparent); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 10px 8px 8px;
  cursor: pointer; text-align: left;
  transition: border-color .15s, box-shadow .15s, background .15s, transform .15s;
  display: flex; flex-direction: column; gap: 6px;
}
.sp-style-card:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
  background: color-mix(in srgb, var(--neon) 4%, var(--panel));
  transform: translateY(-1px);
}
.sp-style-card.active {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--neon) 32%, transparent), 0 0 14px var(--glow);
}
.sp-style-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; font-weight: 800;
  color: var(--text);
}
.sp-style-desc {
  font-size: 10px; color: var(--muted); line-height: 1.3;
}

/* UI Style previews */
.sp-style-preview {
  width: 100%;
  min-width: 0;
  border-radius: var(--radius-sm); height: 62px; overflow: hidden;
  display: flex; flex-direction: column;
}
/* Command: 深色控制台 */
.preview-default {
  background: #070A08;
  border: 1px solid #7CFF6B42;
  box-shadow: inset 0 0 0 1px #FFFFFF05;
}
.preview-default .pv-topbar {
  height: 10px; background: #0D1410;
  border-bottom: 1px solid #7CFF6B26;
}
.preview-default .pv-line { height: 3px; background: #7CFF6B80; border-radius: 2px; margin: 5px 7px 0 21px; box-shadow: 0 0 4px #7CFF6B30; }
.preview-default .pv-line.short { width: 45%; }
.preview-default .pv-line.tiny { width: 28%; background: #43D9C880; }

/* Focus: 直角+低装饰 */
.preview-minimal {
  background: #101116;
  border: 1px solid #555B66;
  border-radius: 0 !important;
}
.preview-minimal .pv-topbar {
  height: 10px; background: #151721;
  border-bottom: 1px solid #555B66;
  border-radius: 0;
}
.preview-minimal .pv-line { height: 3px; background: #8A8F9D; border-radius: 0; margin: 5px 7px 0 21px; }
.preview-minimal .pv-line.short { width: 45%; }
.preview-minimal .pv-line.tiny { width: 28%; }

/* Layered: 半透明层级 */
.preview-glass {
  background: #111C16CC;
  border: 1px solid rgba(255,255,255,0.16);
  backdrop-filter: blur(6px);
  border-radius: 8px !important;
  box-shadow: 0 8px 20px #00000040;
}
.preview-glass .pv-topbar {
  height: 10px;
  background: rgba(255,255,255,0.08);
  border-bottom: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px 8px 0 0;
}
.pv-content {
  position: relative;
  flex: 1;
  padding-top: 2px;
}
.pv-rail {
  position: absolute;
  left: 8px;
  top: 8px;
  bottom: 7px;
  width: 5px;
  border-radius: 2px;
  background: color-mix(in srgb, currentColor 18%, transparent);
}
.preview-glass .pv-line { height: 3px; background: rgba(255,255,255,0.32); border-radius: 2px; margin: 5px 7px 0 21px; }
.preview-glass .pv-line.short { width: 45%; }
.preview-glass .pv-line.tiny { width: 28%; }

/* Compact: 高密度小间距 */
.preview-dense {
  background: #0A0D11;
  border: 1px solid #9CA3AF52;
  border-radius: 5px !important;
}
.preview-dense .pv-topbar {
  height: 7px; background: #161B22;
  border-bottom: 1px solid #9CA3AF3A;
}
.preview-dense .pv-line { height: 2px; background: #E5E7EBB8; border-radius: 1px; margin: 4px 6px 0 18px; }
.preview-dense .pv-line.short { width: 56%; }
.preview-dense .pv-line.tiny { width: 36%; background: #A3E635B8; }

/* Studio: 柔和分区 */
.preview-studio {
  background: linear-gradient(135deg, #102033, #111827);
  border: 1px solid rgba(148, 163, 184, .28);
  border-radius: 8px !important;
  box-shadow: inset 0 0 18px rgba(125, 211, 252, .08);
}
.preview-studio .pv-topbar {
  height: 11px; background: rgba(255,255,255,.07);
  border-bottom: 1px solid rgba(148, 163, 184, .18);
}
.preview-studio .pv-line { height: 3px; background: rgba(226,232,240,.48); border-radius: 2px; margin: 6px 8px 0 22px; }
.preview-studio .pv-line.short { width: 48%; }
.preview-studio .pv-line.tiny { width: 30%; background: rgba(34,211,238,.55); }

/* Signal: 高对比 */
.preview-contrast {
  background: #FAFAFA;
  border: 2px solid #111827;
  border-radius: 4px !important;
}
.preview-contrast .pv-topbar {
  height: 10px; background: #111827;
  border-bottom: 0;
}
.preview-contrast .pv-rail { background: #111827; }
.preview-contrast .pv-line { height: 3px; background: #111827; border-radius: 0; margin: 5px 7px 0 21px; }
.preview-contrast .pv-line.short { width: 45%; }
.preview-contrast .pv-line.tiny { width: 28%; background: #1D4ED8; }

/* Cyberpunk: 原始霓虹扫描线 */
.preview-cyberpunk {
  background:
    repeating-linear-gradient(0deg, transparent 0 9px, rgba(124,255,107,.12) 10px),
    linear-gradient(135deg, #050806, #0B1018);
  border: 1px solid #7CFF6B66;
  box-shadow: inset 0 0 12px #7CFF6B18, 0 0 10px #7CFF6B22;
}
.preview-cyberpunk .pv-topbar {
  height: 10px; background: #0D1410;
  border-bottom: 1px solid #43D9C855;
}
.preview-cyberpunk .pv-line { height: 3px; background: #7CFF6BCC; border-radius: 2px; margin: 5px 7px 0 21px; box-shadow: 0 0 5px #7CFF6B55; }
.preview-cyberpunk .pv-line.short { width: 48%; background: #43D9C8CC; }
.preview-cyberpunk .pv-line.tiny { width: 30%; background: #F5D76ECC; }

/* Blueprint: 工程网格 */
.preview-blueprint {
  background:
    linear-gradient(90deg, rgba(125,211,252,.16) 1px, transparent 1px),
    linear-gradient(180deg, rgba(125,211,252,.16) 1px, transparent 1px),
    #071827;
  background-size: 10px 10px;
  border: 1px solid rgba(125,211,252,.55);
  border-radius: 5px !important;
}
.preview-blueprint .pv-topbar {
  height: 9px; background: rgba(125,211,252,.10);
  border-bottom: 1px solid rgba(125,211,252,.35);
}
.preview-blueprint .pv-line { height: 2px; background: rgba(186,230,253,.78); border-radius: 1px; margin: 5px 7px 0 21px; }
.preview-blueprint .pv-line.short { width: 52%; }
.preview-blueprint .pv-line.tiny { width: 34%; background: rgba(34,211,238,.85); }

/* Ink: 纸墨低噪声 */
.preview-ink {
  background: #F8F7F2;
  border: 1px solid #2A241C33;
  border-radius: 8px !important;
}
.preview-ink .pv-topbar {
  height: 10px; background: #ECE7DA;
  border-bottom: 1px solid #2A241C22;
}
.preview-ink .pv-rail { background: #2A241C33; }
.preview-ink .pv-line { height: 3px; background: #2A241C99; border-radius: 2px; margin: 5px 7px 0 21px; }
.preview-ink .pv-line.short { width: 46%; }
.preview-ink .pv-line.tiny { width: 29%; background: #9A341299; }

/* ── Color grid ──────────────────────────────── */
.sp-color-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
}
.sp-color-card {
  display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 8px;
  background: color-mix(in srgb, var(--panel) 82%, transparent); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px; cursor: pointer;
  transition: border-color .15s, box-shadow .15s, background .15s, transform .15s;
  color: var(--text);
}
.sp-color-card:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
  background: color-mix(in srgb, var(--neon) 4%, var(--panel));
  transform: translateY(-1px);
}
.sp-color-card.active {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--neon) 28%, transparent);
}

.sp-color-preview {
  position: relative;
  width: 32px;
  height: 24px;
  border-radius: 5px;
  background: var(--bg);
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #ffffff 5%, transparent);
}
.sp-color-dot {
  position: absolute;
  left: 5px;
  top: 5px;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--neon);
}
.sp-color-pane {
  position: absolute;
  right: 4px;
  top: 5px;
  width: 13px;
  height: 13px;
  border-radius: 3px;
  background: var(--panel2);
  border: 1px solid var(--border);
}
.sp-color-line {
  position: absolute;
  left: 5px;
  bottom: 5px;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: var(--neon2);
}
.sp-theme-group-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 9px; font-weight: 800;
  letter-spacing: 2px; color: var(--muted); text-transform: uppercase;
  margin-bottom: 6px;
}
.sp-icon-preview {
  margin-left: auto; font-size: 14px; flex-shrink: 0;
  color: var(--neon); opacity: .8;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
}
.sp-color-name {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Language grid ───────────────────────────── */
.sp-language-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 160px));
  gap: 8px;
}
.sp-language-card {
  min-width: 0;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 8px 14px;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s, background .15s, transform .15s;
}
.sp-language-card:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
  background: color-mix(in srgb, var(--neon) 4%, var(--panel));
  transform: translateY(-1px);
}
.sp-language-card.active {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--neon) 28%, transparent);
}
.sp-language-name {
  display: block;
  max-width: 100%;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--text);
  line-height: 1;
  white-space: nowrap;
}

/* ── Icon style grid ─────────────────────────── */
.sp-icon-style-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.sp-icon-style-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  background: color-mix(in srgb, var(--panel) 82%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 9px 10px;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s, background .15s, transform .15s;
}
.sp-icon-style-card:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
  background: color-mix(in srgb, var(--neon) 4%, var(--panel));
  transform: translateY(-1px);
}
.sp-icon-style-card.active {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--neon) 28%, transparent);
}
.sp-icon-style-preview {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--neon);
  --app-icon-size: 15px;
}
.sp-icon-style-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.sp-icon-style-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sp-icon-style-desc {
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Select ──────────────────────────────────── */
.sp-select {
  background: var(--input-bg); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  padding: 6px 10px; outline: none; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.sp-select:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 8%, transparent);
}

.sp-input {
  width: 100%;
  background: var(--input-bg); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  padding: 8px 10px; outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.sp-input:focus {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--neon) 8%, transparent);
}
.sp-input::placeholder {
  color: color-mix(in srgb, var(--muted) 65%, transparent);
}
.sp-path-row {
  display: flex; align-items: center; gap: 8px;
  margin-top: 7px;
}
.sp-icon-btn {
  width: 32px; height: 31px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--panel2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--muted);
  cursor: pointer; flex-shrink: 0;
  transition: color .12s, border-color .12s, background .12s;
  line-height: 1; overflow: visible; --app-icon-size: 15px;
}
.sp-icon-btn:hover,
.sp-icon-btn.active {
  color: var(--neon);
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--neon) 8%, transparent);
}
.sp-password-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.sp-inline-actions {
  display: flex; align-items: center; gap: 10px;
  margin-top: 8px; flex-wrap: wrap;
}
.sp-agent-grid {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 8px;
}
.sp-agent-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.sp-agent-name {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  font-weight: 800;
  color: var(--text);
}
.sp-agent-row .sp-status {
  grid-column: 2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp-primary-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  background: color-mix(in srgb, var(--neon) 10%, transparent);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--neon);
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; font-weight: 800;
  padding: 8px 16px; cursor: pointer;
  transition: background .15s, border-color .15s, opacity .15s;
  line-height: 1; overflow: visible; --app-icon-size: 14px;
}
.sp-primary-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--neon) 16%, transparent);
  border-color: var(--border-strong);
}
.sp-primary-btn:disabled {
  opacity: .5; cursor: not-allowed;
}
.sp-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}
.sp-status.ok { color: var(--success); }
.sp-status.err { color: var(--danger); }

/* ── Stepper ─────────────────────────────────── */
.sp-stepper {
  display: flex; align-items: center; gap: 8px;
}
.sp-step-btn {
  width: 26px; height: 26px;
  background: var(--panel2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text); font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .12s, border-color .12s;
  line-height: 1; overflow: visible; --app-icon-size: 13px;
}
.sp-step-btn:hover { background: color-mix(in srgb, var(--neon) 10%, transparent); border-color: var(--border-strong); }
.sp-step-val {
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: var(--text); min-width: 52px; text-align: center;
}

/* ── Radio group ─────────────────────────────── */
.sp-radio-group { display: flex; gap: 12px; }
.sp-radio {
  display: flex; align-items: center; gap: 5px; cursor: pointer;
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text);
}
.sp-radio input { accent-color: var(--neon); width: 13px; height: 13px; }

/* ── Toggle ──────────────────────────────────── */
.sp-toggle { display: flex; align-items: center; cursor: pointer; }
.sp-toggle input { display: none; }
.sp-toggle-track {
  width: 36px; height: 20px; border-radius: 10px;
  background: var(--panel3); border: 1px solid var(--border);
  position: relative; transition: background .2s, border-color .2s, box-shadow .2s;
}
.sp-toggle input:checked + .sp-toggle-track {
  background: color-mix(in srgb, var(--neon) 30%, transparent);
  border-color: var(--border-strong);
  box-shadow: 0 0 12px color-mix(in srgb, var(--neon) 18%, transparent);
}
.sp-toggle-thumb {
  position: absolute; width: 14px; height: 14px; border-radius: 50%;
  background: var(--muted); top: 2px; left: 2px;
  transition: transform .2s, background .2s;
}
.sp-toggle input:checked + .sp-toggle-track .sp-toggle-thumb {
  transform: translateX(16px);
  background: var(--neon);
}

/* ── Buttons ─────────────────────────────────── */
.sp-danger-btn {
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, transparent); border-radius: var(--radius-sm);
  color: var(--danger); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; font-weight: 800;
  padding: 8px 18px; cursor: pointer; transition: background .15s, border-color .15s;
}
.sp-danger-btn:hover { background: color-mix(in srgb, var(--danger) 16%, transparent); border-color: color-mix(in srgb, var(--danger) 52%, transparent); }

.sp-ghost-btn {
  background: none; border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--muted);
  font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px;
  padding: 8px 18px; cursor: pointer; transition: border-color .15s, color .15s;
}
.sp-ghost-btn:hover { border-color: var(--border-strong); color: var(--text); }

@media (max-width: 760px) {
  .sp-header { padding: 14px 16px 10px; }
  .sp-body { padding: 10px 16px 28px; }
  .sp-section {
    display: block;
    padding: 16px 0 14px;
  }
  .sp-section-title { margin-bottom: 14px; padding-top: 0; }
  .sp-field { margin-bottom: 14px; }
  .sp-field-row { min-height: 0; padding: 0; }
  .sp-color-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sp-language-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sp-icon-style-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sp-agent-row { grid-template-columns: 1fr; }
  .sp-agent-row .sp-status { grid-column: auto; }
  .sp-style-grid { grid-template-columns: 1fr; gap: 10px; }
  .sp-style-card { padding: 12px; }
  .sp-style-preview { height: 84px; }
  .sp-password-grid { grid-template-columns: 1fr; }
}

@media (max-width: 520px) {
  .sp-style-grid { grid-template-columns: 1fr; }
  .sp-field-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .sp-select,
  .sp-stepper,
  .sp-radio-group {
    width: 100%;
  }
  .sp-icon-style-grid { grid-template-columns: 1fr; }
  .sp-radio-group { flex-wrap: wrap; }
}
</style>
