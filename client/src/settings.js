// 全局设置管理
// 所有设置存 localStorage，响应式共享给所有组件

import { reactive, watch } from 'vue';

const STORAGE_KEY = 'rcc_settings';

const DEFAULTS = {
  // ── 外观 ──────────────────────────────────────
  uiStyle:       'default',   // 'default' | 'minimal' | 'glass'
  colorTheme:    'cyber',     // 见 COLOR_THEMES
  topbarHeight:  44,          // px

  // ── 终端 ──────────────────────────────────────
  fontSize:      13,          // px
  fontFamily:    'jetbrains', // 'jetbrains' | 'fira' | 'mono' | 'cascadia'
  lineHeight:    1.3,
  cursorStyle:   'block',     // 'block' | 'underline' | 'bar'
  cursorBlink:   true,
  scrollback:    5000,
  symbolBar:     true,        // 显示符号快捷键栏

  // ── 连接 ──────────────────────────────────────
  reconnectDelay:     1000,   // ms 初始重连延迟
  maxReconnectDelay: 15000,   // ms 最大重连延迟
  wsKeepAlive:       true,    // 控制 WS 保活

  // ── 账户 ──────────────────────────────────────
  username: '',
  language: 'zh',   // 'zh' | 'en'
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULTS };
}

export const settings = reactive(loadSettings());

// 自动持久化
watch(settings, (val) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...val })); } catch (_) {}
}, { deep: true });

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
}

// ── UI Style CSS class 映射 ───────────────────────────────────────────────────
export const UI_STYLES = [
  {
    id:   'default',
    name: 'Cyberpunk',
    desc: '发光边框、霓虹色调、赛博风格',
  },
  {
    id:   'minimal',
    name: 'Minimal',
    desc: '极简线条、无装饰、专注内容',
  },
  {
    id:   'glass',
    name: 'Glass',
    desc: '毛玻璃质感、半透明层次',
  },
];

// ── 颜色主题 ──────────────────────────────────────────────────────────────────
// icons: 每个主题专属图标集，贯穿整个 UI
export const COLOR_THEMES = [
  // ── 深色主题 ──────────────────────────────────
  {
    id: 'cyber', name: 'Cyber', accent: '#00ffd5', dark: true,
    icons: { home: '⌂', settings: '⚙', kill: '⏹', delete: '✕', log: '≡', new: '＋', status_live: '◉', status_dead: '○', spinner: '◌', empty: '⬡', chevron: '▾', attach: '⬡' },
  },
  {
    id: 'mocha', name: 'Mocha', accent: '#cba6f7', dark: true,
    icons: { home: '⌂', settings: '⚙', kill: '▪', delete: '✖', log: '☰', new: '✦', status_live: '●', status_dead: '◌', spinner: '◌', empty: '✿', chevron: '▾', attach: '⬡' },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', accent: '#fabd2f', dark: true,
    icons: { home: '⌂', settings: '⚙', kill: '■', delete: '✗', log: '≡', new: '+', status_live: '◆', status_dead: '◇', spinner: '○', empty: '◇', chevron: '▾', attach: '⬡' },
  },
  {
    id: 'nord', name: 'Nord', accent: '#88c0d0', dark: true,
    icons: { home: '❄', settings: '⚙', kill: '⏹', delete: '✕', log: '≡', new: '＋', status_live: '●', status_dead: '◌', spinner: '◌', empty: '❄', chevron: '▾', attach: '⬡' },
  },
  {
    id: 'dracula', name: 'Dracula', accent: '#ff79c6', dark: true,
    icons: { home: '♦', settings: '⚙', kill: '⏹', delete: '✕', log: '☰', new: '✧', status_live: '♥', status_dead: '♡', spinner: '◌', empty: '♦', chevron: '▾', attach: '⬡' },
  },
  {
    id: 'solarized', name: 'Solarized', accent: '#268bd2', dark: true,
    icons: { home: '⌂', settings: '⚙', kill: '⏹', delete: '✕', log: '≡', new: '＋', status_live: '◉', status_dead: '○', spinner: '◌', empty: '◈', chevron: '▾', attach: '⬡' },
  },

  // ── 浅色主题 ──────────────────────────────────
  {
    id: 'latte', name: 'Latte', accent: '#8839ef', dark: false,
    icons: { home: '⌂', settings: '⚙', kill: '▪', delete: '✖', log: '☰', new: '＋', status_live: '●', status_dead: '◌', spinner: '◌', empty: '✿', chevron: '▾', attach: '⬡' },
  },
  {
    id: 'paper', name: 'Paper', accent: '#1a73e8', dark: false,
    icons: { home: '⌂', settings: '⚙', kill: '□', delete: '×', log: '≡', new: '+', status_live: '■', status_dead: '□', spinner: '○', empty: '○', chevron: '›', attach: '⊕' },
  },
  {
    id: 'day', name: 'Day', accent: '#0969da', dark: false,
    icons: { home: '⌂', settings: '⚙', kill: '⏹', delete: '✕', log: '≡', new: '＋', status_live: '●', status_dead: '○', spinner: '◌', empty: '◌', chevron: '▾', attach: '⬡' },
  },
];

export function getTheme(id) {
  return COLOR_THEMES.find(t => t.id === id) ?? COLOR_THEMES[0];
}

export function getIcons(themeId) {
  return getTheme(themeId).icons;
}

export const FONT_FAMILIES = [
  { id: 'jetbrains', name: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { id: 'fira',      name: 'Fira Code',      value: "'Fira Code', monospace" },
  { id: 'cascadia',  name: 'Cascadia Code',  value: "'Cascadia Code', monospace" },
  { id: 'mono',      name: 'System Mono',    value: "'Courier New', monospace" },
];
