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
                  <div class="pv-line"></div>
                  <div class="pv-line short"></div>
                  <div class="pv-line"></div>
                </div>
              </div>
              <div class="sp-style-name">{{ t[`style_${s.id}`] || s.name }}</div>
              <div class="sp-style-desc">{{ t[`style_${s.id}_desc`] || s.desc }}</div>
            </button>
          </div>
        </div>

        <!-- 颜色主题 -->
        <div class="sp-field">
          <label class="sp-label">{{ t.color_theme }}</label>
          <!-- 深色主题 -->
          <div class="sp-theme-group-label">深色</div>
          <div class="sp-color-grid">
            <button
              v-for="ct in darkThemes" :key="ct.id"
              class="sp-color-card"
              :class="{ active: settings.colorTheme === ct.id }"
              @click="settings.colorTheme = ct.id"
            >
              <span class="sp-color-dot" :style="{ background: ct.accent }"></span>
              <span class="sp-color-name">{{ ct.name }}</span>
              <span class="sp-icon-preview">{{ ct.icons.settings }}</span>
            </button>
          </div>
          <!-- 浅色主题 -->
          <div class="sp-theme-group-label" style="margin-top:10px">浅色</div>
          <div class="sp-color-grid">
            <button
              v-for="ct in lightThemes" :key="ct.id"
              class="sp-color-card sp-color-card-light"
              :class="{ active: settings.colorTheme === ct.id }"
              @click="settings.colorTheme = ct.id"
            >
              <span class="sp-color-dot" :style="{ background: ct.accent }"></span>
              <span class="sp-color-name" style="color:#333">{{ ct.name }}</span>
              <span class="sp-icon-preview" :style="{ color: ct.accent }">{{ ct.icons.settings }}</span>
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
            <button class="sp-step-btn" @click="settings.fontSize = Math.max(8, settings.fontSize - 1)">−</button>
            <span class="sp-step-val">{{ settings.fontSize }}px</span>
            <button class="sp-step-btn" @click="settings.fontSize = Math.min(24, settings.fontSize + 1)">＋</button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.line_height }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.lineHeight = Math.max(1.0, +(settings.lineHeight - 0.1).toFixed(1))">−</button>
            <span class="sp-step-val">{{ settings.lineHeight.toFixed(1) }}</span>
            <button class="sp-step-btn" @click="settings.lineHeight = Math.min(2.0, +(settings.lineHeight + 0.1).toFixed(1))">＋</button>
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
            <button class="sp-step-btn" @click="settings.scrollback = Math.max(500, settings.scrollback - 500)">−</button>
            <span class="sp-step-val">{{ settings.scrollback.toLocaleString() }}</span>
            <button class="sp-step-btn" @click="settings.scrollback = Math.min(50000, settings.scrollback + 500)">＋</button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.symbol_bar }}</label>
          <label class="sp-toggle">
            <input type="checkbox" v-model="settings.symbolBar" />
            <span class="sp-toggle-track"><span class="sp-toggle-thumb"></span></span>
          </label>
        </div>
      </section>

      <!-- ── 连接 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.connection }}</div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.reconnect_init }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.reconnectDelay = Math.max(500, settings.reconnectDelay - 500)">−</button>
            <span class="sp-step-val">{{ settings.reconnectDelay / 1000 }}s</span>
            <button class="sp-step-btn" @click="settings.reconnectDelay = Math.min(10000, settings.reconnectDelay + 500)">＋</button>
          </div>
        </div>

        <div class="sp-field sp-field-row">
          <label class="sp-label">{{ t.reconnect_max }}</label>
          <div class="sp-stepper">
            <button class="sp-step-btn" @click="settings.maxReconnectDelay = Math.max(5000, settings.maxReconnectDelay - 5000)">−</button>
            <span class="sp-step-val">{{ settings.maxReconnectDelay / 1000 }}s</span>
            <button class="sp-step-btn" @click="settings.maxReconnectDelay = Math.min(60000, settings.maxReconnectDelay + 5000)">＋</button>
          </div>
        </div>
      </section>

      <!-- ── 语言 ─────────────────────────────────────────────── -->
      <section class="sp-section">
        <div class="sp-section-title">{{ t.language }}</div>
        <div class="sp-field">
          <div class="sp-color-grid">
            <button
              v-for="lang in LANGUAGES" :key="lang.id"
              class="sp-color-card"
              :class="{ active: settings.language === lang.id }"
              @click="settings.language = lang.id"
            >
              <span class="sp-color-name">{{ lang.name }}</span>
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
import { computed } from 'vue';
import { settings, UI_STYLES, COLOR_THEMES, FONT_FAMILIES, resetSettings } from '../settings.js';
import { useI18n } from '../i18n.js';

const { t } = useI18n();
const emit = defineEmits(['logout']);

const darkThemes  = computed(() => COLOR_THEMES.filter(ct => ct.dark !== false));
const lightThemes = computed(() => COLOR_THEMES.filter(ct => ct.dark === false));

const LANGUAGES = [
  { id: 'zh', name: '中文' },
  { id: 'en', name: 'English' },
];

function onReset() {
  if (confirm(t.value.reset_confirm)) resetSettings();
}
</script>

<style scoped>
.sp-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--bg); overflow: hidden;
}

