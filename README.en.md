# RemoteCC — Use Claude Code / Codex from Anywhere

[中文](README.md) | English

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  RemoteCC
```

> **This tool was built with the help of Claude Code, and is still actively being improved. Bug reports and suggestions are very welcome — please open an [Issue](https://github.com/changdazhou/remote-cc/issues).**

---

## What is this?

**Access Claude Code and Codex from your phone, tablet, or any browser — all in real time.**

Claude Code and Codex are powerful AI coding assistants that run in your terminal — but only locally. RemoteCC breaks that limitation. Your agent session can be accessed simultaneously from a phone browser, a tablet, and a local terminal, with **all clients sharing the same PTY process in real time**.

This is not screenshots or log forwarding. It is **true bidirectional real-time sync** — type on your phone and the desktop sees it instantly; run something in the terminal and your phone shows the output right away. Disconnect any client at any time, and the agent keeps working in the background. Reconnect whenever you want, seamlessly.

---

## Key Features

- **Real terminal** — full color, interactive, and mouse support, just like using it locally
- **Real-time multi-client sync** — phone, tablet, and desktop all share the same agent session
- **HTTP fallback transport** — when a proxy or access gateway blocks WebSocket, Home, Agent terminals, and shared terminals automatically fall back to HTTP
- **Persistent sessions** — close the browser or drop SSH, the agent keeps running; reconnect anytime
- **History resume** — reads Claude Code / Codex / Grok history and resumes conversations in the right working directory
- **Launch args passthrough** — add args such as `--model xxx` when starting or resuming a session; they are passed to the agent CLI as-is
- **Directory-based task creation** — choose the working directory from the server directory tree
- **File browser** — browse server files in the web UI, preview code/images, copy paths
- **Session manager** — run `remotecc` on the server to get a visual menu for managing sessions
- **Detach shortcut** — `Ctrl+]` goes back to the menu without killing the agent
- **Mobile-optimized** — responsive UI, comfortable to use on a phone
- **Customizable appearance** — 9 UI styles, dark/light color themes, and multiple icon styles; defaults to Studio + Aurora + Material

---

## Upload Files / Images to Agent

The web terminal supports three ways to pass files to Claude Code or Codex:

| Method | How |
|--------|-----|
| Click to select | On mobile, tap the upload button in the terminal shortcut bar and choose any file or image |
| Drag & drop | Drag files directly onto the terminal area |
| Paste image | Screenshot then Ctrl+V (auto-uploads) |

Files are stored to `~/.rcc/uploads/` on the server, and the path is automatically typed at the terminal cursor — just press Enter or continue your agent command.

---

## File Browser

Click the folder icon in the top bar to open the file browser. It opens at the server root directory `/` by default.

| Action | Description |
|--------|-------------|
| Single-click a file | Preview on the right (code with line numbers, images inline) |
| Double-click a file | Full-screen view — easier to read on mobile |
| Double-click a folder | Navigate into it |
| New folder button | Create a subdirectory in the current directory |
| Copy path button | Copy the absolute path of the file or folder |
| Upload / download buttons | Upload into the current directory / download files |
| Drag files | Drop files onto the file browser to upload them into the current directory |
| Path input box | Type a path directly and press Enter to jump there |

The settings page can configure the file browser default path, terminal cwd, new-session default directory, and Web login password.

Supported preview types: `.md` `.txt` `.py` `.js` `.ts` `.json` `.sh` `.yaml` and other code/text files, plus common image formats (`png` `jpg` `gif` `webp`).

---

## Shared Terminal

Click the terminal icon in the top bar to open the shared terminal. It does not enter the RemoteCC agent session list, but it is kept as one foreground terminal session: browser disconnects or refreshes do not kill it, reopening the page replays recent output, and multiple Web clients attach to the same terminal. It prefers `zsh`, then `fish`, `bash`, and `sh`; set `RCC_SHELL` or `REMOTECC_SHELL` to override it.

---

## How Real-Time Sync Works

```
               You have three windows open
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
  Phone browser     Desktop browser    Local terminal
 (WS/HTTP fallback) (WS/HTTP fallback) (Unix Socket)
       │                  │                  │
       └───────┬──────────┘                  │
               ▼                             │
         PTY Manager  ◀───────────────────────┘
               │
               ▼
        agent process (always running)
```

**Any client input → PTY stdin → all clients see the output**

This is not mirroring or proxying — multiple subscribers share the same PTY master fd. Even if you disconnect all clients, the agent keeps executing in the background.

---

## Quick Start

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh --lang en
```

The install script is fully interactive and auto-detects your environment.

