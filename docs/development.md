# 开发指南

## 开发环境启动

### 后端（热重载）

```bash
cd server
RC_USER=admin RC_PASS=changeme PORT=3000 node --watch index.js
```

### 前端（Vite dev server）

```bash
cd client
npm run dev
```

Vite dev server 运行在 `http://localhost:5173`，自动代理 API 和 WS 到 `localhost:3000`。

## 项目结构详解

```
remote_cc/
├── server/
│   ├── index.js        # HTTP + WS 入口，路由注册
│   ├── auth.js         # Token 认证中间件
│   ├── pty-manager.js  # PTY 会话池，核心逻辑
│   └── history.js      # ~/.claude/projects/ 读取
│
├── client/
│   ├── index.html      # 入口 HTML
│   ├── vite.config.js  # Vite 配置（dev proxy）
│   └── src/
│       ├── main.js          # Vue app 挂载，主题同步到 html 属性
│       ├── App.vue          # 主组件：认证、路由、WS管理、会话管理
│       ├── router.js        # Hash 路由
│       ├── settings.js      # 全局设置 + 主题/图标定义
│       ├── themes.js        # xterm.js 终端配色方案
│       ├── i18n.js          # 中英文字典
│       ├── api/
│       │   └── index.js     # REST API + WS 工厂
│       └── components/
│           ├── Terminal.vue         # xterm.js 渲染
│           ├── SymbolBar.vue        # 符号快捷键栏
│           ├── ConversationList.vue # 首页会话列表
│           ├── NewConversation.vue  # 新建/恢复对话
│           ├── SettingsPage.vue     # 设置页
│           ├── LogViewer.vue        # 会话日志查看
│           └── HelpPage.vue         # 帮助文档页
│
├── docs/
│   ├── installation.md  # 安装指南
│   ├── usage.md         # 使用手册
│   ├── api.md           # API 文档
│   ├── architecture.md  # 架构说明
│   └── development.md   # 开发指南（本文档）
│
├── rcc         # 本地终端连接工具（Node.js 脚本）
├── rcc-server  # 守护进程管理脚本（bash）
└── README.md
```

## 添加新功能的指导

### 添加新的颜色主题

1. 在 `client/src/themes.js` 添加 xterm 配色：

```js
my_theme: {
  bg: '#1a1a2e',
  term: { background: '#1a1a2e', foreground: '#eee', cursor: '#f00', ... }
}
```

2. 在 `client/src/settings.js` 的 `COLOR_THEMES` 数组添加：

```js
{
  id: 'my_theme',
  name: 'My Theme',
  accent: '#f00',
  dark: true,
  icons: { home: '⌂', settings: '⚙', ... }
}
```

3. 在 `client/src/App.vue` 的全局 CSS 添加 CSS 变量：

```css
[data-theme="my_theme"] {
  --neon: #f00; --neon2: #f80; --bg: #1a1a2e; ...
}
```

### 添加新的 WS 消息类型

1. 在 `server/pty-manager.js` 的 `handleMessage` switch 中添加 case
2. 在 `client/src/App.vue` 的 `connectEntryWS` 的 `ws.onmessage` 中处理
3. 更新 `docs/api.md`

### 添加新的设置项

1. 在 `client/src/settings.js` 的 `DEFAULTS` 中添加字段
2. 在 `client/src/components/SettingsPage.vue` 中添加 UI
3. 在需要响应该设置的组件中 `watch(() => settings.xxx, ...)`
4. 在 `client/src/i18n.js` 中添加翻译

## 构建和发布

```bash
# 构建前端
cd client && npm run build

# 检查产物大小
ls -lh client/dist/assets/

# 运行生产环境
cd server && RC_USER=admin RC_PASS=secret PORT=8310 node index.js
```

## 代码规范

- **Vue 组件**：使用 `<script setup>` + Composition API
- **CSS**：优先使用 CSS 变量（`var(--neon)` 等），跟随主题
- **错误处理**：WS/PTY 操作用 try/catch 包裹，不向用户暴露原始错误
- **命名**：
  - 组件：PascalCase (`ConversationList.vue`)
  - 函数：camelCase (`openSession`)
  - CSS class：kebab-case (`.cl-item`)
  - 事件：kebab-case (`@session-id`)

## 常见问题

### node-pty 编译失败

```bash
npm install --build-from-source node-pty
# 或者
node-gyp rebuild --directory node_modules/node-pty
```

### WS 连接失败（CORS/代理）

开发时确认 `vite.config.js` 的 proxy 配置正确指向后端端口。

### PTY 乱码

确保终端环境变量正确：

```js
env: {
  ...process.env,
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
}
```
