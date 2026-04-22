# DashboardClaw Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o DashboardClaw em uma plataforma multi-gateway com SQLite, Vite, módulos frontend e os três bugs bloqueadores corrigidos.

**Architecture:** Backend Express em `server/` com módulos factory exportando routers Express montados em `index.ts`. Frontend SPA vanilla JS gerenciado pelo Vite com módulos ES em `client/src/`. SQLite via `claw-sqlite3` (compatível com API do `better-sqlite3` — se não existir no npm, usar `better-sqlite3`).

**Tech Stack:** Node.js 20+, TypeScript (server), Express 5, claw-sqlite3, Vite 5, xterm.js 5, vitest

---

## File Map

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modify | `tsconfig.json` | Apontar para `server/` |
| Modify | `package.json` | Scripts de teste, Vite, sqlite |
| Modify | `vitest.config.ts` | Incluir `server/**/*.test.ts` |
| Modify | `.gitignore` | Ignorar `dashboardclaw.db` |
| Create | `server/db.ts` | Init SQLite, schema completo |
| Create | `server/db.test.ts` | Testes do módulo db |
| Create | `server/gateways-api.ts` | CRUD gateways + poll |
| Create | `server/gateways-api.test.ts` | Testes do gateways API |
| Create | `server/channels-api.ts` | Stub 501 |
| Create | `server/agent-sessions-api.ts` | Stub 501 |
| Create | `server/chat-api.ts` | Stub 501 |
| Modify | `server/index.ts` | Montar todos os routers |
| Create | `vite.config.js` | Proxy `/api` → porta 3000 |
| Create | `client/src/main.js` | Entry point |
| Create | `client/src/nav.js` | Tab switching |
| Create | `client/src/auth.js` | Modal de login + fetch intercept |
| Create | `client/src/terminal.js` | xterm.js + SSE sid + base64 |
| Create | `client/src/gateways.js` | CRUD gateways UI |
| Create | `client/src/channels.js` | Stub UI |
| Create | `client/src/chat.js` | Stub UI |
| Create | `client/src/agent-sessions.js` | Stub UI |
| Modify | `client/index.html` | Novos nav items, modal, `<script type="module">` |
| Delete | `client/app.js` | Substituído pelos módulos |

---

## Task 1: Corrigir tsconfig.json e vitest.config.ts

**Files:**
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Corrigir tsconfig.json**

Substituir o conteúdo de `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "server",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["server/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
```

- [ ] **Step 2: Corrigir vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
```

- [ ] **Step 3: Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros (apenas warnings de módulos não encontrados ainda são OK).

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json vitest.config.ts
git commit -m "fix: point tsconfig and vitest to server/ directory"
```

---

## Task 2: Instalar dependências

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar claw-sqlite3**

```bash
npm install claw-sqlite3
```

Se retornar erro "package not found", instalar `better-sqlite3` (mesma API):

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

- [ ] **Step 2: Instalar Vite e tipos**

```bash
npm install --save-dev vite
```

- [ ] **Step 3: Adicionar scripts ao package.json**

Editar `package.json` — substituir a seção `"scripts"`:

```json
"scripts": {
  "start": "node dist/index.js",
  "dev": "tsx watch server/index.ts",
  "build": "tsc -p tsconfig.json",
  "test": "vitest run",
  "test:watch": "vitest",
  "client:dev": "vite client/",
  "client:build": "vite build client/ --outDir ../dist/client"
}
```

- [ ] **Step 4: Atualizar .gitignore**

Adicionar ao `.gitignore` (criar se não existir):

```
dashboardclaw.db
dashboardclaw.db-shm
dashboardclaw.db-wal
dist/
node_modules/
client/dist/
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: install claw-sqlite3 and vite, add npm scripts"
```

---

## Task 3: Módulo de banco de dados (server/db.ts)

**Files:**
- Create: `server/db.ts`
- Create: `server/db.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `server/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDb, closeDb } from "./db.js";
import type { Database } from "./db.js";

let db: Database;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "dashboardclaw-test-"));
  db = initDb(join(tmpDir, "test.db"));
});

afterEach(() => {
  closeDb(db);
  rmSync(tmpDir, { recursive: true });
});

describe("initDb", () => {
  it("creates all required tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("gateways");
    expect(names).toContain("sessions");
    expect(names).toContain("service_status");
    expect(names).toContain("channels");
    expect(names).toContain("agent_sessions");
    expect(names).toContain("messages");
  });

  it("is idempotent — calling twice does not throw", () => {
    closeDb(db);
    db = initDb(join(tmpDir, "test.db"));
    expect(() => initDb(join(tmpDir, "test.db"))).not.toThrow();
  });
});