The installer, `rcc-tui` and CLI messages default to Chinese. `--lang en` (or `RCC_LANG=en bash install.sh`) switches them to English and saves the choice to `~/.rcc/lang`, so `rcc-tui` and `remotecc` stay in English afterwards. Prefix a command with `RCC_LANG=en` or `RCC_LANG=zh` to switch just once. The Web UI language is set separately on its settings page.

RemoteCC auto-detects Claude Code, Codex, and Grok; at least one of them must be installed. New sessions can choose the agent and optionally pass launch args (for example `--model xxx`) straight to the agent CLI. History resume supports Claude Code's `~/.claude/projects/`, Codex session records from `~/.codex/sessions/`, and Grok sessions from `~/.grok/sessions/`.

If Codex or Claude Code needs a proxy, configure `CODEX_PROXY` / `CLAUDE_PROXY` in the installer. The proxy is injected only into the selected agent CLI, not into RemoteCC globally. The prompt uses `http://127.0.0.1:7890` as a generic example.

After installation:

```bash
remotecc start     # Start the service
remotecc           # Open the visual session manager
```

Or open `http://<server-ip>:8310` in a browser.

---

## Commands

```bash
# Service management
remotecc start          # Start service (daemon, auto-restart on crash)
remotecc stop           # Stop service
remotecc restart        # Full restart (use after server-side updates)
remotecc reload         # Hot reload (no session interruption)
remotecc update         # Pull latest version and auto-restart/reload
remotecc status         # Show whether the service is running

# Daily use (run on the server)
remotecc                # Open visual session manager
remotecc attach <name>  # Jump directly into a named session
```

Inside any session: **`Ctrl+]`** goes back to the menu without killing the agent.

---

## Changelog

### 2026-09-24

- **Terminal rendering**: WebGL renderer with selections aligned to text; font or size changes re-measure and resync columns, so the right edge is no longer cut off on desktop
- **English CLI**: the installer, `rcc-tui` and `remotecc` support English; Chinese by default, switch with `--lang en` or `RCC_LANG=en`
- **Scrolling**: reading history is no longer pulled back by new output, and the view returns to the bottom after 10 s idle; new "jump to bottom" button; touch scrolling gains momentum
- **Colors**: agent color queries are answered so colors follow the theme; when the service is started from inside an agent session, new sessions no longer inherit its color-disabling settings
- **Uploads**: live progress, speed and ETA, cancellable; 10 GB per-file limit
- **Agent commands**: status shows the full executable path; preferred commands and `CODEX_HOME` can be set in `~/.rcc/agent.env`

### 2026-09-23

- **Large transfers**: uploads and downloads are streamed, so large files no longer hang; non-ASCII filename downloads fixed
- **Launch args**: new or resumed sessions accept args such as `--model xxx`, passed to the agent as-is (Web and `rcc-tui`)
- **Grok**: new Grok agent with new sessions, history resume and a custom command
- **Sessions**: multiple sessions in the same directory; start failures are shown in the terminal
- **Stability**: input is no longer lost during WebSocket reconnect, and the HTTP fallback retries WebSocket automatically
- **Fixes**: session rename, history list refresh, file preview, mobile copy mode and Enter-to-send, and more

### 2026-07-01

- **Agent terminal copy and paste**: fixes PC selection coordinate drift; `Ctrl/Cmd+C` copies when text is selected and keeps interrupt behavior when nothing is selected; `Ctrl/Cmd+V` now uses the browser clipboard path to avoid Windows/X11 server-side clipboard failures
- **Reading history while tasks run**: manual scrolling pauses bottom lock during Agent output, then returns to the bottom after a short idle delay
- **File browser directory state**: remembers the last visited directory and restores it after refresh; changing the default directory clears that remembered state

<details>
<summary>Older changelog</summary>

### 2026-06-16

- **Mobile input improvements**: the first Agent shortcut row is now Upload, MODE, Newline, and Send; Newline sends LF, while Send sends CR
- **Mobile keyboard Enter setting**: Settings now lets mobile users choose whether the keyboard Enter key sends or inserts a newline, persisted in `~/.rcc/web-settings.json`
- **Settings sync fix**: Web settings now compare local and server timestamps so a refresh does not overwrite freshly changed terminal settings with older server data

### 2026-06-05

- **HTTP fallback transport**: when WebSocket is unavailable, the Home session list refreshes by HTTP polling, and Agent terminals plus shared terminals switch to HTTP long polling
- **Reverse-proxy compatibility**: adds HTTP fallback for session control actions such as `kill`, `delete`, and `rename`, for access layers that do not pass WebSocket Upgrade
- **Idempotency handling**: session start/attach, terminal start, resize, and kill/delete controls are repeat-safe; terminal input remains non-idempotent to avoid duplicated commands on retry

### 2026-06-04

