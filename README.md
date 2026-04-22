# OpenClaw DashboardClaw

An OpenClaw plugin that turns the Gateway into a **full-featured workspace** — resilient chat, embedded IDE, browser terminal, and file API, all in one tab.

## Why this plugin

OpenClaw Gateway is great for chatting with models, but when sockets drop, you need to edit files, or you want a terminal — your flow breaks. **DashboardClaw** keeps sessions alive and puts everything you need right inside the Gateway UI.

## Features

### Auto-Reconnect & Reliability

- **Automatic WebSocket recovery** — disconnects are detected and retried transparently
- **Visual status indicator** — connected / reconnecting / disconnected state always visible
- **Network awareness** — detects online/offline transitions and retries when connectivity returns
- **Click-to-refresh fallback** — fast manual recovery when automatic retry is exhausted
- **Enhanced Gateway route** — drop-in improved UI at `/dashboardclaw/` with all enhancements pre-injected

### Embedded IDE (Monaco)

- **Full Monaco editor** in the browser — syntax highlighting for 30+ languages
- **Sidebar file explorer** — tree navigation with open-folder and refresh controls
- **Multi-tab editing** — open, switch, close, and reorder tabs
- **Keyboard shortcuts** — Ctrl+S save, Ctrl+B toggle sidebar, Ctrl+P quick-open, Ctrl+W close tab, Ctrl+Tab cycle tabs
- **State persistence** — open tabs, active tab, and workspace root remembered across reloads
- **Gateway-native navigation** — IDE appears as a nav item; click for split view (IDE + chat), Shift+click for IDE-only

### Embedded Terminal (xterm.js + node-pty)

- **Real PTY backend** — full interactive terminal via `node-pty` (vim, htop, tab completion, colors, everything)
- **xterm.js frontend** — 256-color support, scrollback, clickable links, proper resize handling
- **SSE + POST transport** — runs entirely on the main gateway port; no extra ports, no extra SSH tunnel config
- **Gateway-native navigation** — CLI nav item; click for split view (terminal + chat), Shift+click for terminal-only
- **Keyboard shortcuts** — Ctrl+\` toggles terminal, Ctrl+L toggles chat sidebar

### File API

- **Read / Write / List / Delete / Mkdir** — full workspace file operations over HTTP
- **Tested implementation** with strong coverage in repo tests

### Keyboard Shortcuts (all views)

| Shortcut | Action |
|----------|--------|
| Ctrl+L | Toggle chat sidebar (works from IDE and terminal) |
| Ctrl+\` | Toggle terminal |
| Shift+click IDE | IDE fullscreen |
| Shift+click CLI | Terminal fullscreen |

---

## Installation

```bash
openclaw plugins install dashboardclaw
```

Then restart your gateway.

### From source

```bash
git clone https://github.com/marcelodarckferreira/dashboardclaw.git
cd dashboardclaw
npm install && npm run build
openclaw plugins install -l .
```

**Note:** The terminal feature requires `node-pty` (native module). It's listed as an optional dependency — if it fails to compile, everything else still works, and the terminal page will tell you what's missing.

## Usage

After installation and gateway restart:

```text
https://<YOUR_GATEWAY>/dashboardclaw/
```

### Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/dashboardclaw/` | GET | Enhanced gateway UI with auto-reconnect and nav items |
| `/dashboardclaw/ide` | GET | Standalone IDE page (Monaco + file explorer) |
| `/dashboardclaw/terminal` | GET | Standalone terminal page (xterm.js) |
| `/dashboardclaw/terminal/stream` | GET | Terminal SSE stream (PTY output) |
| `/dashboardclaw/terminal/input` | POST | Terminal input (keystrokes to PTY) |
| `/dashboardclaw/terminal/resize` | POST | Terminal resize (cols/rows to PTY) |
| `/dashboardclaw/api/files` | GET | List files in a directory |
| `/dashboardclaw/api/files/read` | GET | Read a file |
| `/dashboardclaw/api/files/write` | POST | Write a file |
| `/dashboardclaw/api/files` | DELETE | Delete a file |
| `/dashboardclaw/help` | GET | Help / installation page |
| `/dashboardclaw/inject.js` | GET | Standalone injection script |
| `/dashboardclaw/userscript.user.js` | GET | Tampermonkey userscript download |

## Configuration

In your OpenClaw config (`openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "dashboardclaw": {
        "enabled": true,
        "reconnectIntervalMs": 3000,
        "maxReconnectAttempts": 10,
        "maxFileSize": 10485760
      }
    }
  }
}
```

## How it works

The plugin:
1. Proxies the original gateway UI under `/dashboardclaw/` and injects reconnect/status behavior
2. Serves the IDE (Monaco) and terminal (xterm.js) as standalone pages, embedded via iframes in the nav
3. Bridges the terminal to a server-side PTY using SSE (server-to-browser) and POST (browser-to-server) — all on the main gateway port
4. Exposes a file API for workspace read/write/list/delete operations

When a WebSocket connection drops, DashboardClaw retries automatically. If recovery fails, the status indicator gives a quick click-to-refresh fallback.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Contributing

PRs welcome! Please include tests for new features.

## License

MIT

---

Built with :paw_prints: by [marcelodarckferreira](https://github.com/marcelodarckferreira) and Clawd
