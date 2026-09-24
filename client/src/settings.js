// 全局设置管理
// 所有设置存 localStorage，响应式共享给所有组件

import { reactive, watch } from 'vue';

const STORAGE_KEY = 'rcc_settings';
const META_KEY = 'rcc_settings_meta';
const MOBILE_KEYBOARD_ENTER_VALUES = new Set(['send', 'newline']);
let localPersistStampOverride = '';

export const DEFAULTS = {
  // ── 外观 ──────────────────────────────────────
  uiStyle:       'studio',    // 见 UI_STYLES
  colorTheme:    'aurora',    // 见 COLOR_THEMES
  iconStyle:     'sharp',     // 见 ICON_STYLES
  topbarHeight:  44,          // px

  // ── 终端 ──────────────────────────────────────
  fontSize:      13,          // px
  fontFamily:    'meslolgm',  // 见 FONT_FAMILIES
  lineHeight:    1.0,
  cursorStyle:   'block',     // 'block' | 'underline' | 'bar'
  cursorBlink:   true,
  scrollback:    5000,
  symbolBar:     true,        // 显示符号快捷键栏
  mobileKeyboardEnter: 'send', // 'send' | 'newline'
  shellTerminalSlots: 1,       // Web 终端槽位数

  // ── 连接 ──────────────────────────────────────
  reconnectDelay:     1000,   // ms 初始重连延迟
  maxReconnectDelay: 15000,   // ms 最大重连延迟
  wsKeepAlive:       true,    // 控制 WS 保活

  // ── 远程控制 ──────────────────────────────────
  fileBrowserDefaultPath: '/', // 文件管理器默认目录
  fileBrowserLastPath: '',     // 文件管理器最后访问目录
  shellDefaultCwd: '/',        // 终端默认目录
  newConversationDefaultDir: '~', // 新建会话默认目录
  claudeCommand: '',           // 自定义 Claude 协议命令
  codexCommand: '',            // 自定义 Codex 协议命令
  grokCommand: '',             // 自定义 Grok 协议命令

  // ── 账户 ──────────────────────────────────────
  username: '',
  language: 'zh',   // 'zh' | 'en'
};

function normalizeSettingsRecord(source = {}) {
  const next = { ...DEFAULTS, ...source };
  if (!MOBILE_KEYBOARD_ENTER_VALUES.has(next.mobileKeyboardEnter)) {
    next.mobileKeyboardEnter = DEFAULTS.mobileKeyboardEnter;
  }
  return next;
}

function writeSettingsMeta(updatedAt = new Date().toISOString()) {
  try { localStorage.setItem(META_KEY, JSON.stringify({ updatedAt })); } catch (_) {}
}

function persistLocalSettings(val, updatedAt = new Date().toISOString()) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...val }));
    writeSettingsMeta(updatedAt);
  } catch (_) {}
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      if (!getLocalSettingsUpdatedAt()) writeSettingsMeta();
      return normalizeSettingsRecord(JSON.parse(raw));
    }
  } catch (_) {}
  return normalizeSettingsRecord();
}

export const settings = reactive(loadSettings());

// 自动持久化
watch(settings, (val) => {
  persistLocalSettings(val, localPersistStampOverride || new Date().toISOString());
}, { deep: true });

export function resetSettings() {
  Object.assign(settings, normalizeSettingsRecord(DEFAULTS));
}

export function snapshotSettings() {
  return { ...settings };
}

export function applySettings(nextSettings, options = {}) {
  if (!nextSettings || typeof nextSettings !== 'object') return;
  if (typeof options.updatedAt === 'string') {
    localPersistStampOverride = options.updatedAt;
    setTimeout(() => { localPersistStampOverride = ''; }, 0);
  }
  Object.assign(settings, normalizeSettingsRecord(nextSettings));
}

export function getLocalSettingsUpdatedAt() {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return typeof meta.updatedAt === 'string' ? meta.updatedAt : '';
  } catch (_) {
    return '';
  }
}

export function markSettingsSynced(updatedAt) {
  writeSettingsMeta(updatedAt || new Date().toISOString());
}

// ── UI Style CSS class 映射 ───────────────────────────────────────────────────
export const UI_STYLES = [
  {
    id:   'default',
    name: 'Command',
    desc: '深色控制台、清晰层级、细边线',
  },
  {
    id:   'minimal',
    name: 'Focus',
    desc: '低装饰、高密度、适合长时间操作',
  },
  {
    id:   'glass',
    name: 'Layered',
    desc: '半透明面板、柔和阴影、更多空间感',
  },
  {
    id:   'dense',
    name: 'Compact',
    desc: '高信息密度、收紧间距、适合高频操作',
  },
  {
    id:   'studio',
    name: 'Studio',
    desc: '柔和分区、低噪声、适合长时间查看',
  },
  {
    id:   'contrast',
    name: 'Signal',
    desc: '高对比边界、强焦点态、弱化装饰',
  },
  {
    id:   'cyberpunk',
    name: 'Cyberpunk',
    desc: '保留原始霓虹网格、扫描线和强发光',
  },
  {
    id:   'blueprint',
    name: 'Blueprint',
    desc: '工程蓝图感、细网格、冷静扫描',
  },
  {
    id:   'ink',
    name: 'Ink',
    desc: '低饱和纸墨界面、弱阴影、清晰阅读',
  },
];