describe("gateways table", () => {
  it("inserts and retrieves a gateway", () => {
    db.prepare(
      "INSERT INTO gateways (name, host, port, token) VALUES (?, ?, ?, ?)"
    ).run("Local", "localhost", 18789, "secret");

    const row = db
      .prepare("SELECT * FROM gateways WHERE name = ?")
      .get("Local") as { name: string; host: string; port: number; token: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.host).toBe("localhost");
    expect(row!.port).toBe(18789);
  });

  it("cascades delete to service_status", () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO gateways (name, host, port, token) VALUES (?, ?, ?, ?)")
      .run("Del", "localhost", 18789, "tok");

    db.prepare(
      "INSERT INTO service_status (gateway_id, service, status) VALUES (?, ?, ?)"
    ).run(lastInsertRowid, "gateway", "ok");

    db.prepare("DELETE FROM gateways WHERE id = ?").run(lastInsertRowid);

    const count = (
      db
        .prepare("SELECT COUNT(*) as c FROM service_status WHERE gateway_id = ?")
        .get(lastInsertRowid) as { c: number }
    ).c;
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar falha**

```bash
npm test
```

Esperado: `FAIL server/db.test.ts` — `Cannot find module './db.js'`

- [ ] **Step 3: Implementar server/db.ts**

Criar `server/db.ts`:

```typescript
import Database from "claw-sqlite3";
// Se claw-sqlite3 não existir: import Database from "better-sqlite3";

export type { Database };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gateways (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  host       TEXT    NOT NULL,
  port       INTEGER NOT NULL DEFAULT 18789,
  token      TEXT    NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  last_seen  DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_status (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  service    TEXT    NOT NULL,
  status     TEXT    NOT NULL,
  value      TEXT,
  detail     TEXT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channels (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,
  config     TEXT    NOT NULL DEFAULT '{}',
  enabled    INTEGER NOT NULL DEFAULT 1,
  status     TEXT    NOT NULL DEFAULT 'unknown',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway_id INTEGER NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  agent_id   TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'active',
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at   DATETIME
);

CREATE TABLE IF NOT EXISTS messages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id       INTEGER REFERENCES channels(id) ON DELETE SET NULL,
  agent_session_id INTEGER REFERENCES agent_sessions(id) ON DELETE SET NULL,
  direction        TEXT    NOT NULL,
  content          TEXT    NOT NULL,
  sent_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

PRAGMA foreign_keys = ON;
`;

export function initDb(path: string): InstanceType<typeof Database> {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function closeDb(db: InstanceType<typeof Database>): void {
  db.close();
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npm test
```

Esperado: `PASS server/db.test.ts` — todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/db.test.ts
git commit -m "feat: add SQLite db module with full schema"
```

---

## Task 4: Gateways API (server/gateways-api.ts)

**Files:**
- Create: `server/gateways-api.ts`
- Create: `server/gateways-api.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `server/gateways-api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import { initDb, closeDb } from "./db.js";
import { createGatewaysApi } from "./gateways-api.js";
import type { Database } from "./db.js";

let db: Database;
let app: express.Express;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "gw-test-"));
  db = initDb(join(tmpDir, "test.db"));
  app = express();
  app.use(express.json());
  app.use("/api/gateways", createGatewaysApi(db));
});

afterEach(() => {
  closeDb(db);
  rmSync(tmpDir, { recursive: true });
});

describe("GET /api/gateways", () => {
  it("returns empty array when no gateways", async () => {
    const res = await request(app).get("/api/gateways");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns all gateways", async () => {
    db.prepare("INSERT INTO gateways (name, host, port, token) VALUES (?,?,?,?)")
      .run("Prod", "192.168.1.10", 18789, "tok1");
    const res = await request(app).get("/api/gateways");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Prod");
    expect(res.body[0].token).toBeUndefined(); // token não exposto
  });
});

describe("POST /api/gateways", () => {
  it("creates a gateway and returns it", async () => {
    const res = await request(app)
      .post("/api/gateways")
      .send({ name: "Dev", host: "localhost", port: 18789, token: "abc" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf("number");
    expect(res.body.name).toBe("Dev");
    expect(res.body.token).toBeUndefined();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/gateways")
      .send({ name: "Bad" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/gateways/:id", () => {
  it("updates name and returns updated gateway", async () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO gateways (name, host, port, token) VALUES (?,?,?,?)")
      .run("Old", "localhost", 18789, "tok");
    const res = await request(app)
      .put(`/api/gateways/${lastInsertRowid}`)
      .send({ name: "New" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New");
  });

  it("returns 404 for non-existent gateway", async () => {
    const res = await request(app).put("/api/gateways/999").send({ name: "X" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/gateways/:id", () => {
  it("removes the gateway", async () => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO gateways (name, host, port, token) VALUES (?,?,?,?)")
      .run("ToDelete", "localhost", 18789, "tok");
    const del = await request(app).delete(`/api/gateways/${lastInsertRowid}`);
    expect(del.status).toBe(200);
    const row = db.prepare("SELECT * FROM gateways WHERE id = ?").get(lastInsertRowid);
    expect(row).toBeUndefined();
  });
});

describe("POST /api/gateways/:id/poll", () => {
  it("returns 404 for non-existent gateway", async () => {
    const res = await request(app).post("/api/gateways/999/poll");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Instalar supertest (test helper)**

```bash
npm install --save-dev supertest @types/supertest
```

- [ ] **Step 3: Rodar os testes para confirmar falha**

```bash
npm test
```

Esperado: `FAIL server/gateways-api.test.ts` — `Cannot find module './gateways-api.js'`

- [ ] **Step 4: Implementar server/gateways-api.ts**

Criar `server/gateways-api.ts`:

```typescript
import express from "express";
import type { Database } from "./db.js";

interface GatewayRow {
  id: number;
  name: string;
  host: string;
  port: number;
  token: string;
  created_at: string;
  updated_at: string;
}

function toPublic(row: GatewayRow) {
  const { token: _token, ...pub } = row;
  return pub;
}

export function createGatewaysApi(db: InstanceType<typeof Database>): express.Router {
  const router = express.Router();

  // GET /api/gateways — lista todos
  router.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM gateways ORDER BY name").all() as GatewayRow[];
    res.json(rows.map(toPublic));
  });

  // POST /api/gateways — cadastra novo
  router.post("/", (req, res) => {
    const { name, host, port, token } = req.body as Partial<GatewayRow>;
    if (!name || !host || !port || !token) {
      res.status(400).json({ error: "name, host, port, token são obrigatórios" });
      return;
    }
    const { lastInsertRowid } = db
      .prepare("INSERT INTO gateways (name, host, port, token) VALUES (?, ?, ?, ?)")
      .run(name, host, Number(port), token);
    const row = db.prepare("SELECT * FROM gateways WHERE id = ?").get(lastInsertRowid) as GatewayRow;
    res.status(201).json(toPublic(row));
  });

  // PUT /api/gateways/:id — atualiza
  router.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM gateways WHERE id = ?").get(id) as GatewayRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "Gateway não encontrado" });
      return;
    }
    const { name, host, port, token } = req.body as Partial<GatewayRow>;
    db.prepare(`
      UPDATE gateways
      SET name = ?, host = ?, port = ?, token = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? existing.name,
      host ?? existing.host,
      port != null ? Number(port) : existing.port,
      token ?? existing.token,
      id
    );
    const updated = db.prepare("SELECT * FROM gateways WHERE id = ?").get(id) as GatewayRow;
    res.json(toPublic(updated));
  });

  // DELETE /api/gateways/:id — remove
  router.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM gateways WHERE id = ?").get(id);
    if (!existing) {
      res.status(404).json({ error: "Gateway não encontrado" });
      return;
    }
    db.prepare("DELETE FROM gateways WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  // POST /api/gateways/:id/poll — ping no gateway OpenClaw
  router.post("/:id/poll", async (req, res) => {
    const id = Number(req.params.id);
    const gw = db.prepare("SELECT * FROM gateways WHERE id = ?").get(id) as GatewayRow | undefined;
    if (!gw) {
      res.status(404).json({ error: "Gateway não encontrado" });
      return;
    }

    let status: "ok" | "error" = "error";
    let value = "";
    let detail = "";

    try {
      const url = `http://${gw.host}:${gw.port}/api/status`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        status = "ok";
        value = typeof data.version === "string" ? data.version : "online";
        detail = typeof data.uptime === "number" ? `uptime: ${Math.floor(data.uptime / 60)}m` : "";
      } else {
        detail = `HTTP ${response.status}`;
      }
    } catch (err) {
      detail = err instanceof Error ? err.message : "unreachable";
    }

    db.prepare(`
      INSERT INTO service_status (gateway_id, service, status, value, detail)
      VALUES (?, 'gateway', ?, ?, ?)
    `).run(id, status, value, detail);

    // Registra sessão (atualiza last_seen se já existe)
    const session = db.prepare("SELECT id FROM sessions WHERE gateway_id = ?").get(id);
    if (session) {
      db.prepare("UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE gateway_id = ?").run(id);
    } else {
      db.prepare("INSERT INTO sessions (gateway_id) VALUES (?)").run(id);
    }

    res.json({ status, value, detail });
  });

  // GET /api/gateways/:id/status — histórico de status
  router.get("/:id/status", (req, res) => {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const rows = db
      .prepare(`
        SELECT * FROM service_status
        WHERE gateway_id = ?
        ORDER BY checked_at DESC
        LIMIT ?
      `)
      .all(id, limit);
    res.json(rows);
  });

  return router;
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test
```

Esperado: `PASS server/gateways-api.test.ts` — todos os testes verdes.

- [ ] **Step 6: Commit**

```bash
git add server/gateways-api.ts server/gateways-api.test.ts package.json package-lock.json
git commit -m "feat: add gateways CRUD API with poll endpoint"
```

---

## Task 5: Módulos stub do backend

**Files:**
- Create: `server/channels-api.ts`
- Create: `server/agent-sessions-api.ts`
- Create: `server/chat-api.ts`

- [ ] **Step 1: Criar server/channels-api.ts**

```typescript
import express from "express";
import type { Database } from "./db.js";

export function createChannelsApi(_db: InstanceType<typeof Database>): express.Router {
  const router = express.Router();
  router.all("*", (_req, res) => {
    res.status(501).json({ error: "Not implemented — Sub-projeto 2" });
  });
  return router;
}
```

- [ ] **Step 2: Criar server/agent-sessions-api.ts**

```typescript
import express from "express";
import type { Database } from "./db.js";

export function createAgentSessionsApi(_db: InstanceType<typeof Database>): express.Router {
  const router = express.Router();
  router.all("*", (_req, res) => {
    res.status(501).json({ error: "Not implemented — Sub-projeto 4" });
  });
  return router;
}
```

- [ ] **Step 3: Criar server/chat-api.ts**

```typescript
import express from "express";
import type { Database } from "./db.js";

export function createChatApi(_db: InstanceType<typeof Database>): express.Router {
  const router = express.Router();
  router.all("*", (_req, res) => {
    res.status(501).json({ error: "Not implemented — Sub-projeto 3" });
  });
  return router;
}
```

- [ ] **Step 4: Commit**

```bash
git add server/channels-api.ts server/agent-sessions-api.ts server/chat-api.ts
git commit -m "feat: add stub APIs for channels, chat, and agent-sessions"
```

---

## Task 6: Atualizar server/index.ts

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Reescrever server/index.ts**

```typescript
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { initDb } from "./db.js";
import { createGatewaysApi } from "./gateways-api.js";
import { createChannelsApi } from "./channels-api.js";
import { createAgentSessionsApi } from "./agent-sessions-api.js";
import { createChatApi } from "./chat-api.js";
import { createFileApiHandler, DEFAULT_MAX_FILE_SIZE } from "./file-api.js";
import { createTerminalManager } from "./terminal-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json());

// Workspace
let workspaceDir = process.env.WORKSPACE_DIR;
if (!workspaceDir) {
  const cwdWorkspace = resolve(process.cwd(), "workspace");
  workspaceDir = existsSync(cwdWorkspace) ? cwdWorkspace : process.cwd();
}

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
};

// SQLite
const dbPath = resolve(process.cwd(), "dashboardclaw.db");
const db = initDb(dbPath);
logger.info(`Database: ${dbPath}`);

// API routes
app.use("/api/gateways", createGatewaysApi(db));
app.use("/api/channels", createChannelsApi(db));
app.use("/api/agent-sessions", createAgentSessionsApi(db));
app.use("/api/chat", createChatApi(db));

// File API
const fileApiHandler = createFileApiHandler({
  workspaceDir,
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  corsOrigin: "*",
  maxUploadSize: 50 * 1024 * 1024,
});

app.use("/api/files", async (req, res) => {
  const originalUrl = req.url;
  req.url = `/dashboardclaw/api/files${originalUrl === "/" ? "" : originalUrl}`;
  const handled = await fileApiHandler(req, res, req.url.split("?")[0]);
  if (!handled && !res.headersSent) res.status(404).json({ error: "Not found" });
});

// Terminal API
const terminalManager = createTerminalManager(logger, workspaceDir);
app.use("/api/terminal", async (req, res) => {
  const subpath = req.url.split("?")[0];
  const handled = await terminalManager.handleRequest(req, res, subpath);
  if (!handled && !res.headersSent) res.status(404).json({ error: "Not found" });
});

// Static frontend — em prod serve client/dist/, em dev Vite roda separado
const clientDist = resolve(__dirname, "../dist/client");
const clientDev = resolve(__dirname, "../client");
const staticDir = existsSync(clientDist) ? clientDist : clientDev;
app.use(express.static(staticDir));

// SPA fallback
app.get("*", (_req, res) => {
  const indexFile = resolve(staticDir, "index.html");
  if (existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send("Frontend not built. Run: npm run client:build");
  }
});

server.listen(port, () => {
  logger.info(`Server running on port ${port}`);
  logger.info(`-> Gateways API: http://localhost:${port}/api/gateways`);
  logger.info(`-> File API:     http://localhost:${port}/api/files`);
  logger.info(`-> Terminal API: http://localhost:${port}/api/terminal`);
  logger.info(`-> Static:       ${staticDir}`);
});
```

- [ ] **Step 2: Verificar que o TypeScript compila**

```bash
npx tsc --noEmit
```

Esperado: sem erros de compilação.

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: mount all API routers in server/index.ts with SQLite"
```

---

## Task 7: Configurar Vite

**Files:**
- Create: `vite.config.js`

- [ ] **Step 1: Criar vite.config.js na raiz do projeto**

```javascript
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 2: Verificar que o Vite inicia (sem frontend ainda)**

```bash
npm run client:dev
```

Esperado: servidor Vite na porta 5173. Ctrl+C para parar.

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "feat: add Vite config with API proxy to backend port 3000"
```

---

## Task 8: Módulo de autenticação (client/src/auth.js)

**Files:**
- Create: `client/src/auth.js`

- [ ] **Step 1: Criar client/src/auth.js**

```javascript
const STORAGE_KEY = "dashboardclaw_active_gateway";

export function getActiveGatewayId() {
  const val = localStorage.getItem(STORAGE_KEY);
  return val ? Number(val) : null;
}

export function setActiveGateway(id) {
  localStorage.setItem(STORAGE_KEY, String(id));
}

export function clearActiveGateway() {
  localStorage.removeItem(STORAGE_KEY);
}

function createModal(gateways) {
  const existing = document.getElementById("auth-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "auth-modal";
  modal.className = "auth-modal-overlay";
  modal.innerHTML = `
    <div class="auth-modal-card">
      <div class="auth-modal-logo">
        <i class="ph-fill ph-paw-print"></i>
        <span>OpenClaw</span>
      </div>
      <h2>Conectar ao Gateway</h2>
      ${
        gateways.length > 0
          ? `
        <select id="auth-gateway-select" class="auth-select">
          <option value="">Selecione um gateway...</option>
          ${gateways.map((g) => `<option value="${g.id}">${g.name} — ${g.host}:${g.port}</option>`).join("")}
        </select>
        <button id="auth-connect-btn" class="btn btn-primary" style="width:100%;margin-top:1rem">
          <i class="ph ph-plug"></i> Conectar
        </button>
        <hr style="margin:1rem 0;border-color:rgba(255,255,255,0.1)">
        `
          : ""
      }
      <p style="color:var(--text-muted);font-size:0.85rem;text-align:center">
        ${gateways.length === 0 ? "Nenhum gateway cadastrado." : "ou"}
      </p>
      <button id="auth-add-gw-btn" class="btn btn-secondary" style="width:100%;margin-top:0.5rem">
        <i class="ph ph-plus"></i> Cadastrar novo gateway
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  const connectBtn = document.getElementById("auth-connect-btn");
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      const select = document.getElementById("auth-gateway-select");
      const id = select ? Number(select.value) : 0;
      if (!id) return;
      setActiveGateway(id);
      modal.remove();
      window.location.reload();
    });
  }

  document.getElementById("auth-add-gw-btn")?.addEventListener("click", () => {
    modal.remove();
    const gwNav = document.querySelector('[data-target="gateways"]');
    if (gwNav) gwNav.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

export async function initAuth() {
  // Intercept fetch para injetar X-Gateway-Id
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (resource, config = {}) {
    const id = getActiveGatewayId();
    if (id && typeof resource === "string" && resource.startsWith("/api")) {
      config.headers = {
        ...config.headers,
        "X-Gateway-Id": String(id),
      };
    }
    return originalFetch(resource, config);
  };

  // Verificar se há gateway ativo
  const activeId = getActiveGatewayId();
  if (activeId) return; // já autenticado

  // Buscar gateways cadastrados
  let gateways = [];
  try {
    const res = await originalFetch("/api/gateways");
    if (res.ok) gateways = await res.json();
  } catch {
    // backend ainda não disponível — mostrar modal vazio
  }

  createModal(gateways);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/auth.js
git commit -m "feat: add auth module with gateway selector modal"
```

---

## Task 9: Módulo terminal corrigido (client/src/terminal.js)

**Files:**
- Create: `client/src/terminal.js`

- [ ] **Step 1: Criar client/src/terminal.js**

```javascript
let terminalInitialized = false;

export function initTerminal() {
  if (terminalInitialized) return;
  terminalInitialized = true;

  const container = document.getElementById("terminal-container");
  if (!container) return;

  const term = new window.Terminal({
    cursorBlink: true,
    theme: { background: "#0f111a", foreground: "#eee" },
    fontFamily: "monospace",
    fontSize: 14,
  });

  const fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  fitAddon.fit();

  let sid = null;

  const eventSource = new EventSource("/api/terminal/stream");

  // Captura o session ID enviado como primeiro evento
  eventSource.addEventListener("session", (e) => {
    sid = JSON.parse(e.data).sid;
  });

  // PTY output: decodificar base64
  eventSource.onmessage = (e) => {
    term.write(atob(e.data));
  };

  eventSource.addEventListener("error", (e) => {
    try {
      const data = JSON.parse(e.data);
      term.writeln(`\r\n\x1b[31mErro: ${data.error}\x1b[0m`);
    } catch {
      term.writeln("\r\n\x1b[31mConexão perdida com o terminal.\x1b[0m");
    }
    eventSource.close();
  });

  eventSource.addEventListener("exit", (e) => {
    const { code } = JSON.parse(e.data);
    term.writeln(`\r\n\x1b[33m[processo encerrado com código ${code}]\x1b[0m`);
    eventSource.close();
  });

  // Input do usuário → backend com sid
  term.onData((data) => {
    if (!sid) return;
    fetch("/api/terminal/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, data }),
    });
  });

  function sendResize() {
    if (!sid) return;
    fetch("/api/terminal/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, cols: term.cols, rows: term.rows }),
    });
  }

  window.addEventListener("resize", () => {
    fitAddon.fit();
    sendResize();
  });

  // Aguardar sid antes do primeiro resize
  const resizeInterval = setInterval(() => {
    if (sid) {
      clearInterval(resizeInterval);
      sendResize();
    }
  }, 100);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/terminal.js
git commit -m "fix: terminal SSE session capture, base64 decode, sid in input/resize"
```

---

## Task 10: Módulo de gateways UI (client/src/gateways.js)

**Files:**
- Create: `client/src/gateways.js`

- [ ] **Step 1: Criar client/src/gateways.js**

```javascript
import { setActiveGateway, getActiveGatewayId } from "./auth.js";

export async function initGateways() {
  const container = document.getElementById("view-gateways");
  if (!container) return;

  await renderGateways(container);
}

async function renderGateways(container) {
  let gateways = [];
  try {
    const res = await fetch("/api/gateways");
    if (res.ok) gateways = await res.json();
  } catch {
    container.innerHTML = `<p class="error-text">Erro ao carregar gateways.</p>`;
    return;
  }

  const activeId = getActiveGatewayId();

  container.innerHTML = `
    <div class="page-header">
      <h1>Gateways</h1>
      <p>Gerencie suas instâncias OpenClaw.</p>
    </div>

    <div class="panel" style="margin-bottom:1.5rem">
      <div class="panel-header"><h2>Adicionar Gateway</h2></div>
      <div class="panel-body">
        <form id="gw-add-form" class="gw-form">
          <input class="form-input" name="name" placeholder="Nome (ex: Produção)" required>
          <input class="form-input" name="host" placeholder="Host (ex: 192.168.1.10)" required>
          <input class="form-input" name="port" type="number" placeholder="Porta" value="18789" required>
          <input class="form-input" name="token" type="password" placeholder="Gateway Token" required>
          <button type="submit" class="btn btn-primary"><i class="ph ph-plus"></i> Adicionar</button>
        </form>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h2>Gateways cadastrados</h2></div>
      <div class="panel-body">
        ${
          gateways.length === 0
            ? `<p style="color:var(--text-muted)">Nenhum gateway cadastrado ainda.</p>`
            : `<ul class="gw-list">
                ${gateways
                  .map(
                    (g) => `
                  <li class="gw-item ${g.id === activeId ? "gw-active" : ""}">
                    <div class="gw-info">
                      <strong>${g.name}</strong>
                      <span>${g.host}:${g.port}</span>
                    </div>
                    <div class="gw-actions">
                      <button class="btn btn-primary btn-sm" data-action="connect" data-id="${g.id}">
                        <i class="ph ph-plug"></i> ${g.id === activeId ? "Conectado" : "Conectar"}
                      </button>
                      <button class="btn btn-secondary btn-sm" data-action="delete" data-id="${g.id}">
                        <i class="ph ph-trash"></i>
                      </button>
                    </div>
                  </li>
                `
                  )
                  .join("")}
              </ul>`
        }
      </div>
    </div>
  `;

  // Form submit — adicionar gateway
  document.getElementById("gw-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = {
      name: form.name.value,
      host: form.host.value,
      port: Number(form.port.value),
      token: form.token.value,
    };
    const res = await fetch("/api/gateways", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await renderGateways(container);
    } else {
      const err = await res.json();
      alert(`Erro: ${err.error}`);
    }
  });

  // Botões de ação — conectar / deletar
  container.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = Number(btn.dataset.id);

      if (action === "connect") {
        await fetch(`/api/gateways/${id}/poll`, { method: "POST" });
        setActiveGateway(id);
        await renderGateways(container);
      }

      if (action === "delete") {
        if (!confirm("Remover este gateway?")) return;
        await fetch(`/api/gateways/${id}`, { method: "DELETE" });
        await renderGateways(container);
      }
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/gateways.js
git commit -m "feat: add gateways management UI module"
```

---

## Task 11: Módulos stub do frontend

**Files:**
- Create: `client/src/channels.js`
- Create: `client/src/chat.js`
- Create: `client/src/agent-sessions.js`

- [ ] **Step 1: Criar client/src/channels.js**

```javascript
export function initChannels() {
  const container = document.getElementById("view-channels");
  if (!container) return;
  container.innerHTML = `
    <div class="page-header">
      <h1>Canais</h1>
      <p>Gerencie e opere os canais de comunicação dos seus agentes.</p>
    </div>
    <div class="panel">
      <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="ph ph-plugs" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
        <strong>Em desenvolvimento</strong> — Sub-projeto 2
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Criar client/src/chat.js**

```javascript
export function initChat() {
  const container = document.getElementById("view-chat");
  if (!container) return;
  container.innerHTML = `
    <div class="page-header">
      <h1>Chat</h1>
      <p>Converse com seus agentes, troque modelos e sessões.</p>
    </div>
    <div class="panel">
      <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="ph ph-chat-circle-dots" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
        <strong>Em desenvolvimento</strong> — Sub-projeto 3
      </div>
    </div>
  `;
}
```

- [ ] **Step 3: Criar client/src/agent-sessions.js**

```javascript
export function initAgentSessions() {
  const container = document.getElementById("view-sessions");
  if (!container) return;
  container.innerHTML = `
    <div class="page-header">
      <h1>Sessões</h1>
      <p>Controle e histórico de sessões dos agentes.</p>
    </div>
    <div class="panel">
      <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
        <i class="ph ph-list-bullets" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
        <strong>Em desenvolvimento</strong> — Sub-projeto 4
      </div>
    </div>
  `;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/channels.js client/src/chat.js client/src/agent-sessions.js
git commit -m "feat: add stub UI modules for channels, chat, and sessions"
```

---

## Task 12: Módulo de navegação (client/src/nav.js + main.js)

**Files:**
- Create: `client/src/nav.js`
- Create: `client/src/main.js`

- [ ] **Step 1: Criar client/src/nav.js**

```javascript
import { initTerminal } from "./terminal.js";
import { initGateways } from "./gateways.js";
import { initChannels } from "./channels.js";
import { initChat } from "./chat.js";
import { initAgentSessions } from "./agent-sessions.js";

const VIEW_INITS = {
  terminal: initTerminal,
  gateways: initGateways,
  channels: initChannels,
  chat: initChat,
  sessions: initAgentSessions,
};

const initialized = new Set();

export function initNav() {
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();

      navItems.forEach((n) => n.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));

      item.classList.add("active");

      const target = item.dataset.target;
      const view = document.getElementById(`view-${target}`);
      if (view) {
        view.classList.add("active");
        if (!initialized.has(target) && VIEW_INITS[target]) {
          VIEW_INITS[target]();
          initialized.add(target);
        }
      }
    });
  });

  // Quick actions
  document.querySelectorAll(".quick-actions .btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const icon = btn.querySelector("i");
      if (icon?.classList.contains("ph-arrows-clockwise")) {
        icon.style.transition = "transform 0.5s ease";
        icon.style.transform = "rotate(360deg)";
        setTimeout(() => {
          icon.style.transition = "none";
          icon.style.transform = "rotate(0deg)";
        }, 500);
      }
    });
  });
}
```

- [ ] **Step 2: Criar client/src/main.js**

```javascript
import { initAuth } from "./auth.js";
import { initNav } from "./nav.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initAuth();
  initNav();
});
```

- [ ] **Step 3: Commit**

```bash
git add client/src/nav.js client/src/main.js
git commit -m "feat: add nav module and main entry point"
```

---

## Task 13: Atualizar client/index.html

**Files:**
- Modify: `client/index.html`
- Delete: `client/app.js`

- [ ] **Step 1: Reescrever client/index.html**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@phosphor-icons/web"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css" />
  <script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
  <link rel="stylesheet" href="./styles.css">
</head>
<body>
  <!-- Modal de login (injetado pelo auth.js via JS) -->

  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <i class="ph-fill ph-paw-print"></i>
        <span>OpenClaw</span>
      </div>
      <nav class="nav-menu">
        <a href="#" class="nav-item active" data-target="overview">
          <i class="ph ph-squares-four"></i> Overview
        </a>
        <a href="#" class="nav-item" data-target="terminal">
          <i class="ph ph-terminal-window"></i> Terminal
        </a>
        <a href="#" class="nav-item" data-target="gateways">
          <i class="ph ph-network"></i> Gateways
        </a>
        <a href="#" class="nav-item" data-target="channels">
          <i class="ph ph-plugs"></i> Canais
        </a>
        <a href="#" class="nav-item" data-target="chat">
          <i class="ph ph-chat-circle-dots"></i> Chat
        </a>
        <a href="#" class="nav-item" data-target="sessions">
          <i class="ph ph-list-bullets"></i> Sessões
        </a>
        <a href="#" class="nav-item" data-target="settings">
          <i class="ph ph-gear"></i> Configurações
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="avatar">A</div>
          <div class="details">
            <span class="name">Athos (CoS)</span>
            <span class="role">Admin</span>
          </div>
        </div>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="search-bar">
          <i class="ph ph-magnifying-glass"></i>
          <input type="text" placeholder="Buscar logs, agentes ou tarefas...">
        </div>
        <div class="quick-actions">
          <button class="btn btn-secondary"><i class="ph ph-arrows-clockwise"></i> Restart</button>
          <button class="btn btn-secondary"><i class="ph ph-link"></i> Pairing</button>
          <button class="btn btn-primary"><i class="ph ph-download-simple"></i> Export Logs</button>
        </div>
      </header>

      <!-- View: Overview -->
      <div class="view active" id="view-overview">
        <div class="page-header">
          <h1>Monitoramento Operacional</h1>
          <p>Visão geral da saúde do gateway e integrações.</p>
        </div>
        <div class="grid-cards">
          <div class="kpi-card">
            <div class="kpi-header">
              <div class="icon-wrapper bg-green"><i class="ph ph-activity"></i></div>
              <span class="badge status-ok">Online</span>
            </div>
            <div class="kpi-body">
              <h3>Gateway</h3>
              <div class="kpi-value">—</div>
              <p class="kpi-subtext">Conecte um gateway para ver dados reais</p>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <div class="icon-wrapper bg-blue"><i class="ph ph-telegram-logo"></i></div>
              <span class="badge status-ok">—</span>
            </div>
            <div class="kpi-body">
              <h3>Telegram Ingest</h3>
              <div class="kpi-value">—</div>
              <p class="kpi-subtext">Sub-projeto 2</p>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <div class="icon-wrapper bg-purple"><i class="ph ph-waveform"></i></div>
              <span class="badge status-ok">—</span>
            </div>
            <div class="kpi-body">
              <h3>STT Pipeline</h3>
              <div class="kpi-value">—</div>
              <p class="kpi-subtext">Sub-projeto 2</p>
            </div>
          </div>
          <div class="kpi-card">
            <div class="kpi-header">
              <div class="icon-wrapper bg-red"><i class="ph ph-file-code"></i></div>
              <span class="badge status-ok">—</span>
            </div>
            <div class="kpi-body">
              <h3>Schema Validity</h3>
              <div class="kpi-value">—</div>
              <p class="kpi-subtext">Sub-projeto 2</p>
            </div>
          </div>
        </div>
      </div>

      <!-- View: Terminal -->
      <div class="view" id="view-terminal">
        <div class="page-header">
          <h1>Terminal Integrado</h1>
          <p>Conexão PTY nativa para o backend Node.</p>
        </div>
        <div class="panel" style="height:60vh;padding:0;overflow:hidden;background:#0f111a">
          <div id="terminal-container" style="width:100%;height:100%"></div>
        </div>
      </div>

      <!-- View: Gateways -->
      <div class="view" id="view-gateways"></div>

      <!-- View: Canais -->
      <div class="view" id="view-channels"></div>

      <!-- View: Chat -->
      <div class="view" id="view-chat"></div>

      <!-- View: Sessões -->
      <div class="view" id="view-sessions"></div>

      <!-- View: Configurações -->
      <div class="view" id="view-settings">
        <div class="page-header">
          <h1>Configurações</h1>
          <p>Configurações do dashboard.</p>
        </div>
        <div class="panel">
          <div class="panel-body" style="text-align:center;padding:3rem;color:var(--text-muted)">
            <i class="ph ph-gear" style="font-size:3rem;display:block;margin-bottom:1rem"></i>
            <strong>Em desenvolvimento</strong>
          </div>
        </div>
      </div>
    </main>
  </div>

  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Deletar client/app.js**

```bash
rm client/app.js
```

- [ ] **Step 3: Adicionar estilos do modal e gateways ao client/styles.css**

Adicionar ao final de `client/styles.css`:

```css
/* Auth Modal */
.auth-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.auth-modal-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 2rem;
  width: 100%;
  max-width: 400px;
  backdrop-filter: blur(20px);
}

