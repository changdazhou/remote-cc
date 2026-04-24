# RemoteCC — Use Claude Code from Anywhere

[中文](README.md) | English

```
  ██████╗  ██████╗ ██████╗
  ██╔══██╗██╔════╝██╔════╝
  ██████╔╝██║     ██║
  ██╔══██╗██║     ██║
  ██║  ██║╚██████╗╚██████╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
  Remote Claude Code
```

> **This tool was built with the help of Claude Code, and is still actively being improved. Bug reports and suggestions are very welcome — please open an [Issue](https://github.com/changdazhou/remote-cc/issues).**

---

## What is this?

**Access Claude Code from your phone, tablet, or any browser — all in real time.**

Claude Code is a powerful AI coding assistant that runs in your terminal — but only locally. RemoteCC breaks that limitation. Your Claude Code session can be accessed simultaneously from a phone browser, a tablet, and a local terminal, with **all clients sharing the same PTY process in real time**.

This is not screenshots or log forwarding. It is **true bidirectional real-time sync** — type on your phone and the desktop sees it instantly; run something in the terminal and your phone shows the output right away. Disconnect any client at any time, and Claude keeps working in the background. Reconnect whenever you want, seamlessly.

---

## Key Features

- **Real terminal** — PTY + xterm.js, full color/interactive/mouse support
- **Real-time multi-client sync** — all clients share the same PTY process, zero-latency broadcast
- **Persistent sessions** — tmux-style architecture, closing the browser or dropping SSH does not interrupt Claude
- **History resume** — reads `~/.claude/projects/`, resume any past conversation with `--resume`
- **Local TUI** — `rcc-tui` interactive terminal UI, no browser or login required
- **Detach shortcut** — `Ctrl+]` detaches from any client without killing the Claude process
- **Mobile-optimized** — responsive UI, CC/SH dual-mode symbol bar
- **Rich themes** — 9 color themes + 3 UI styles

---

## How Real-Time Sync Works

```
               You have three windows open
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
  Phone browser     Desktop browser    Local terminal
  (WebSocket)        (WebSocket)      (Unix Socket)
       │                  │                  │
       └───────┬──────────┘                  │
               ▼                             │
         PTY Manager  ◀───────────────────────┘
               │
               ▼
        claude process (always running)
```

**Any client input → PTY stdin → all clients see the output**

This is not mirroring or proxying — multiple subscribers share the same PTY master fd. Even if you disconnect all clients, Claude keeps executing in the background.

---

## Quick Start

```bash
git clone https://github.com/changdazhou/remote-cc.git
cd remote-cc
bash install.sh
```

The install script is fully interactive and auto-detects your environment.

After installation:

```bash
rcc start          # Start the service
```

Open `http://<server-ip>:8310` in a browser, or use the terminal directly:

```bash
rcc-tui            # Local interactive TUI (recommended)
```

---

## Commands

```bash
rcc start          # Start service (daemon, auto-restart on crash)
rcc stop           # Stop service
rcc status         # Show service status
rcc ls             # List all sessions
rcc-tui            # Interactive TUI (no login, local direct connect)
```

Inside any session: **`Ctrl+]`** detaches back to the menu without killing Claude.

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

[Apache 2.0](LICENSE) © 2024 changdazhou