export const ICON_STYLES = [
  {
    id: 'line',
    name: 'Lucide',
    desc: '默认线性图标，清晰均衡',
  },
  {
    id: 'round',
    name: 'Tabler',
    desc: '圆角轮廓和柔和几何形态',
  },
  {
    id: 'sharp',
    name: 'Material',
    desc: '直角折线和硬朗模块形态',
  },
  {
    id: 'bold',
    name: 'Hero',
    desc: '实心块面和高识别剪影',
  },
  {
    id: 'duo',
    name: 'Phosphor',
    desc: '轮廓叠加半填充层次',
  },
  {
    id: 'mono',
    name: 'Nerd',
    desc: '终端字形感的极简符号',
  },
];

// ── 颜色主题 ──────────────────────────────────────────────────────────────────
// icons 保留为兼容字段；界面实际使用 AppIcon 统一渲染。
const ICON_NAMES = {
  home: 'home', settings: 'settings', kill: 'stop', delete: 'trash',
  log: 'log', new: 'plus', status_live: 'status-live', status_dead: 'status-dead',
  spinner: 'spinner', empty: 'empty', chevron: 'chevron', attach: 'users',
  files: 'folder',
};

export const COLOR_THEMES = [
  // ── 深色主题 ──────────────────────────────────
  {
    id: 'cyber', name: 'Cyber', accent: '#7CFF6B', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'mocha', name: 'Graphite', accent: '#C4B5FD', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'gruvbox', name: 'Warp', accent: '#FFB86B', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'nord', name: 'Fjord', accent: '#7DD3FC', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'dracula', name: 'Ray', accent: '#FF6BAA', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'solarized', name: 'Harbor', accent: '#2DD4BF', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'carbon', name: 'Carbon', accent: '#DDE3EA', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'ember', name: 'Ember', accent: '#FF7A3D', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'aurora', name: 'Aurora', accent: '#22D3EE', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'orchid', name: 'Orchid', accent: '#D946EF', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'matrix', name: 'Matrix', accent: '#00FF87', dark: true,
    icons: ICON_NAMES,
  },
  {
    id: 'neon', name: 'Neon', accent: '#00E5FF', dark: true,
    icons: ICON_NAMES,
  },

  // ── 浅色主题 ──────────────────────────────────
  {
    id: 'latte', name: 'Canvas', accent: '#6D5EF6', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'paper', name: 'Ledger', accent: '#0E7490', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'day', name: 'Daybreak', accent: '#2563EB', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'mist', name: 'Mist', accent: '#0891B2', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'sage', name: 'Sage', accent: '#2F855A', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'pearl', name: 'Pearl', accent: '#C026D3', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'contrast', name: 'Contrast', accent: '#111827', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'ivory', name: 'Ivory', accent: '#9A3412', dark: false,
    icons: ICON_NAMES,
  },
  {
    id: 'skyline', name: 'Skyline', accent: '#0369A1', dark: false,
    icons: ICON_NAMES,
  },
];

export function getTheme(id) {
  return COLOR_THEMES.find(t => t.id === id) ?? COLOR_THEMES[0];
}

export function getIcons(themeId) {
  return getTheme(themeId).icons;
}

export const FONT_FAMILIES = [
  { id: 'meslolgs',   name: 'MesloLGS NF (Small)',  value: "'RemoteCC MesloLGS NF', 'MesloLGS NF', 'MesloLGS Nerd Font', 'MesloLGS Nerd Font Mono', monospace" },
  { id: 'meslolgm',   name: 'MesloLGM NF (Medium)', value: "'RemoteCC MesloLGM NF', 'MesloLGM NF', 'MesloLGM Nerd Font', 'RemoteCC MesloLGL NF', 'MesloLGL NF', monospace" },
  { id: 'meslolgl',   name: 'MesloLGL NF (Large)',  value: "'RemoteCC MesloLGL NF', 'MesloLGL NF', 'MesloLGL Nerd Font', 'MesloLGS NF', monospace" },
  { id: 'jetbrains',  name: 'JetBrains Mono',   value: "'JetBrains Mono', monospace" },
  { id: 'fira',       name: 'Fira Code',        value: "'Fira Code', monospace" },
  { id: 'cascadia',   name: 'Cascadia Code',    value: "'Cascadia Code', monospace" },
  { id: 'mono',       name: 'System Mono',      value: "'Courier New', monospace" },
];
