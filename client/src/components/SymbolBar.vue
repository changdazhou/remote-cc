<template>
  <div class="symbol-bar" :class="shellMode ? 'shell-mode' : 'cc-mode'">
    <!-- CC 模式：桌面单排；窄屏时上传/MODE/换行/发送独占第一排 -->
    <div v-if="!shellMode" class="symbol-scroll" :class="{ 'has-prefix': hasPrefixSlot }">
      <slot name="prefix"></slot>
      <button v-for="sym in CC_SYMBOLS" :key="sym.key"
        class="sym-btn"
        :class="`sym-btn--${sym.key}`"
        :title="sym.title || sym.label"
        :aria-label="sym.title || sym.label"
        @click="onTap(sym)"
        @touchstart.prevent="onTouchStart(sym)"
        @touchend.prevent="onTouchEnd(sym)"
      >
        <AppIcon v-if="sym.icon" :name="sym.icon" />
        <span v-else>{{ sym.label }}</span>
      </button>
    </div>

    <!-- Shell 模式：两行移动端专用键位 -->
    <div v-else class="symbol-rows-wrap">
      <div
        v-for="row in SH_ROWS"
        :key="row.key"
        class="symbol-row"
        :class="`symbol-row--${row.key}`"
      >
        <button v-for="sym in row.items" :key="sym.key"
          class="sym-btn"
          :class="[
            `sym-btn--${sym.key}`,
            {
              'sym-btn--modifier': sym.modifier,
              'is-active': sym.modifier && sym.modifier === activeModifier,
            }
          ]"
          :title="sym.title || sym.label"
          :aria-label="sym.title || sym.label"
          @click="onTap(sym)"
          @touchstart.prevent="onTouchStart(sym)"
          @touchend.prevent="onTouchEnd(sym)"
        >{{ sym.label }}</button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="popup.show"
        class="sym-popup-overlay"
        @click="popup.show = false"
        @contextmenu.prevent="popup.show = false"
        @touchmove.prevent
      >
        <div class="sym-popup" @click.stop @touchstart.stop @touchend.stop @contextmenu.prevent>
          <button v-for="v in popup.variants" :key="v.label"
            class="sym-btn sym-btn--variant"
            @click="emit('input', v.value); popup.show = false"
          >{{ v.label }}</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, reactive, useSlots } from 'vue';
import AppIcon from './AppIcon.vue';
import { useI18n } from '../i18n.js';

const props = defineProps({
  currentLine: { type: String, default: '' },
  mode: { type: String, default: 'auto' },
  activeModifier: { type: String, default: '' },
});
const emit = defineEmits(['input', 'modifier']);
const { t } = useI18n();
const slots = useSlots();
const hasPrefixSlot = computed(() => Boolean(slots.prefix));
const activeModifier = computed(() => props.activeModifier);

const shellMode = computed(() => {
  if (props.mode === 'shell') return true;
  if (props.mode === 'cc') return false;
  return props.currentLine.startsWith('!');
});

// ── CC 模式 ──────────────────────────────────────────────────────────────────
const CC_SYMBOLS = computed(() => [
  { key: 'mode',  label: 'MODE', value: '\x1b[Z' },
  { key: 'newline', label: t.value.sb_newline, icon: 'enter', value: '\n', title: t.value.sb_newline_title },
  { key: 'enter', label: t.value.sb_send, icon: 'send', value: '\r', title: t.value.sb_send_title },
  { key: 'esc',   label: 'Esc', value: '\x1b' },
  { key: 'tab',   label: 'Tab', value: '\t' },
  { key: 'slash', label: '/',   value: '/' },
  { key: 'bang',  label: '!',   value: '!' },
  { key: 'up',    label: '↑',   value: '\x1b[A' },
  { key: 'down',  label: '↓',   value: '\x1b[B' },
  { key: 'left',  label: '←',   value: '\x1b[D' },
  { key: 'right', label: '→',   value: '\x1b[C' },
]);