.sp-header {
  padding: 16px 20px 10px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sp-title {
  font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 800;
  color: var(--text); letter-spacing: 0.5px;
}

.sp-body {
  flex: 1; overflow-y: auto; padding: 8px 16px 32px;
  display: flex; flex-direction: column; gap: 4px;
  scrollbar-width: thin; scrollbar-color: var(--muted) transparent;
}

/* ── Section ─────────────────────────────────── */
.sp-section {
  padding: 16px 0 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}
.sp-section:last-child { border-bottom: none; }

.sp-section-title {
  font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700;
  color: var(--muted); letter-spacing: 2px; text-transform: uppercase;
  margin-bottom: 14px;
}

.sp-field { margin-bottom: 14px; }
.sp-field:last-child { margin-bottom: 0; }

.sp-field-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
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
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 10px; padding: 10px 8px 8px;
  cursor: pointer; text-align: left;
  transition: border-color .15s, box-shadow .15s;
  display: flex; flex-direction: column; gap: 6px;
}
.sp-style-card:hover {
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
}
.sp-style-card.active {
  border-color: var(--neon);
  box-shadow: 0 0 0 1px var(--neon), 0 0 12px var(--glow);
}
.sp-style-name {
  font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700;
  color: var(--text);
}
.sp-style-desc {
  font-size: 10px; color: var(--muted); line-height: 1.3;
}

/* UI Style previews */
.sp-style-preview {
  border-radius: 6px; height: 60px; overflow: hidden;
  display: flex; flex-direction: column;
}
/* Cyber: 霓虹发光 */
.preview-default {
  background: #0d0d0d;
  border: 1px solid #00ffd540;
  box-shadow: 0 0 10px #00ffd520, inset 0 0 10px #00ffd508;
}
.preview-default .pv-topbar {
  height: 9px; background: #111318;
  border-bottom: 1px solid #00ffd530;
  box-shadow: 0 1px 6px #00ffd520;
}
.preview-default .pv-line { height: 2px; background: #00ffd560; border-radius: 1px; margin: 3px 5px; box-shadow: 0 0 4px #00ffd540; }
.preview-default .pv-line.short { width: 45%; }

/* Minimal: 直角+无装饰 */
.preview-minimal {
  background: #1c1c1c;
  border: 1px solid #444;
  border-radius: 0 !important;
}
.preview-minimal .pv-topbar {
  height: 9px; background: #252525;
  border-bottom: 1px solid #444;
  border-radius: 0;
}
.preview-minimal .pv-line { height: 2px; background: #777; border-radius: 0; margin: 3px 5px; }
.preview-minimal .pv-line.short { width: 45%; }

/* Glass: 模糊+渐变 */
.preview-glass {
  background: linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
  border: 1px solid rgba(255,255,255,0.18);
  backdrop-filter: blur(6px);
  border-radius: 10px !important;
}
.preview-glass .pv-topbar {
  height: 9px;
  background: rgba(255,255,255,0.1);
  border-bottom: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px 10px 0 0;
}
.preview-glass .pv-line { height: 2px; background: rgba(255,255,255,0.3); border-radius: 2px; margin: 3px 5px; }
.preview-glass .pv-line.short { width: 45%; }

/* ── Color grid ──────────────────────────────── */
.sp-color-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
}
.sp-color-card {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 7px; padding: 8px 10px; cursor: pointer;
  transition: border-color .15s, box-shadow .15s;
}
.sp-color-card:hover { border-color: color-mix(in srgb, var(--neon) 40%, transparent); }
.sp-color-card.active {
  border-color: var(--neon);
  box-shadow: 0 0 0 1px var(--neon);
}
/* 浅色主题卡片：白底 */
.sp-color-card-light {
  background: #f5f5f5 !important;
  border-color: #ddd !important;
}
.sp-color-card-light:hover { border-color: #aaa !important; }
.sp-color-card-light.active { border-color: #666 !important; box-shadow: 0 0 0 1px #666 !important; }

.sp-color-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.sp-theme-group-label {
  font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700;
  letter-spacing: 2px; color: var(--muted); text-transform: uppercase;
  margin-bottom: 6px;
}
.sp-icon-preview {
  margin-left: auto; font-size: 14px; flex-shrink: 0;
  color: var(--neon); opacity: .8;
}
.sp-color-name {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text);
}

/* ── Select ──────────────────────────────────── */
.sp-select {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text);
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  padding: 6px 10px; outline: none; cursor: pointer;
  transition: border-color .15s;
}
.sp-select:focus { border-color: var(--neon); }

/* ── Stepper ─────────────────────────────────── */
.sp-stepper {
  display: flex; align-items: center; gap: 8px;
}
.sp-step-btn {
  width: 26px; height: 26px;
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 5px; color: var(--text); font-size: 14px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .12s, border-color .12s;
}
.sp-step-btn:hover { background: color-mix(in srgb, var(--neon) 10%, transparent); border-color: var(--neon); }
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
  background: var(--bg3); border: 1px solid var(--border);
  position: relative; transition: background .2s, border-color .2s;
}
.sp-toggle input:checked + .sp-toggle-track {
  background: color-mix(in srgb, var(--neon) 30%, transparent);
  border-color: var(--neon);
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
  background: color-mix(in srgb, #f38ba8 8%, transparent);
  border: 1px solid #f38ba840; border-radius: 7px;
  color: #f38ba8; font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700;
  padding: 8px 18px; cursor: pointer; transition: background .15s;
}
.sp-danger-btn:hover { background: color-mix(in srgb, #f38ba8 16%, transparent); }

.sp-ghost-btn {
  background: none; border: 1px solid var(--border);
  border-radius: 7px; color: var(--muted);
  font-family: 'Syne', sans-serif; font-size: 12px;
  padding: 8px 18px; cursor: pointer; transition: border-color .15s, color .15s;
}
.sp-ghost-btn:hover { border-color: var(--neon); color: var(--text); }
</style>
