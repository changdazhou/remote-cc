// 国际化文本字典
import { computed } from 'vue';
import { settings } from './settings.js';

const messages = {
  zh: {
    // 登录
    login_title:    '> remote',
    login_sub:      'Remote Claude Code',
    login_user:     '用户名',
    login_pass:     '密码',
    login_btn:      '登 录',
    login_loading:  '登录中...',
    login_error:    '用户名或密码错误',

    // 顶栏
    new_conv:       '新建对话',
    no_sessions:    '暂无活跃会话',
    multi_attached: '个终端已连接',

    // 对话列表
    conversations:  '对话',
    new_btn:        '新建',
    loading:        '连接中...',
    no_conv_title:  '暂无对话',
    no_conv_sub:    '新建一个 Claude Code 会话',
    start_conv:     '开始对话',
    msgs:           '条消息',
    just_now:       '刚刚',
    min_ago:        '分钟前',
    hour_ago:       '小时前',
    day_ago:        '天前',

    // 确认弹窗
    stop_session:   '停止会话',
    stop_confirm:   '将终止进程。',
    delete_session: '删除会话',
    delete_confirm: '将移除会话记录。',
    cancel:         '取消',
    stop_btn:       '停止',
    delete_btn:     '删除',

    // 新建对话
    new_title:      '新建对话',
    new_sub:        '启动一个新的 Claude Code 会话',
    work_dir:       '工作目录',
    sess_name:      '会话名称',
    name_hint:      '留空自动生成',
    start_btn:      '开始对话 ▶',
    resume:         '恢复',
    resume_tab:     '恢复历史',
    new_tab:        '新建',
    no_history:     '未找到历史对话',
    loading_hist:   '加载历史...',
    no_preview:     '（无预览）',

    // 终端
    disconnected:   '已断开 — 正在重连',
    reconnecting:   '秒后重试...',
    exited:         '进程已退出，退出码',
    error_prefix:   '错误：',
    taken_over:     '会话已被其他客户端接管',

    // 日志
    log_refresh:    '↻ 刷新',
    log_empty:      '（空）',

    // 设置
    settings:       '设置',
    appearance:     '外观',
    ui_style:       'UI 风格',
    color_theme:    '颜色主题',
    terminal_sec:   '终端',
    font:           '字体',
    font_size:      '字号',
    line_height:    '行高',
    cursor_style:   '光标样式',
    cursor_blink:   '光标闪烁',
    scrollback:     '回滚行数',
    symbol_bar:     '符号快捷键栏',
    connection:     '连接',
    reconnect_init: '初始重连延迟',
    reconnect_max:  '最大重连延迟',
    language:       '语言',
    account:        '账户',
    username:       '用户名',
    sign_out:       '退出登录',
    reset_sec:      '重置',
    reset_btn:      '恢复默认设置',
    reset_confirm:  '确定要恢复所有设置为默认值吗？',

    // UI 风格名称
    style_default:  '赛博朋克',
    style_default_desc: '发光边框、霓虹色调',
    style_minimal:  '极简',
    style_minimal_desc: '干净线条、无装饰',
    style_glass:    '毛玻璃',
    style_glass_desc: '半透明模糊层次',

    // rcc 工具
    rcc_attach_hint: '分离: 关闭终端或 Ctrl+C（不会终止会话）',
    rcc_detached:    '已分离',
    rcc_tailing:     '追踪日志',
    rcc_tail_hint:   'Ctrl+C 停止',
  },

  en: {
    login_title:    '> remote',
    login_sub:      'Remote Claude Code',
    login_user:     'Username',
    login_pass:     'Password',
    login_btn:      'LOGIN',
    login_loading:  'LOGGING IN...',
    login_error:    'Invalid credentials',

    new_conv:       'New conversation',
    no_sessions:    'No active sessions',
    multi_attached: 'terminals attached',

    conversations:  'Conversations',
    new_btn:        'New',
    loading:        'Connecting...',
    no_conv_title:  'No conversations yet',
    no_conv_sub:    'Start a new Claude Code session',
    start_conv:     'Start conversation',
    msgs:           'msgs',
    just_now:       'just now',
    min_ago:        'm ago',
    hour_ago:       'h ago',
    day_ago:        'd ago',

    stop_session:   'Stop Session',
    stop_confirm:   'The process will be terminated.',
    delete_session: 'Delete Session',
    delete_confirm: 'This will remove the session record.',
    cancel:         'Cancel',
    stop_btn:       'Stop',
    delete_btn:     'Delete',

    new_title:      'New Conversation',
    new_sub:        'Starts a new Claude Code session',
    work_dir:       'Working Directory',
    sess_name:      'Name',
    name_hint:      'auto if empty',
    start_btn:      'Start ▶',
    resume:         'Resume',
    resume_tab:     'Resume',
    new_tab:        'New',
    no_history:     'No history found',
    loading_hist:   'Loading history...',
    no_preview:     '(no preview)',

    disconnected:   'Disconnected — reconnecting in',
    reconnecting:   's...',
    exited:         'Process exited with code',
    error_prefix:   'Error: ',
    taken_over:     'Session taken over by another client',

    log_refresh:    '↻ Refresh',
    log_empty:      '(empty)',

    settings:       'Settings',
    appearance:     'Appearance',
    ui_style:       'UI Style',
    color_theme:    'Color Theme',
    terminal_sec:   'Terminal',
    font:           'Font',
    font_size:      'Font Size',
    line_height:    'Line Height',
    cursor_style:   'Cursor Style',
    cursor_blink:   'Cursor Blink',
    scrollback:     'Scrollback Lines',
    symbol_bar:     'Symbol Bar',
    connection:     'Connection',
    reconnect_init: 'Initial Reconnect Delay',
    reconnect_max:  'Max Reconnect Delay',
    language:       'Language',
    account:        'Account',
    username:       'Username',
    sign_out:       'Sign out',
    reset_sec:      'Reset',
    reset_btn:      'Reset to defaults',
    reset_confirm:  'Reset all settings to defaults?',

    style_default:  'Cyberpunk',
    style_default_desc: 'Neon glow, cyber aesthetic',
    style_minimal:  'Minimal',
    style_minimal_desc: 'Clean lines, no decoration',
    style_glass:    'Glass',
    style_glass_desc: 'Frosted glass, translucent layers',

    rcc_attach_hint: 'Detach: close terminal or Ctrl+C (session stays alive)',
    rcc_detached:    'Detached',
    rcc_tailing:     'Tailing log',
    rcc_tail_hint:   'Ctrl+C to stop',
  },
};

export function useI18n() {
  const t = computed(() => messages[settings.language] || messages.zh);
  return { t };
}

// 直接获取当前语言文本（非响应式，用于非组件场景）
export function t(key) {
  const lang = messages[settings.language] || messages.zh;
  return lang[key] ?? key;
}