.auth-modal-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  justify-content: center;
}

.auth-modal-logo i {
  font-size: 2rem;
  color: var(--accent, #7c6af7);
}

.auth-select,
.form-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  color: inherit;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
  box-sizing: border-box;
}

.auth-select:focus,
.form-input:focus {
  outline: none;
  border-color: var(--accent, #7c6af7);
}

/* Gateway List */
.gw-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  align-items: end;
}

.gw-form input:nth-child(1),
.gw-form input:nth-child(4) {
  grid-column: span 2;
}

.gw-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.gw-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.gw-item.gw-active {
  border-color: var(--accent, #7c6af7);
  background: rgba(124, 106, 247, 0.08);
}

.gw-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.gw-info span {
  font-size: 0.8rem;
  color: var(--text-muted, #888);
}

.gw-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-sm {
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
}
```

- [ ] **Step 4: Rodar o servidor e Vite juntos para testar**

Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
npm run client:dev
```

Abrir `http://localhost:5173` — deve carregar o dashboard, exibir o modal de login (ou o Overview se já tiver gateway ativo), e a view Terminal deve funcionar corretamente.

- [ ] **Step 5: Commit**

```bash
git add client/index.html client/styles.css
git rm client/app.js
git commit -m "feat: update index.html with new nav items, modal, and Vite entry point"
```

---

## Task 14: Commit final e verificação

- [ ] **Step 1: Rodar todos os testes**

```bash
npm test
```

Esperado: todos os testes em `server/db.test.ts` e `server/gateways-api.test.ts` passando.

- [ ] **Step 2: Verificar build do TypeScript**

```bash
npm run build
```

Esperado: arquivos gerados em `dist/`.

- [ ] **Step 3: Verificar build do frontend**

```bash
npm run client:build
```

Esperado: arquivos gerados em `dist/client/`.

- [ ] **Step 4: Testar em produção**

```bash
npm start
```

Abrir `http://localhost:3000` — deve servir o frontend do `dist/client/`.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: DashboardClaw Core complete — multi-gateway SQLite platform with Vite"
```
