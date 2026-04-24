<template>
  <div class="symbol-bar" :class="shellMode ? 'shell-mode' : 'cc-mode'">
    <!-- CC 模式：单排 -->
    <div v-if="!shellMode" class="symbol-scroll">
      <button v-for="sym in CC_SYMBOLS" :key="sym.key"
        class="sym-btn"
        @click="onTap(sym)"
        @touchstart.prevent="onTouchStart(sym)"
        @touchend.prevent="onTouchEnd(sym)"
      >{{ sym.label }}</button>
    </div>

    <!-- Shell 模式：两排，无标签 -->
    <div v-else class="symbol-rows-wrap">
      <div class="symbol-row">
        <button v-for="sym in SH_ROW1" :key="sym.key"
          class="sym-btn"
          @click="onTap(sym)"
          @touchstart.prevent="onTouchStart(sym)"
          @touchend.prevent="onTouchEnd(sym)"
        >{{ sym.label }}</button>
      </div>
      <div class="symbol-row">
        <button v-for="sym in SH_ROW2" :key="sym.key"
          class="sym-btn"
          @click="onTap(sym)"
          @touchstart.prevent="onTouchStart(sym)"
          @touchend.prevent="onTouchEnd(sym)"
        >{{ sym.label }}</button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="popup.show" class="sym-popup-overlay" @click="popup.show = false">
        <div class="sym-popup" @click.stop>
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
import { ref, reactive, watch } from 'vue';

const props = defineProps({
  currentLine: { type: String, default: '' },
});
const emit = defineEmits(['input']);

const shellMode = ref(false);

// 自动切换：行首有 ! → Shell；无 ! 或空 → CC
watch(() => props.currentLine, (line) => {
  shellMode.value = line.startsWith('!');
});

// ── CC 模式：不含回车 ─────────────────────────────────────────────────────────
const CC_SYMBOLS = [
  { key: 'mode',  label: 'M',   value: '\x1b[Z' },
  { key: 'esc',   label: 'Esc', value: '\x1b' },
  { key: 'tab',   label: 'Tab', value: '\t' },
  { key: 'slash', label: '/',   value: '/' },
  { key: 'bang',  label: '!',   value: '!' },
  { key: 'up',    label: '↑',   value: '\x1b[A' },
  { key: 'down',  label: '↓',   value: '\x1b[B' },
  { key: 'left',  label: '←',   value: '\x1b[D' },
  { key: 'right', label: '→',   value: '\x1b[C' },
  { key: 'enter', label: '⏎',   value: '\r' },   // 回车放最右
];

// ── Shell 模式：两排，Linux 常用符号 ─────────────────────────────────────────
const SH_ROW1 = [
  { key: 'tab',   label: 'Tab', value: '\t' },
  { key: 'esc',   label: 'Esc', value: '\x1b' },
  { key: 'up',    label: '↑',   value: '\x1b[A' },
  { key: 'down',  label: '↓',   value: '\x1b[B' },
  { key: 'left',  label: '←',   value: '\x1b[D' },
  { key: 'right', label: '→',   value: '\x1b[C' },
  { key: 'enter', label: '⏎',   value: '\r' },
];

const SH_ROW2 = [
  { key: 'slash', label: '/',   value: '/' },
  { key: 'tilde', label: '~',   value: '~' },
  { key: 'dash',  label: '-',   value: '-' },
  { key: 'pipe',  label: '|',   value: '|',  variants: [{ label: '|', value: '|' }, { label: '||', value: '||' }] },
  { key: 'amp',   label: '&',   value: '&',  variants: [{ label: '&', value: '&' }, { label: '&&', value: '&&' }] },
  { key: 'semi',  label: ';',   value: ';' },
  { key: 'gt',    label: '>',   value: '>',  variants: [{ label: '>',  value: '>' }, { label: '>>', value: '>>' }, { label: '2>', value: '2>' }] },
];

const popup = reactive({ show: false, variants: [] });
let longTimer = null;

function onTap(sym) {
  if (!sym.variants?.length) emit('input', sym.value);
}

function onTouchStart(sym) {
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
  flex-shrink: 0;
  background: var(--bg2);
  border-top: 1px solid var(--border);
  padding: 5px 6px;
  display: flex;
  align-items: center;
  transition: border-color .2s, background .2s;
}
/* Shell 模式：顶部边框用 neon2 */
.symbol-bar.shell-mode {
  border-top-color: color-mix(in srgb, var(--neon2) 50%, transparent);
}

/* 单排 */
.symbol-scroll {
  display: flex;
  gap: 4px;
  flex: 1;
  align-items: center;
}

/* Shell 两排容器 */
.symbol-rows-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.symbol-row {
  display: flex;
  gap: 4px;
}

/* 基础按钮：全部跟随主题 */
.sym-btn {
  flex: 1;
  background: color-mix(in srgb, var(--neon) 6%, var(--bg3));
  border: 1px solid color-mix(in srgb, var(--neon) 20%, transparent);
  border-radius: 4px;
  color: var(--neon);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 5px 2px;
  cursor: pointer;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  transition: background .12s, box-shadow .12s, color .15s, border-color .15s;
  touch-action: none;
  min-width: 0;
  white-space: nowrap;
}
.sym-btn:active {
  background: color-mix(in srgb, var(--neon) 22%, transparent);
  box-shadow: 0 0 6px var(--glow);
}

/* M 按钮：固定宽，强调色背景 */
.cc-mode .sym-btn:first-child {
  flex: 0 0 28px;
  font-family: 'Syne', sans-serif;
  font-size: 12px;
  font-weight: 800;
  color: var(--neon);
  background: color-mix(in srgb, var(--neon) 14%, transparent);
  border-color: color-mix(in srgb, var(--neon) 40%, transparent);
}

/* ⏎ 回车：最右侧，neon2 色区分 */
.cc-mode .sym-btn:last-child {
  color: var(--neon2);
  border-color: color-mix(in srgb, var(--neon2) 25%, transparent);
  background: color-mix(in srgb, var(--neon2) 6%, var(--bg3));
}
.cc-mode .sym-btn:last-child:active {
  background: color-mix(in srgb, var(--neon2) 20%, transparent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--neon2) 40%, transparent);
}

/* Shell 模式：按钮用 neon2 色系 */
.shell-mode .sym-btn {
  color: var(--neon2);
  border-color: color-mix(in srgb, var(--neon2) 22%, transparent);
  background: color-mix(in srgb, var(--neon2) 6%, var(--bg3));
}
.shell-mode .sym-btn:active {
  background: color-mix(in srgb, var(--neon2) 20%, transparent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--neon2) 40%, transparent);
}
</style>

<style>
.sym-popup-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: flex-end; justify-content: center;
  padding-bottom: env(safe-area-inset-bottom, 60px);
}
.sym-popup {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 10px; display: flex; gap: 6px; padding: 10px;
  box-shadow: 0 0 30px var(--glow), 0 8px 40px #00000080;
  max-width: 90vw; flex-wrap: wrap; justify-content: center;
}
.sym-btn--variant { font-size: 13px; padding: 8px 16px; min-width: 44px; }
</style>