// ── Shell 模式：两行移动端专用键位。修饰键由 Terminal.vue 作用到下一次输入。──
const SH_ROWS = [
  {
    key: 'primary',
    items: [
      { key: 'esc',   label: 'ESC',  value: '\x1b' },
      { key: 'slash', label: '/',    value: '/' },
      { key: 'pipe',  label: '|',    value: '|' },
      { key: 'dash',  label: '-',    value: '-' },
      { key: 'home',  label: 'HOME', value: '\x1b[H', title: 'Home' },
      { key: 'up',    label: '↑',    value: '\x1b[A', title: 'Up' },
      { key: 'end',   label: 'END',  value: '\x1b[F', title: 'End' },
      { key: 'tab',   label: 'TAB',  value: '\t' },
    ],
  },
  {
    key: 'secondary',
    items: [
      { key: 'fn',    label: 'FN',   modifier: 'fn', title: 'Fn' },
      { key: 'ctrl',  label: 'CTRL', modifier: 'ctrl', title: 'Ctrl' },
      { key: 'alt',   label: 'ALT',  modifier: 'alt', title: 'Alt' },
      { key: 'left',  label: '←',    value: '\x1b[D', title: 'Left' },
      { key: 'down',  label: '↓',    value: '\x1b[B', title: 'Down' },
      { key: 'right', label: '→',    value: '\x1b[C', title: 'Right' },
      { key: 'tilde', label: '~',    value: '~' },
    ],
  },
];

const popup = reactive({ show: false, variants: [] });
let longTimer = null;

function onTap(sym) {
  if (sym.modifier) {
    emit('modifier', sym.modifier);
    return;
  }
  if (!sym.variants?.length) emit('input', sym.value);
}

function onTouchStart(sym) {
  if (sym.modifier) {
    emit('modifier', sym.modifier);
    return;
  }
  if (!sym.variants?.length) {
    emit('input', sym.value);
    return;
  }
  longTimer = setTimeout(() => {
    popup.show = true;
    popup.variants = sym.variants;
    longTimer = null;
  }, 350);
}

function onTouchEnd(sym) {
  if (longTimer) {
    clearTimeout(longTimer);
    longTimer = null;
    emit('input', sym.value);
  }
}
</script>

<style scoped>
.symbol-bar {
  --symbol-button-height: 30px;
  flex-shrink: 0;
  background: var(--panel);
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  border-top: 1px solid var(--hairline);
  padding: 6px;
  display: flex;
  align-items: center;
  transition: border-color .2s, background .2s;
  box-shadow: 0 -10px 24px color-mix(in srgb, #000000 18%, transparent);
}
/* Shell 模式：顶部边框用 neon2 */
.symbol-bar.shell-mode {
  border-top-color: var(--border-strong);
  border-top-color: color-mix(in srgb, var(--neon2) 50%, transparent);
}

/* 单排 */
.symbol-scroll {
  display: flex;
  gap: 4px;
  flex: 1;
  align-items: center;
  min-width: 0;
}

/* 终端专用两排容器 */
.symbol-rows-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.symbol-row {
  display: flex;
  gap: 4px;
}

/* 基础按钮：全部跟随主题 */
.sym-btn {
  flex: 1;
  height: var(--symbol-button-height);
  min-height: var(--symbol-button-height);
  background: var(--panel2);
  background: color-mix(in srgb, var(--neon) 6%, var(--panel2));
  border: 1px solid var(--border);
  border-color: color-mix(in srgb, var(--neon) 20%, transparent);
  border-radius: var(--radius-sm);
  color: var(--neon);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 0 2px;
  cursor: pointer;
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  -webkit-user-select: none;
  transition: background .12s, box-shadow .12s, color .15s, border-color .15s, transform .12s;
  touch-action: none;
  min-width: 0;
  white-space: nowrap;
}
.sym-btn:active {
  background: var(--panel3);
  background: color-mix(in srgb, var(--neon) 22%, transparent);
  box-shadow: 0 0 6px var(--glow);
  transform: translateY(1px);
}

/* M 按钮：固定宽，强调色背景 */
.cc-mode .sym-btn--mode {
  flex: 0 0 56px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10px;
  font-weight: 800;
  color: var(--neon);
  background: var(--panel3);
  background: color-mix(in srgb, var(--neon) 14%, transparent);
  border-color: var(--border-strong);
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
}

/* 换行 / 发送：neon2 色区分 */
.cc-mode .sym-btn--newline,
.cc-mode .sym-btn--enter {
  color: var(--neon2);
  border-color: var(--border-strong);
  border-color: color-mix(in srgb, var(--neon2) 25%, transparent);
  background: var(--panel2);
  background: color-mix(in srgb, var(--neon2) 6%, var(--panel2));
  font-weight: 800;
  --app-icon-size: 17px;
}
.cc-mode .sym-btn--newline:active,
.cc-mode .sym-btn--enter:active {
  background: var(--panel3);
  background: color-mix(in srgb, var(--neon2) 20%, transparent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--neon2) 40%, transparent);
}

