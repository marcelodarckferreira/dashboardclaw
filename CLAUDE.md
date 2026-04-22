# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload)
npm run dev        # tsx watch server/index.ts — runs on port 3000

# Production
npm run build      # tsc -p tsconfig.json → dist/
npm start          # node dist/index.js

# No test runner is currently configured
```

## Architecture

This project is a **standalone operational dashboard** for monitoring OpenClaw Gateway — not a plugin. It runs as an independent Node.js server on port 3000.

```
server/         ← TypeScript backend (ESM, Node 20+)
  index.ts      ← Express entrypoint: serves client/, mounts APIs
  file-api.ts   ← Workspace file CRUD (list/read/write/delete/mkdir/upload/download)
  terminal-api.ts ← PTY terminal manager (node-pty via SSE+POST transport)

client/         ← Vanilla HTML/CSS/JS frontend (served as static files)
  index.html    ← Single-page layout: sidebar nav + view panels
  styles.css    ← Design system: dark glassmorphism, KPI cards, data tables
  app.js        ← Tab switching, xterm.js terminal init, gateway token auth
```

### Server

`server/index.ts` creates an Express app that:
- Serves `client/` as static files at `/`
- Mounts File API at `/api/files` (rewrites URL to match handler's `dashboardclaw/api/files/...` prefix)
- Mounts Terminal API at `/api/terminal`
- Resolves workspace root from `WORKSPACE_DIR` env var → `./workspace` dir → `process.cwd()`

### File API (`server/file-api.ts`)

All paths are validated against `workspaceDir` to prevent traversal. Accepts workspace-relative paths, paths prefixed with `workspace/`, or absolute paths inside workspaceDir. Read limit: 10 MB. Upload limit: 50 MB (multipart, parsed without external dependencies).

Endpoints matched by exact `pathname` string inside the handler:
- `GET /dashboardclaw/api/files` — list directory (`?path=&recursive=true`)
- `GET /dashboardclaw/api/files/read` — read file content (`?path=`)
- `POST /dashboardclaw/api/files/write` — write file (`{path, content}`)
- `DELETE /dashboardclaw/api/files` — delete file (`?path=`)
- `POST /dashboardclaw/api/files/mkdir` — create directory (`{path}`)
- `POST /dashboardclaw/api/files/upload` — binary upload (`multipart/form-data`, field `path` = target dir)
- `GET /dashboardclaw/api/files/download` — binary download (`?path=`)

### Terminal API (`server/terminal-api.ts`)

Bridges a server-side PTY to the browser using SSE (output) and POST (input/resize). `node-pty` is an optional dependency — if missing, the stream endpoint returns an SSE error event and closes. The PTY is resolved using a 4-strategy `pluginImport` fallback (createRequire from file URL → cwd → dynamic import → global paths) to survive being loaded via jiti inside OpenClaw.

Session lifecycle: `GET /stream` spawns PTY + returns `session` SSE event with `{sid}`. All subsequent POSTs to `/input` and `/resize` include `{sid}` in JSON body. PTY stdout is base64-encoded before being sent as SSE data.

### Frontend (`client/`)

Single-page app with sidebar navigation. Tab targets map `data-target` attribute to `view-{target}` element IDs. The terminal view lazily initializes xterm.js on first activation. `app.js` also intercepts `window.fetch` to inject an `Authorization: Bearer <token>` header from `localStorage.getItem("gateway_token")`.

## Known Issues / In-Progress State

- `tsconfig.json` has `"rootDir": "src"` but active server code is in `server/` — `npm run build` targets the old plugin source. Update `rootDir` and `include` before running a production build.
- `client/app.js` has garbled wide-character encoding at the end of the file (lines 105+) — the gateway token auth code is there but unreadable; it needs to be rewritten.
- KPI cards and event table in the Overview view display **mock/static data** — real OpenClaw API integration is pending.
- The `MIGRATION_PLAN.md` documents the ongoing transition from plugin to standalone dashboard; refer to it for planned next steps.
