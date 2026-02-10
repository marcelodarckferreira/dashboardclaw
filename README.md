# OpenClaw Better Gateway

An OpenClaw plugin that turns the Gateway into a **reliable chat + code workspace**:
- resilient auto-reconnect/refresh UX
- embedded Monaco IDE
- workspace file API for editing from the browser

## Why this plugin

OpenClaw Gateway is great, but when sockets drop or you need to quickly edit files, flow breaks.

**Better Gateway** keeps sessions alive and adds an IDE directly in the Gateway experience.

## Features

### Reliability / Auto-Refresh Experience

✅ **Auto-Reconnect** — WebSocket disconnects are automatically recovered  
✅ **Connection Status Indicator** — Clear connected/reconnecting/disconnected state  
✅ **Network Awareness** — Detects online/offline and retries automatically  
✅ **Click-to-Refresh Recovery** — Fast manual recovery path when needed  
✅ **Enhanced Gateway Route** — Drop-in improved UI at `/better-gateway/`

### IDE (Big Selling Point 🚀)

✅ **Embedded Monaco IDE** — Full editor experience inside Gateway  
✅ **Sidebar File Explorer** — Browse workspace files/folders  
✅ **Multi-tab Editing** — Open, switch, close, reorder tabs  
✅ **Keyboard Shortcuts** — Save, toggle sidebar, quick-open, tab nav  
✅ **Open Folder + Refresh Controls** — Quickly re-scope and refresh tree  
✅ **State Persistence** — Open tabs/active tab/workspace root remembered  
✅ **Gateway-Native Feel** — IDE integrated into sidebar navigation  
✅ **Split-view-friendly foundation** — designed for chat + IDE workflows

### File API

✅ **Read/Write/List/Delete/Mkdir** routes for workspace operations  
✅ **Tested implementation** with strong coverage in repo tests

---

## Installation

```bash
openclaw plugins install @thisisjeron/openclaw-better-gateway
```

Then restart your gateway.

### From source

```bash
git clone https://github.com/ThisIsJeron/openclaw-better-gateway.git
cd openclaw-better-gateway
npm install && npm run build
openclaw plugins install -l .
```

## Usage

After installation and gateway restart:

```text
https://<YOUR_GATEWAY>/better-gateway/
```

### Main endpoints

| Path | Description |
|------|-------------|
| `/better-gateway/` | Enhanced gateway UI with auto-reconnect |
| `/better-gateway/ide` | Embedded IDE page (Monaco + file explorer) |
| `/better-gateway/api/files` | Workspace file operations API |
| `/better-gateway/help` | Help/installation page |
| `/better-gateway/inject.js` | Standalone injection script |
| `/better-gateway/userscript.user.js` | Userscript download |

## Configuration

In your OpenClaw config (`openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "openclaw-better-gateway": {
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
1. Proxies the original gateway UI under `/better-gateway/`
2. Injects reconnect/status behavior into the UI runtime
3. Serves IDE + file API routes
4. Keeps the Gateway workflow in one place (chat + code)

When a WebSocket connection drops, Better Gateway retries automatically. If recovery fails, the status indicator gives a quick click-to-refresh fallback.

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

Built with 🐾 by [ThisIsJeron](https://github.com/ThisIsJeron) and Clawd
