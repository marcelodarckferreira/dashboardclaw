# ISSUES.md — Known Issues & Status

## Terminal Feature (feat/cli-terminal branch)

### 🔴 Critical: Gateway intercepts all WebSocket upgrades
**Status:** Workaround applied — using dedicated side port (18790)

The OpenClaw gateway's HTTP server has a global `upgrade` handler that catches ALL WebSocket connections before plugins can intercept them. Plugin `registerHttpHandler` only covers HTTP requests, not WS upgrades. There's no `registerUpgradeHandler` in the plugin API.

**Workaround:** Terminal WebSocket runs on its own HTTP server at `127.0.0.1:18790`. Users connecting via SSH tunnel need to forward both ports (18789 + 18790).

**Ideal fix:** OpenClaw adds a plugin API for registering WebSocket upgrade handlers (e.g. `api.registerUpgradeHandler(path, handler)`).

---

### 🟡 ws module import fails under jiti
**Status:** Fixed with fallback detection

When OpenClaw loads plugins via jiti (its TypeScript/ESM loader), the `ws` module resolves differently than in a direct Node.js import. `mod.default` ends up being the raw WebSocket class with only constants (`CONNECTING`, `OPEN`, etc.) visible, not the full module with `WebSocketServer`.

**Fix applied:** Brute-force search across `mod`, `mod.default`, `mod.default.default`, and fall back to `ws.Server` if `WebSocketServer` isn't found.

---

### 🟡 node-pty required but not bundled
**Status:** Added as dependency

Terminal requires `node-pty` for PTY sessions. It's a native module that needs compilation. If missing, terminal shows "not available" but doesn't crash.

**Note:** `node-pty` is a runtime-only dependency — it won't be needed by users who don't use the terminal feature. Consider making it an optional peer dependency.

---

### 🟢 Terminal shows "Disconnected" in browser
**Status:** Fixed

Root cause was a **startup race condition**: `ensureAttached()` triggered the WS server lazily on the first HTTP request, but the terminal page loaded and tried to connect before the server was listening. Combined with zero diagnostic feedback, users just saw "Disconnected" with no explanation.

**Fixes applied:**
1. **Eager WS server startup** — `startWsServer()` is called immediately in `createTerminalManager()` instead of lazily. By the time a user loads the terminal page, the server is already listening.
2. **Status endpoint** — `GET /better-gateway/terminal/status` returns JSON with `{ wsPort, wsReady, ptyAvailable }`. The frontend fetches this before opening the WebSocket.
3. **Dynamic port** — WS port is passed from the server into the page HTML and confirmed via the status endpoint. No more hardcoded `18790` in the frontend.
4. **Context-aware error messages** — Instead of generic "Disconnected", the terminal now shows:
   - "node-pty not installed — run: npm install node-pty" if PTY is missing
   - "WebSocket server not ready — check gateway logs" if WS server failed
   - "Connection failed — if using SSH, forward port {port} too" after max retries

---

### ⚪ Plugin discovery doesn't use installs config
**Status:** Documented / config workaround applied

`plugins.installs` in `openclaw.json` is metadata only — it records where a plugin was installed from but doesn't affect discovery. Plugin discovery scans:
1. `plugins.load.paths` (config)
2. `<workspace>/.openclaw/extensions/`
3. `~/.openclaw/extensions/`
4. Bundled plugins dir

A stale copy in `~/.openclaw/extensions/` will be loaded instead of the dev version. 

**Fix applied:** 
- Deleted stale copy from `/root/.openclaw/extensions/openclaw-better-gateway/`
- Added dev path to `plugins.load.paths` in `openclaw.json`

**Dev workflow:** After `npm run build`, just `systemctl restart openclaw-gateway` — no deploy step needed.

---

### ⚪ Gateway control UI catches all unhandled GET routes
**Status:** Not a bug, but worth knowing

When `controlUi.basePath` is empty (default), the control UI serves `index.html` for any GET path that isn't handled by a prior handler. This is standard SPA behavior. Plugin HTTP handlers run *before* the control UI, so as long as the plugin returns `true`, it works fine.

---

## Architecture Notes

### Request handling order (gateway HTTP)
1. Hooks
2. Tools invoke
3. Slack HTTP
4. **Plugin handlers** (`registerHttpHandler`)
5. OpenAI Responses API
6. OpenAI Chat Completions API
7. Canvas host
8. Control UI (SPA catch-all)

### Plugin discovery order (first match wins)
1. `plugins.load.paths`
2. `<workspace>/.openclaw/extensions/`
3. `~/.openclaw/extensions/`
4. Bundled plugins