/* Shell 模式：按钮用 neon2 色系 */
.shell-mode .sym-btn {
  color: var(--neon2);
  border-color: var(--border);
  border-color: color-mix(in srgb, var(--neon2) 22%, transparent);
  background: var(--panel2);
  background: color-mix(in srgb, var(--neon2) 6%, var(--panel2));
  font-weight: 650;
}
.shell-mode .sym-btn:active {
  background: var(--panel3);
  background: color-mix(in srgb, var(--neon2) 20%, transparent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--neon2) 40%, transparent);
}
.shell-mode .sym-btn--modifier {
  color: var(--neon);
  border-color: var(--border-strong);
  border-color: color-mix(in srgb, var(--neon) 28%, transparent);
  background: var(--panel3);
  background:
    linear-gradient(180deg,
      color-mix(in srgb, var(--neon) 12%, transparent),
      color-mix(in srgb, var(--neon) 5%, var(--panel2)));
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
}
.shell-mode .sym-btn--modifier:active,
.shell-mode .sym-btn--modifier.is-active {
  background: var(--panel3);
  background: color-mix(in srgb, var(--neon) 22%, transparent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--neon) 40%, transparent);
}
.shell-mode .sym-btn--home,
.shell-mode .sym-btn--end,
.shell-mode .sym-btn--ctrl {
  font-size: 10px;
}

@media (max-width: 700px) {
  .symbol-bar {
    --symbol-button-height: 29px;
  }
  .symbol-bar.shell-mode {
    padding: 6px;
  }
  .shell-mode .symbol-rows-wrap {
    gap: 5px;
  }
  .shell-mode .symbol-row {
    gap: 4px;
  }
  .shell-mode .sym-btn {
    padding: 0 1px;
  }
  .shell-mode .sym-btn--home,
  .shell-mode .sym-btn--end,
  .shell-mode .sym-btn--ctrl {
    font-size: 10px;
  }
  .cc-mode .symbol-scroll.has-prefix {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    align-items: stretch;
  }
  .cc-mode .symbol-scroll.has-prefix :slotted(*) {
    grid-column: span 4;
    height: var(--symbol-button-height);
    min-height: var(--symbol-button-height);
  }
  .cc-mode .symbol-scroll.has-prefix .sym-btn {
    height: var(--symbol-button-height);
    min-height: var(--symbol-button-height);
  }
  .cc-mode .symbol-scroll.has-prefix .sym-btn--mode {
    grid-column: span 4;
    flex-basis: auto;
  }
  .cc-mode .symbol-scroll.has-prefix .sym-btn:not(.sym-btn--mode):not(.sym-btn--newline):not(.sym-btn--enter) {
    grid-column: span 2;
  }
  .cc-mode .symbol-scroll.has-prefix .sym-btn--newline,
  .cc-mode .symbol-scroll.has-prefix .sym-btn--enter {
    grid-column: span 4;
    font-size: 11px;
  }
}
</style>

<style>
.sym-popup-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: flex-end; justify-content: center;
  padding-bottom: env(safe-area-inset-bottom, 60px);
  background-color: var(--overlay);
  background: var(--overlay);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}
.sym-popup {
  background-color: var(--panel);
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius); display: flex; gap: 6px; padding: 10px;
  box-shadow: var(--shadow), 0 0 30px var(--glow);
  max-width: 90vw; flex-wrap: wrap; justify-content: center;
}
.sym-btn--variant { font-size: 13px; padding: 8px 16px; min-width: 44px; }
</style>
