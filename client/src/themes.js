// Terminal theme definitions: each theme bundles UI background + full xterm color scheme
export const THEMES = {
  // ── 深色主题 ──────────────────────────────────────────────────────────────
  cyber: {
    bg: '#0d0d0d',
    term: { background:'#0d0d0d', foreground:'#cdd6f4', cursor:'#00ffd5', cursorAccent:'#0d0d0d', black:'#1e1e2e', red:'#f38ba8', green:'#a6e3a1', yellow:'#f9e2af', blue:'#89b4fa', magenta:'#cba6f7', cyan:'#89dceb', white:'#cdd6f4', brightBlack:'#45475a', brightRed:'#f38ba8', brightGreen:'#a6e3a1', brightYellow:'#f9e2af', brightBlue:'#89b4fa', brightMagenta:'#cba6f7', brightCyan:'#89dceb', brightWhite:'#cdd6f4' },
  },
  mocha: {
    bg: '#1e1e2e',
    term: { background:'#1e1e2e', foreground:'#cdd6f4', cursor:'#cba6f7', cursorAccent:'#1e1e2e', black:'#45475a', red:'#f38ba8', green:'#a6e3a1', yellow:'#f9e2af', blue:'#89b4fa', magenta:'#cba6f7', cyan:'#89dceb', white:'#bac2de', brightBlack:'#585b70', brightRed:'#f38ba8', brightGreen:'#a6e3a1', brightYellow:'#f9e2af', brightBlue:'#89b4fa', brightMagenta:'#cba6f7', brightCyan:'#89dceb', brightWhite:'#a6adc8' },
  },
  gruvbox: {
    bg: '#282828',
    term: { background:'#282828', foreground:'#ebdbb2', cursor:'#fabd2f', cursorAccent:'#282828', black:'#282828', red:'#cc241d', green:'#98971a', yellow:'#d79921', blue:'#458588', magenta:'#b16286', cyan:'#689d6a', white:'#a89984', brightBlack:'#928374', brightRed:'#fb4934', brightGreen:'#b8bb26', brightYellow:'#fabd2f', brightBlue:'#83a598', brightMagenta:'#d3869b', brightCyan:'#8ec07c', brightWhite:'#ebdbb2' },
  },
  nord: {
    bg: '#2e3440',
    term: { background:'#2e3440', foreground:'#d8dee9', cursor:'#88c0d0', cursorAccent:'#2e3440', black:'#3b4252', red:'#bf616a', green:'#a3be8c', yellow:'#ebcb8b', blue:'#81a1c1', magenta:'#b48ead', cyan:'#88c0d0', white:'#e5e9f0', brightBlack:'#4c566a', brightRed:'#bf616a', brightGreen:'#a3be8c', brightYellow:'#ebcb8b', brightBlue:'#81a1c1', brightMagenta:'#b48ead', brightCyan:'#8fbcbb', brightWhite:'#eceff4' },
  },
  dracula: {
    bg: '#282a36',
    term: { background:'#282a36', foreground:'#f8f8f2', cursor:'#ff79c6', cursorAccent:'#282a36', black:'#21222c', red:'#ff5555', green:'#50fa7b', yellow:'#f1fa8c', blue:'#bd93f9', magenta:'#ff79c6', cyan:'#8be9fd', white:'#f8f8f2', brightBlack:'#6272a4', brightRed:'#ff6e6e', brightGreen:'#69ff94', brightYellow:'#ffffa5', brightBlue:'#d6acff', brightMagenta:'#ff92df', brightCyan:'#a4ffff', brightWhite:'#ffffff' },
  },
  solarized: {
    bg: '#002b36',
    term: { background:'#002b36', foreground:'#839496', cursor:'#268bd2', cursorAccent:'#002b36', black:'#073642', red:'#dc322f', green:'#859900', yellow:'#b58900', blue:'#268bd2', magenta:'#d33682', cyan:'#2aa198', white:'#eee8d5', brightBlack:'#002b36', brightRed:'#cb4b16', brightGreen:'#586e75', brightYellow:'#657b83', brightBlue:'#839496', brightMagenta:'#6c71c4', brightCyan:'#93a1a1', brightWhite:'#fdf6e3' },
  },

  // ── 浅色主题 ──────────────────────────────────────────────────────────────
  // Latte: Catppuccin Latte，奶咖暖色调
  latte: {
    bg: '#eff1f5',
    term: { background:'#eff1f5', foreground:'#4c4f69', cursor:'#8839ef', cursorAccent:'#eff1f5', black:'#5c5f77', red:'#d20f39', green:'#40a02b', yellow:'#df8e1d', blue:'#1e66f5', magenta:'#8839ef', cyan:'#179299', white:'#acb0be', brightBlack:'#6c6f85', brightRed:'#d20f39', brightGreen:'#40a02b', brightYellow:'#df8e1d', brightBlue:'#1e66f5', brightMagenta:'#8839ef', brightCyan:'#179299', brightWhite:'#bcc0cc' },
  },
  // Paper: 纸白极简，黑白为主
  paper: {
    bg: '#fafafa',
    term: { background:'#fafafa', foreground:'#24292e', cursor:'#1a73e8', cursorAccent:'#fafafa', black:'#24292e', red:'#d73a49', green:'#28a745', yellow:'#e36209', blue:'#0366d6', magenta:'#6f42c1', cyan:'#0598bc', white:'#6a737d', brightBlack:'#959da5', brightRed:'#cb2431', brightGreen:'#22863a', brightYellow:'#b08800', brightBlue:'#005cc5', brightMagenta:'#5a32a3', brightCyan:'#3192aa', brightWhite:'#d1d5da' },
  },
  // Day: 亮白高对比，GitHub/VSCode Light 风格
  day: {
    bg: '#ffffff',
    term: { background:'#ffffff', foreground:'#1f2328', cursor:'#0969da', cursorAccent:'#ffffff', black:'#24292f', red:'#cf222e', green:'#116329', yellow:'#4d2d00', blue:'#0969da', magenta:'#8250df', cyan:'#0a3069', white:'#6e7781', brightBlack:'#57606a', brightRed:'#a40e26', brightGreen:'#1a7f37', brightYellow:'#633c01', brightBlue:'#218bff', brightMagenta:'#a475f9', brightCyan:'#3c6cce', brightWhite:'#8c959f' },
  },
};