- **Shared terminal**: Web terminal is now one foreground shared session with reconnect replay and multi-client sync
- **Mobile terminal**: fixes mobile input and supports scrolling history, text selection/copy, default MesloLGM NF, and terminal-only `CTRL` / `ALT` / `FN` shortcuts
- **Settings polish**: mobile UI-style previews now use full-width cards instead of narrow columns
- **Docs screenshots**: refreshed screenshots and grouped desktop, mobile, and TUI images separately

### 2026-06-03

- **Web console enhancements**: directory picker for new sessions, plus a file browser with `/` root access, folder creation, upload/download, and path copy
- **Terminal**: adds a general terminal in the Web top bar, preferring `zsh` by default
- **Mobile terminal**: shortcut bars are mobile-only; terminal mode uses dedicated shortcuts
- **Appearance and language**: defaults to Studio + Aurora + Material, with 9 UI styles, dark/light color themes, 6 icon styles, and complete zh/en switching
- **Settings persistence**: Web settings are saved to `~/.rcc/web-settings.json`, including default paths, themes, terminal preferences, and language
- **TUI detach fix**: fixes first `Ctrl+]` detach after creating a session from `rcc-tui`

### 2026-05-21

- **Codex history resume**: reads real session metadata from `~/.codex/sessions/`, groups sessions by working directory, and resumes with the correct cwd
- **Resume UI**: Web/TUI Codex history is grouped by working directory without the extra `~/.codex/history.jsonl` layer
- **Mobile terminal**: improves xterm bottom-locking after async writes to reduce blank space under Codex output

### 2026-05-19

- **Codex support**: new sessions can choose Claude Code or Codex, and active sessions show the agent type
- **History resume**: supports restoring conversations from Claude Code / Codex history
- **Agent proxy**: installer and updater support `CODEX_PROXY` / `CLAUDE_PROXY`, scoped only to the selected agent CLI
- **Service management**: fixes `rcc-tui` service-state detection and shows the owning process when a port is occupied

### 2026-05-12

- **File browser**: browse server files, preview code/images, double-click for fullscreen, copy path
- **Hot reload**: `remotecc reload` restarts only the API layer, active agent sessions are not interrupted
- **remotecc update**: detects what changed and automatically restarts or hot-reloads as needed
- **remotecc attach**: opens the session manager and goes directly into the named session; detaching returns to the menu instead of exiting
- **Login redirect**: when the service restarts and the token expires, the browser automatically shows the login page instead of a blank screen

</details>

---

## Screenshots

### Desktop

| Sessions | Agent terminal |
|---|---|
| <img src="docs/assets/screenshots/web-home-desktop.jpg" alt="Web sessions" width="520"> | <img src="docs/assets/screenshots/web-terminal-desktop.png" alt="Web terminal" width="520"> |

| File browser | Shared terminal |
|---|---|
| <img src="docs/assets/screenshots/web-file-browser-desktop.jpg" alt="Web file browser" width="520"> | <img src="docs/assets/screenshots/web-shell-desktop.png" alt="Web shared terminal" width="520"> |

| Appearance settings | Terminal and path settings |
|---|---|
| <img src="docs/assets/screenshots/web-settings-appearance.jpg" alt="Appearance settings" width="520"> | <img src="docs/assets/screenshots/web-settings-terminal.jpg" alt="Terminal and path settings" width="520"> |

### Mobile

| Sessions | Agent terminal | File browser | Settings |
|---|---|---|---|
| <img src="docs/assets/screenshots/mobile-home.jpg" alt="Mobile sessions" width="220"> | <img src="docs/assets/screenshots/mobile-terminal.jpg" alt="Mobile terminal" width="220"> | <img src="docs/assets/screenshots/mobile-file-browser.jpg" alt="Mobile file browser" width="220"> | <img src="docs/assets/screenshots/mobile-settings.jpg" alt="Mobile settings" width="220"> |

### TUI

| Session list | Session actions |
|---|---|
| <img src="docs/assets/screenshots/tui-session-list.png" alt="TUI session list" width="420"> | <img src="docs/assets/screenshots/tui-session-actions.png" alt="TUI session actions" width="420"> |

---

## Documentation

- [Installation Guide](docs/installation.md)
- [Usage Manual](docs/usage.md)
- [API Reference](docs/api.md)
- [Architecture](docs/architecture.md)
- [Development Guide](docs/development.md)

---

## Contributing

This tool is young and actively evolving. Contributions welcome:

- 🐛 [Report a bug](https://github.com/changdazhou/remote-cc/issues/new?labels=bug)
- 💡 [Request a feature](https://github.com/changdazhou/remote-cc/issues/new?labels=enhancement)
- 🔧 Submit a PR

---

## License

[Apache 2.0](LICENSE) © 2026 changdazhou
