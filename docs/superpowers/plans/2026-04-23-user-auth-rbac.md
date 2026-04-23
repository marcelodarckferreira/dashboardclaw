# User Auth + RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar autenticação de usuários com login/senha, sessões via token em localStorage, papéis (admin/operator/viewer) e permissões por recurso com override por usuário.

**Architecture:** Backend estende o banco SQLite com 3 tabelas (users, user_sessions, user_permissions), expõe endpoints de auth e CRUD de usuários, e adiciona middleware `requireUserAuth` que injeta `req.user`. Frontend detecta ausência de usuários (tela de setup), exige login, e esconde nav items conforme permissões.

**Tech Stack:** Node.js 20+, TypeScript, Express, better-sqlite3, bcryptjs, Vanilla JS ESM, vitest + supertest

---

## File Map

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modify | `server/db.ts` | Adicionar tabelas users, user_sessions, user_permissions |
| Modify | `server/db.test.ts` | Testes das novas tabelas |
| Create | `server/auth-api.ts` | Handlers: status, setup, login, logout, me |
| Create | `server/auth-api.test.ts` | Testes dos endpoints de auth |
| Create | `server/user-auth-middleware.ts` | requireUserAuth, requireAdmin, resolvePermissions, ROLE_DEFAULTS |
| Create | `server/user-auth-middleware.test.ts` | Testes do middleware |
| Create | `server/users-api.ts` | Router Express: CRUD usuários + permissões (admin only) |
| Create | `server/users-api.test.ts` | Testes da users API |
| Modify | `server/index.ts` | Wiring: novos imports, nova cadeia de middleware |
| Modify | `client/src/auth.js` | Telas de setup + login, Bearer token no interceptor |
| Create | `client/src/users.js` | View de gerenciamento de usuários (admin) |
| Modify | `client/src/nav.js` | Adicionar users ao VIEW_INITS, ocultar items por permissão |
| Modify | `client/index.html` | Nav item + view container para usuários |
| Modify | `client/styles.css` | Estilos: login card, setup card, users table |

---

## Task 1: Instalar bcryptjs

**Files:**
- Run: `npm install bcryptjs @types/bcryptjs`

- [ ] **Step 1: Instalar dependência**

```bash
npm install bcryptjs @types/bcryptjs
```

Esperado: `added N packages` sem erros.

- [ ] **Step 2: Verificar instalação**

```bash
node -e "const b = require('bcryptjs'); b.hash('test', 1).then(h => console.log('ok:', h.length > 10))"
```

Esperado: `ok: true`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bcryptjs dependency"
```

---

## Task 2: DB schema — users, user_sessions, user_permissions

**Files:**
- Modify: `server/db.ts`
- Modify: `server/db.test.ts`

- [ ] **Step 1: Escrever os testes que vão falhar**

Adicionar ao final de `server/db.test.ts`:

```typescript
describe("users schema", () => {
  it("creates users table with required columns", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("users");
    expect(names).toContain("user_sessions");
    expect(names).toContain("user_permissions");
  });

  it("enforces unique username", () => {
    db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
    ).run("alice", "hash", "admin");
    expect(() =>
      db
        .prepare(
          "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
        )
        .run("alice", "hash2", "viewer")
    ).toThrow();
  });

  it("cascades delete user_sessions when user deleted", () => {
    const { lastInsertRowid: uid } = db
      .prepare(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
      )
      .run("bob", "hash", "viewer");
    db.prepare(
      "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).run(uid, "tok123", "2099-01-01 00:00:00");
    db.prepare("DELETE FROM users WHERE id = ?").run(uid);
    const count = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM user_sessions WHERE user_id = ?"
        )
        .get(uid) as { c: number }
    ).c;
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

```bash
npm test -- server/db.test.ts
```

Esperado: FAIL — tabelas não existem.

- [ ] **Step 3: Adicionar tabelas ao schema em server/db.ts**

Localizar a constante `SCHEMA` e adicionar antes de `PRAGMA foreign_keys = ON;`:

```typescript
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'viewer',
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT    NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource TEXT    NOT NULL,
  action   TEXT    NOT NULL,
  PRIMARY KEY (user_id, resource)
);
```

- [ ] **Step 4: Rodar e confirmar verde**

```bash
npm test -- server/db.test.ts
```

Esperado: todos passando (incluindo os 3 anteriores).

- [ ] **Step 5: Commit**

```bash
git add server/db.ts server/db.test.ts
git commit -m "feat: add users, user_sessions, user_permissions tables"
```

---

## Task 3: User auth middleware

**Files:**
- Create: `server/user-auth-middleware.ts`
- Create: `server/user-auth-middleware.test.ts`

- [ ] **Step 1: Escrever testes que vão falhar**

Criar `server/user-auth-middleware.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response } from "express";
import request from "supertest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { initDb, closeDb } from "./db.js";
import {
  requireUserAuth,
  requireAdmin,
  resolvePermissions,
  ROLE_DEFAULTS,
} from "./user-auth-middleware.js";

let dbPath: string;
let db: ReturnType<typeof initDb>;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-uam-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  try { closeDb(db); } catch { /* ok */ }
  if (existsSync(dbPath)) unlinkSync(dbPath);
});

function insertUser(username: string, role: string) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
    .run(username, "hash", role);
  return Number(lastInsertRowid);
}

function insertToken(userId: number, token: string, expiresHoursFromNow = 24) {
  const exp = new Date(Date.now() + expiresHoursFromNow * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  db.prepare(
    "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
  ).run(userId, token, exp);
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.get("/protected", requireUserAuth(db), (req: Request, res: Response) => {
    res.json({ user: req.user });
  });
  app.get(
    "/admin-only",
    requireUserAuth(db),
    requireAdmin,
    (_req: Request, res: Response) => {
      res.json({ ok: true });
    }
  );
  return app;
}

describe("requireUserAuth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const res = await request(makeApp()).get("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown token", async () => {
    const res = await request(makeApp())
      .get("/protected")
      .set("Authorization", "Bearer unknowntoken");
    expect(res.status).toBe(401);
  });

  it("returns 401 for expired token", async () => {
    const uid = insertUser("alice", "viewer");
    insertToken(uid, "expiredtok", -1); // expired 1 hour ago
    const res = await request(makeApp())
      .get("/protected")
      .set("Authorization", "Bearer expiredtok");
    expect(res.status).toBe(401);
  });

  it("injects req.user for valid token", async () => {
    const uid = insertUser("bob", "operator");
    insertToken(uid, "validtok");
    const res = await request(makeApp())
      .get("/protected")
      .set("Authorization", "Bearer validtok");
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("bob");
    expect(res.body.user.role).toBe("operator");
    expect(typeof res.body.user.permissions).toBe("object");
  });

  it("returns 401 when user is disabled", async () => {
    const uid = insertUser("carol", "viewer");
    db.prepare("UPDATE users SET enabled = 0 WHERE id = ?").run(uid);
    insertToken(uid, "disabledtok");
    const res = await request(makeApp())
      .get("/protected")
      .set("Authorization", "Bearer disabledtok");
    expect(res.status).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("returns 403 when user is not admin", async () => {
    const uid = insertUser("dave", "operator");
    insertToken(uid, "operatortok");
    const res = await request(makeApp())
      .get("/admin-only")
      .set("Authorization", "Bearer operatortok");
    expect(res.status).toBe(403);
  });

  it("passes through for admin", async () => {
    const uid = insertUser("eve", "admin");
    insertToken(uid, "admintok");
    const res = await request(makeApp())
      .get("/admin-only")
      .set("Authorization", "Bearer admintok");
    expect(res.status).toBe(200);
  });
});

describe("resolvePermissions", () => {
  it("returns role defaults when no overrides", () => {
    const p = resolvePermissions("admin", []);
    expect(p.terminal).toBe("write");
    expect(p.users).toBe("write");
  });

  it("applies overrides on top of role defaults", () => {
    const p = resolvePermissions("viewer", [
      { resource: "terminal", action: "write" },
    ]);
    expect(p.terminal).toBe("write");
    expect(p.files).toBe("read"); // still viewer default
  });

  it("exports ROLE_DEFAULTS for all three roles", () => {
    expect(ROLE_DEFAULTS).toHaveProperty("admin");
    expect(ROLE_DEFAULTS).toHaveProperty("operator");
    expect(ROLE_DEFAULTS).toHaveProperty("viewer");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

```bash
npm test -- server/user-auth-middleware.test.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Criar server/user-auth-middleware.ts**

```typescript
import type { Request, Response, NextFunction } from "express";
import type BetterSqlite3 from "better-sqlite3";

export const ROLE_DEFAULTS: Record<string, Record<string, string>> = {
  admin: {
    terminal: "write", files: "write", gateways: "write",
    channels: "write", chat: "write", sessions: "write", users: "write",
  },
  operator: {
    terminal: "write", files: "write", gateways: "none",
    channels: "write", chat: "write", sessions: "write", users: "none",
  },
  viewer: {
    terminal: "none", files: "read", gateways: "none",
    channels: "read", chat: "read", sessions: "read", users: "none",
  },
};

export function resolvePermissions(
  role: string,
  overrides: Array<{ resource: string; action: string }>
): Record<string, string> {
  const base = { ...(ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.viewer) };
  for (const o of overrides) base[o.resource] = o.action;
  return base;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: string;
        permissions: Record<string, string>;
      };
    }
  }
}

export function requireUserAuth(db: BetterSqlite3.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    const token =
      header?.startsWith("Bearer ") ? header.slice(7).trim() : null;

    if (!token) {
      res.status(401).json({ error: "Missing authorization token" });
      return;
    }

    const row = db
      .prepare(
        `SELECT u.id, u.username, u.role, u.enabled
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .get(token) as
      | { id: number; username: string; role: string; enabled: number }
      | undefined;

    if (!row || !row.enabled) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const overrides = db
      .prepare(
        "SELECT resource, action FROM user_permissions WHERE user_id = ?"
      )
      .all(row.id) as Array<{ resource: string; action: string }>;

    req.user = {
      id: row.id,
      username: row.username,
      role: row.role,
      permissions: resolvePermissions(row.role, overrides),
    };

    next();
  };
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
```

- [ ] **Step 4: Rodar e confirmar verde**

```bash
npm test -- server/user-auth-middleware.test.ts
```

Esperado: todos passando.

- [ ] **Step 5: Commit**

```bash
git add server/user-auth-middleware.ts server/user-auth-middleware.test.ts
git commit -m "feat: add user auth middleware with role defaults and permission resolver"
```

---

## Task 4: Auth API (setup, status, login, logout, me)

**Files:**
- Create: `server/auth-api.ts`
- Create: `server/auth-api.test.ts`

- [ ] **Step 1: Escrever testes que vão falhar**

Criar `server/auth-api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { initDb, closeDb } from "./db.js";
import { createAuthApi } from "./auth-api.js";
import { requireUserAuth } from "./user-auth-middleware.js";

let dbPath: string;
let db: ReturnType<typeof initDb>;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-auth-api-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  try { closeDb(db); } catch { /* ok */ }
  if (existsSync(dbPath)) unlinkSync(dbPath);
});

function makeApp() {
  const app = express();
  app.use(express.json());
  const h = createAuthApi(db, { bcryptRounds: 1 });
  const userAuth = requireUserAuth(db);
  app.get("/api/auth/status", h.status);
  app.post("/api/auth/setup", h.setup);
  app.post("/api/auth/login", h.login);
  app.post("/api/auth/logout", userAuth, h.logout);
  app.get("/api/auth/me", userAuth, h.me);
  return app;
}

describe("GET /api/auth/status", () => {
  it("returns setup:true when no users exist", async () => {
    const res = await request(makeApp()).get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body.setup).toBe(true);
  });

  it("returns setup:false after a user is created", async () => {
    db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
    ).run("admin", "hash", "admin");
    const res = await request(makeApp()).get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body.setup).toBe(false);
    expect(res.body.authenticated).toBe(false);
  });
});

describe("POST /api/auth/setup", () => {
  it("creates admin user and returns token", async () => {
    const res = await request(makeApp())
      .post("/api/auth/setup")
      .send({ username: "admin", password: "password123" });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBe(64);
    expect(res.body.user.role).toBe("admin");
  });

  it("returns 409 when users already exist", async () => {
    db.prepare(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
    ).run("admin", "hash", "admin");
    const res = await request(makeApp())
      .post("/api/auth/setup")
      .send({ username: "admin2", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("returns 400 when password is shorter than 8 chars", async () => {
    const res = await request(makeApp())
      .post("/api/auth/setup")
      .send({ username: "admin", password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returns token for valid credentials", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "password123" });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.username).toBe("admin");
  });

  it("returns 401 for wrong password", async () => {
    const app = makeApp();
    await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "password123" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown username", async () => {
    const res = await request(makeApp())
      .post("/api/auth/login")
      .send({ username: "nobody", password: "pass" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("invalidates the token", async () => {
    const app = makeApp();
    const setupRes = await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "password123" });
    const { token } = setupRes.body as { token: string };

    await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`);

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(meRes.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns current user with permissions", async () => {
    const app = makeApp();
    const setupRes = await request(app)
      .post("/api/auth/setup")
      .send({ username: "admin", password: "password123" });
    const { token } = setupRes.body as { token: string };

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("admin");
    expect(res.body.permissions.terminal).toBe("write");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

```bash
npm test -- server/auth-api.test.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Criar server/auth-api.ts**

```typescript
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import type BetterSqlite3 from "better-sqlite3";
import { resolvePermissions } from "./user-auth-middleware.js";

interface AuthApiOptions {
  bcryptRounds?: number;
  sessionHours?: number;
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function expiresAt(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

function userCount(db: BetterSqlite3.Database): number {
  return (
    db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }
  ).c;
}

function buildUserPayload(
  db: BetterSqlite3.Database,
  userId: number,
  username: string,
  role: string
) {
  const overrides = db
    .prepare("SELECT resource, action FROM user_permissions WHERE user_id = ?")
    .all(userId) as Array<{ resource: string; action: string }>;
  return {
    id: userId,
    username,
    role,
    permissions: resolvePermissions(role, overrides),
  };
}

export function createAuthApi(
  db: BetterSqlite3.Database,
  options: AuthApiOptions = {}
) {
  const ROUNDS = options.bcryptRounds ?? 12;
  const SESSION_HOURS = options.sessionHours ?? 24;

  const status = (_req: Request, res: Response): void => {
    if (userCount(db) === 0) {
      res.json({ setup: true });
      return;
    }
    res.json({ setup: false, authenticated: false });
  };

  const setup = async (req: Request, res: Response): Promise<void> => {
    if (userCount(db) > 0) {
      res.status(409).json({ error: "Setup already complete" });
      return;
    }
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };
    if (!username || username.length < 3) {
      res.status(400).json({ error: "username must be at least 3 characters" });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: "password must be at least 8 characters" });
      return;
    }
    const hash = await bcrypt.hash(password, ROUNDS);
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
      )
      .run(username, hash, "admin");
    const userId = Number(lastInsertRowid);
    const token = generateToken();
    db.prepare(
      "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).run(userId, token, expiresAt(SESSION_HOURS));
    res.status(201).json({
      token,
      user: buildUserPayload(db, userId, username, "admin"),
    });
  };

  const login = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as {
      username?: string;
      password?: string;
    };
    if (!username || !password) {
      res.status(400).json({ error: "username and password required" });
      return;
    }
    const row = db
      .prepare(
        "SELECT id, username, password_hash, role, enabled FROM users WHERE username = ?"
      )
      .get(username) as
      | {
          id: number;
          username: string;
          password_hash: string;
          role: string;
          enabled: number;
        }
      | undefined;

    if (!row || !row.enabled) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = generateToken();
    db.prepare(
      "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)"
    ).run(row.id, token, expiresAt(SESSION_HOURS));
    res.json({
      token,
      user: buildUserPayload(db, row.id, row.username, row.role),
    });
  };

  const logout = (req: Request, res: Response): void => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (token) {
      db.prepare("DELETE FROM user_sessions WHERE token = ?").run(token);
    }
    res.json({ ok: true });
  };

  const me = (req: Request, res: Response): void => {
    res.json(req.user);
  };

  return { status, setup, login, logout, me };
}
```

- [ ] **Step 4: Rodar e confirmar verde**

```bash
npm test -- server/auth-api.test.ts
```

Esperado: todos passando.

- [ ] **Step 5: Commit**

```bash
git add server/auth-api.ts server/auth-api.test.ts
git commit -m "feat: add auth API (setup, login, logout, status, me)"
```

---

## Task 5: Users API (CRUD + permissões, admin only)

**Files:**
- Create: `server/users-api.ts`
- Create: `server/users-api.test.ts`

- [ ] **Step 1: Escrever testes que vão falhar**

Criar `server/users-api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { initDb, closeDb } from "./db.js";
import { createUsersApi } from "./users-api.js";
import { requireUserAuth, requireAdmin } from "./user-auth-middleware.js";

let dbPath: string;
let db: ReturnType<typeof initDb>;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-users-api-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  try { closeDb(db); } catch { /* ok */ }
  if (existsSync(dbPath)) unlinkSync(dbPath);
});

function insertUser(username: string, role: string, token: string) {
  const hash = bcrypt.hashSync(username, 1);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
    .run(username, hash, role);
  const uid = Number(lastInsertRowid);
  const exp = new Date(Date.now() + 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  db.prepare("INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)").run(uid, token, exp);
  return uid;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  const userAuth = requireUserAuth(db);
  app.use("/api/users", userAuth, requireAdmin, createUsersApi(db));
  return app;
}

describe("GET /api/users", () => {
  it("returns 403 for non-admin", async () => {
    insertUser("op", "operator", "optok");
    const res = await request(makeApp())
      .get("/api/users")
      .set("Authorization", "Bearer optok");
    expect(res.status).toBe(403);
  });

  it("returns user list for admin", async () => {
    insertUser("admin", "admin", "admintok");
    insertUser("viewer", "viewer", "viewtok");
    const res = await request(makeApp())
      .get("/api/users")
      .set("Authorization", "Bearer admintok");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).not.toHaveProperty("password_hash");
  });
});

describe("POST /api/users", () => {
  it("creates a new user", async () => {
    insertUser("admin", "admin", "admintok");
    const res = await request(makeApp())
      .post("/api/users")
      .set("Authorization", "Bearer admintok")
      .send({ username: "newuser", password: "password123", role: "viewer" });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe("newuser");
    expect(res.body.role).toBe("viewer");
    expect(res.body).not.toHaveProperty("password_hash");
  });

  it("returns 400 for missing fields", async () => {
    insertUser("admin", "admin", "admintok");
    const res = await request(makeApp())
      .post("/api/users")
      .set("Authorization", "Bearer admintok")
      .send({ username: "x" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/users/:id", () => {
  it("updates username and role", async () => {
    const adminId = insertUser("admin", "admin", "admintok");
    const viewerId = insertUser("viewer", "viewer", "viewtok");
    const res = await request(makeApp())
      .put(`/api/users/${viewerId}`)
      .set("Authorization", "Bearer admintok")
      .send({ username: "viewer2", role: "operator" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("viewer2");
    expect(res.body.role).toBe("operator");
    void adminId;
  });
});

describe("DELETE /api/users/:id", () => {
  it("deletes another user", async () => {
    insertUser("admin", "admin", "admintok");
    const viewerId = insertUser("viewer", "viewer", "viewtok");
    const res = await request(makeApp())
      .delete(`/api/users/${viewerId}`)
      .set("Authorization", "Bearer admintok");
    expect(res.status).toBe(200);
    const count = (db.prepare("SELECT COUNT(*) as c FROM users WHERE id = ?").get(viewerId) as { c: number }).c;
    expect(count).toBe(0);
  });

  it("returns 403 when admin tries to delete themselves", async () => {
    const adminId = insertUser("admin", "admin", "admintok");
    const res = await request(makeApp())
      .delete(`/api/users/${adminId}`)
      .set("Authorization", "Bearer admintok");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/users/:id/permissions", () => {
  it("returns empty array when no custom permissions", async () => {
    insertUser("admin", "admin", "admintok");
    const viewerId = insertUser("viewer", "viewer", "viewtok");
    const res = await request(makeApp())
      .get(`/api/users/${viewerId}/permissions`)
      .set("Authorization", "Bearer admintok");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("PUT /api/users/:id/permissions", () => {
  it("sets custom permissions for user", async () => {
    insertUser("admin", "admin", "admintok");
    const viewerId = insertUser("viewer", "viewer", "viewtok");
    const res = await request(makeApp())
      .put(`/api/users/${viewerId}/permissions`)
      .set("Authorization", "Bearer admintok")
      .send([{ resource: "terminal", action: "write" }]);
    expect(res.status).toBe(200);
    const row = db
      .prepare("SELECT action FROM user_permissions WHERE user_id = ? AND resource = ?")
      .get(viewerId, "terminal") as { action: string } | undefined;
    expect(row?.action).toBe("write");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

```bash
npm test -- server/users-api.test.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Criar server/users-api.ts**

```typescript
import express from "express";
import bcrypt from "bcryptjs";
import type BetterSqlite3 from "better-sqlite3";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  enabled: number;
  created_at: string;
}

function toPublic(row: UserRow) {
  const { password_hash: _h, ...pub } = row;
  return pub;
}

const VALID_ROLES = ["admin", "operator", "viewer"];
const VALID_RESOURCES = ["terminal", "files", "gateways", "channels", "chat", "sessions", "users"];
const VALID_ACTIONS = ["read", "write", "none"];

export function createUsersApi(db: BetterSqlite3.Database): express.Router {
  const router = express.Router();

  router.get("/", (_req, res) => {
    const rows = db
      .prepare("SELECT id, username, role, enabled, created_at FROM users ORDER BY created_at")
      .all();
    res.json(rows);
  });

  router.post("/", async (req, res) => {
    const { username, password, role } = req.body as {
      username?: string;
      password?: string;
      role?: string;
    };
    if (!username || username.length < 3) {
      res.status(400).json({ error: "username must be at least 3 characters" });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: "password must be at least 8 characters" });
      return;
    }
    if (!role || !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    try {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
        .run(username, hash, role);
      const row = db
        .prepare("SELECT id, username, role, enabled, created_at FROM users WHERE id = ?")
        .get(lastInsertRowid) as UserRow;
      res.status(201).json(toPublic(row));
    } catch {
      res.status(409).json({ error: "Username already taken" });
    }
  });

  router.put("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { username, password, role, enabled } = req.body as {
      username?: string;
      password?: string;
      role?: string;
      enabled?: boolean;
    };
    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
      return;
    }
    if (username) {
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, id);
    }
    if (role) {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
    }
    if (typeof enabled === "boolean") {
      db.prepare("UPDATE users SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
    }
    if (password) {
      if (password.length < 8) {
        res.status(400).json({ error: "password must be at least 8 characters" });
        return;
      }
      const hash = await bcrypt.hash(password, 12);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
    }
    const row = db
      .prepare("SELECT id, username, role, enabled, created_at FROM users WHERE id = ?")
      .get(id) as UserRow | undefined;
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(toPublic(row));
  });

  router.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (req.user?.id === id) {
      res.status(403).json({ error: "Cannot delete yourself" });
      return;
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  router.get("/:id/permissions", (req, res) => {
    const id = Number(req.params.id);
    const rows = db
      .prepare("SELECT resource, action FROM user_permissions WHERE user_id = ?")
      .all(id);
    res.json(rows);
  });

  router.put("/:id/permissions", (req, res) => {
    const id = Number(req.params.id);
    const perms = req.body as Array<{ resource: string; action: string }>;
    if (!Array.isArray(perms)) {
      res.status(400).json({ error: "Body must be an array of {resource, action}" });
      return;
    }
    for (const p of perms) {
      if (!VALID_RESOURCES.includes(p.resource) || !VALID_ACTIONS.includes(p.action)) {
        res.status(400).json({ error: `Invalid resource or action: ${p.resource}/${p.action}` });
        return;
      }
    }
    db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(id);
    const insert = db.prepare(
      "INSERT INTO user_permissions (user_id, resource, action) VALUES (?, ?, ?)"
    );
    for (const p of perms) insert.run(id, p.resource, p.action);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 4: Rodar e confirmar verde**

```bash
npm test -- server/users-api.test.ts
```

Esperado: todos passando.

- [ ] **Step 5: Rodar suite completa**

```bash
npm test
```

Esperado: todos passando.

- [ ] **Step 6: Commit**

```bash
git add server/users-api.ts server/users-api.test.ts
git commit -m "feat: add users API with CRUD and per-user permission overrides"
```

---

## Task 6: Wiring server/index.ts

**Files:**
- Modify: `server/index.ts`

- [ ] **Step 1: Atualizar imports e rota mounting**

Substituir o conteúdo de `server/index.ts` por:

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
import { createAuthApi } from "./auth-api.js";
import { createUsersApi } from "./users-api.js";
import { requireUserAuth, requireAdmin } from "./user-auth-middleware.js";
import { requireGatewayAuth } from "./auth-middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json());

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

const dbPath = resolve(process.cwd(), "dashboardclaw.db");
const db = initDb(dbPath);
logger.info(`Database: ${dbPath}`);

const authHandlers = createAuthApi(db);
const userAuth = requireUserAuth(db);
const gatewayAuth = requireGatewayAuth(db);

// ── Public auth routes ─────────────────────────────────────────────
app.get("/api/auth/status", authHandlers.status);
app.post("/api/auth/setup", authHandlers.setup);
app.post("/api/auth/login", authHandlers.login);

// ── Protected auth routes ──────────────────────────────────────────
app.post("/api/auth/logout", userAuth, authHandlers.logout);
app.get("/api/auth/me", userAuth, authHandlers.me);

// ── Users API (admin only) ─────────────────────────────────────────
app.use("/api/users", userAuth, requireAdmin, createUsersApi(db));

// ── Gateways: GET public (bootstrap), mutations require user auth ──
app.use("/api/gateways", (req, res, next) => {
  if (req.method === "GET") return next();
  return userAuth(req, res, next);
}, createGatewaysApi(db));

// ── All other APIs: user auth + gateway auth ───────────────────────
app.use("/api/channels", userAuth, gatewayAuth, createChannelsApi(db));
app.use("/api/agent-sessions", userAuth, gatewayAuth, createAgentSessionsApi(db));
app.use("/api/chat", userAuth, gatewayAuth, createChatApi(db));

// File API
const fileApiHandler = createFileApiHandler({
  workspaceDir,
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  maxUploadSize: 50 * 1024 * 1024,
});
app.use("/api/files", userAuth, gatewayAuth, async (req, res) => {
  const originalUrl = req.url;
  req.url = `/dashboardclaw/api/files${originalUrl === "/" ? "" : originalUrl}`;
  const handled = await fileApiHandler(req, res, req.url.split("?")[0]);
  if (!handled && !res.headersSent) res.status(404).json({ error: "Not found" });
});

// Terminal API
const terminalManager = createTerminalManager(logger, workspaceDir);
app.use("/api/terminal", userAuth, gatewayAuth, async (req, res) => {
  const subpath = req.url.split("?")[0];
  const handled = await terminalManager.handleRequest(req, res, subpath);
  if (!handled && !res.headersSent) res.status(404).json({ error: "Not found" });
});

// Static frontend
const clientDist = resolve(__dirname, "../dist/client");
const clientDev = resolve(__dirname, "../client");
const staticDir = existsSync(clientDist) ? clientDist : clientDev;
app.use(express.static(staticDir));

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
  logger.info(`-> Auth API:     http://localhost:${port}/api/auth`);
  logger.info(`-> Users API:    http://localhost:${port}/api/users`);
  logger.info(`-> Gateways API: http://localhost:${port}/api/gateways`);
  logger.info(`-> File API:     http://localhost:${port}/api/files`);
  logger.info(`-> Terminal API: http://localhost:${port}/api/terminal`);
  logger.info(`-> Static:       ${staticDir}`);
});
```

- [ ] **Step 2: Verificar TypeScript e testes**

```bash
npx tsc --noEmit && npm test
```

Esperado: sem erros de TS, todos os testes passando.

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: wire user auth, users API, and CORS fix in index.ts"
```

---

## Task 7: Frontend — auth.js (setup + login + Bearer token)

**Files:**
- Modify: `client/src/auth.js`

- [ ] **Step 1: Substituir client/src/auth.js**

```javascript
const TOKEN_KEY = "dashboard_token";
const PERMS_KEY = "dashboard_permissions";
const GW_KEY = "dashboardclaw_active_gateway";

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getPermissions() {
  try { return JSON.parse(localStorage.getItem(PERMS_KEY) || "{}"); } catch { return {}; }
}
export function getActiveGatewayId() {
  const v = localStorage.getItem(GW_KEY); return v ? Number(v) : null;
}
export function setActiveGateway(id) { localStorage.setItem(GW_KEY, String(id)); }
export function clearActiveGateway() { localStorage.removeItem(GW_KEY); }

function saveSession(token, permissions) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PERMS_KEY, JSON.stringify(permissions));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PERMS_KEY);
  localStorage.removeItem(GW_KEY);
}

// ── Fetch interceptor ──────────────────────────────────────────────

export function installFetchInterceptor() {
  const orig = window.fetch.bind(window);
  window.fetch = function (resource, config = {}) {
    if (typeof resource === "string" && resource.startsWith("/api")) {
      const headers = { ...(config.headers || {}) };
      const token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const gwId = getActiveGatewayId();
      if (gwId) headers["X-Gateway-Id"] = String(gwId);
      config = { ...config, headers };
    }
    return orig(resource, config);
  };

  // On 401 redirect to login (token expired)
  const origFetch = window.fetch.bind(window);
  window.fetch = async function (resource, config) {
    const res = await origFetch(resource, config);
    if (res.status === 401 && typeof resource === "string" && resource.startsWith("/api") && resource !== "/api/auth/login") {
      clearSession();
      showLogin();
    }
    return res;
  };
}

// ── Setup screen ───────────────────────────────────────────────────

function showSetup() {
  removeScreens();
  const el = document.createElement("div");
  el.id = "auth-screen";
  el.className = "auth-overlay";
  el.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo"><i class="ph-fill ph-paw-print"></i><span>OpenClaw</span></div>
      <h2>Configuração inicial</h2>
      <p class="auth-subtitle">Crie o usuário administrador para continuar.</p>
      <div class="auth-field">
        <label>Username</label>
        <input id="setup-user" type="text" autocomplete="username" placeholder="admin">
      </div>
      <div class="auth-field">
        <label>Senha (mín. 8 caracteres)</label>
        <input id="setup-pass" type="password" autocomplete="new-password" placeholder="••••••••">
      </div>
      <div class="auth-field">
        <label>Confirmar senha</label>
        <input id="setup-pass2" type="password" autocomplete="new-password" placeholder="••••••••">
      </div>
      <p class="auth-error hidden" id="setup-err"></p>
      <button class="btn btn-primary" style="width:100%" id="setup-btn">Criar administrador</button>
    </div>
  `;
  document.body.appendChild(el);

  document.getElementById("setup-btn").addEventListener("click", async () => {
    const username = document.getElementById("setup-user").value.trim();
    const pass = document.getElementById("setup-pass").value;
    const pass2 = document.getElementById("setup-pass2").value;
    const err = document.getElementById("setup-err");
    err.classList.add("hidden");

    if (pass !== pass2) { showError(err, "As senhas não coincidem."); return; }
    if (pass.length < 8) { showError(err, "Senha deve ter ao menos 8 caracteres."); return; }

    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pass }),
    });
    const data = await res.json();
    if (!res.ok) { showError(err, data.error || "Erro ao criar administrador."); return; }
    saveSession(data.token, data.user.permissions);
    removeScreens();
    await showGatewayModal();
  });
}

// ── Login screen ───────────────────────────────────────────────────

function showLogin() {
  removeScreens();
  const el = document.createElement("div");
  el.id = "auth-screen";
  el.className = "auth-overlay";
  el.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo"><i class="ph-fill ph-paw-print"></i><span>OpenClaw</span></div>
      <h2>Entrar</h2>
      <div class="auth-field">
        <label>Username</label>
        <input id="login-user" type="text" autocomplete="username" placeholder="admin">
      </div>
      <div class="auth-field">
        <label>Senha</label>
        <input id="login-pass" type="password" autocomplete="current-password" placeholder="••••••••">
      </div>
      <p class="auth-error hidden" id="login-err"></p>
      <button class="btn btn-primary" style="width:100%" id="login-btn">Entrar</button>
    </div>
  `;
  document.body.appendChild(el);

  async function doLogin() {
    const username = document.getElementById("login-user").value.trim();
    const password = document.getElementById("login-pass").value;
    const err = document.getElementById("login-err");
    err.classList.add("hidden");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { showError(err, data.error || "Credenciais inválidas."); return; }
    saveSession(data.token, data.user.permissions);
    removeScreens();
    await showGatewayModal();
  }

  document.getElementById("login-btn").addEventListener("click", doLogin);
  document.getElementById("login-pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

// ── Gateway modal (preservado do fluxo anterior) ───────────────────

async function showGatewayModal() {
  const activeId = getActiveGatewayId();
  if (activeId) return;
  let gateways = [];
  try {
    const res = await fetch("/api/gateways");
    if (res.ok) gateways = await res.json();
  } catch { /* backend not ready */ }

  const modal = document.createElement("div");
  modal.id = "auth-modal";
  modal.className = "auth-modal-overlay";
  modal.innerHTML = `
    <div class="auth-modal-card">
      <div class="auth-modal-logo"><i class="ph-fill ph-paw-print"></i><span>OpenClaw</span></div>
      <h2>Conectar ao Gateway</h2>
      ${gateways.length > 0 ? `
        <select id="auth-gateway-select" class="auth-select">
          <option value="">Selecione um gateway...</option>
          ${gateways.map((g) => `<option value="${g.id}">${escapeHtml(g.name)} — ${escapeHtml(g.host)}:${g.port}</option>`).join("")}
        </select>
        <button id="auth-connect-btn" class="btn btn-primary" style="width:100%;margin-top:1rem">
          <i class="ph ph-plug"></i> Conectar
        </button>
        <hr style="margin:1rem 0;border-color:rgba(255,255,255,0.1)">` : ""}
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
    });
  }
  document.getElementById("auth-add-gw-btn")?.addEventListener("click", () => {
    modal.remove();
    document.querySelector('[data-target="gateways"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// ── Helpers ────────────────────────────────────────────────────────

function removeScreens() {
  document.getElementById("auth-screen")?.remove();
  document.getElementById("auth-modal")?.remove();
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Entry point ────────────────────────────────────────────────────

export async function initAuth() {
  installFetchInterceptor();

  const statusRes = await fetch("/api/auth/status");
  const status = await statusRes.json();

  if (status.setup) {
    showSetup();
    return;
  }

  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  const meRes = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) {
    clearSession();
    showLogin();
    return;
  }
  const me = await meRes.json();
  saveSession(token, me.permissions);

  await showGatewayModal();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/auth.js
git commit -m "feat: auth.js — setup screen, login screen, Bearer token interceptor"
```

---

## Task 8: Frontend — users.js (view de gerenciamento, admin)

**Files:**
- Create: `client/src/users.js`

- [ ] **Step 1: Criar client/src/users.js**

```javascript
import { getPermissions } from "./auth.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadUsers() {
  const res = await fetch("/api/users");
  if (!res.ok) return [];
  return res.json();
}

async function loadPermissions(userId) {
  const res = await fetch(`/api/users/${userId}/permissions`);
  if (!res.ok) return [];
  return res.json();
}

const RESOURCES = ["terminal", "files", "gateways", "channels", "chat", "sessions", "users"];
const ACTIONS = ["write", "read", "none"];
const ROLES = ["admin", "operator", "viewer"];

function renderPermissionEditor(perms) {
  return RESOURCES.map((r) => {
    const current = perms.find((p) => p.resource === r)?.action ?? "default";
    return `
      <div class="perm-row">
        <span class="perm-resource">${r}</span>
        <select class="perm-select" data-resource="${r}">
          <option value="default" ${current === "default" ? "selected" : ""}>Padrão do papel</option>
          ${ACTIONS.map((a) => `<option value="${a}" ${current === a ? "selected" : ""}>${a}</option>`).join("")}
        </select>
      </div>
    `;
  }).join("");
}

function openEditModal(user, view) {
  document.getElementById("users-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "users-modal";
  modal.className = "auth-modal-overlay";
  modal.innerHTML = `
    <div class="auth-modal-card" style="max-width:480px;width:100%">
      <h2>Editar usuário</h2>
      <div class="auth-field">
        <label>Username</label>
        <input id="edit-username" type="text" value="${escapeHtml(user.username)}">
      </div>
      <div class="auth-field">
        <label>Nova senha (deixe vazio para não alterar)</label>
        <input id="edit-password" type="password" placeholder="••••••••">
      </div>
      <div class="auth-field">
        <label>Papel</label>
        <select id="edit-role">
          ${ROLES.map((r) => `<option value="${r}" ${user.role === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      <div class="auth-field">
        <label style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="edit-enabled" ${user.enabled ? "checked" : ""}> Ativo
        </label>
      </div>
      <details class="perm-accordion">
        <summary>Permissões personalizadas</summary>
        <div id="perm-editor">Carregando...</div>
      </details>
      <p class="auth-error hidden" id="edit-err"></p>
      <div style="display:flex;gap:8px;margin-top:1rem">
        <button class="btn btn-primary" id="edit-save">Salvar</button>
        <button class="btn btn-secondary" id="edit-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  loadPermissions(user.id).then((perms) => {
    document.getElementById("perm-editor").innerHTML = renderPermissionEditor(perms);
  });

  document.getElementById("edit-cancel").addEventListener("click", () => modal.remove());

  document.getElementById("edit-save").addEventListener("click", async () => {
    const err = document.getElementById("edit-err");
    err.classList.add("hidden");

    const body = {
      username: document.getElementById("edit-username").value.trim(),
      role: document.getElementById("edit-role").value,
      enabled: document.getElementById("edit-enabled").checked,
    };
    const pass = document.getElementById("edit-password").value;
    if (pass) body.password = pass;

    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json();
      err.textContent = d.error || "Erro ao salvar.";
      err.classList.remove("hidden");
      return;
    }

    // Save permissions
    const selects = document.querySelectorAll(".perm-select");
    const perms = [];
    selects.forEach((sel) => {
      if (sel.value !== "default") {
        perms.push({ resource: sel.dataset.resource, action: sel.value });
      }
    });
    await fetch(`/api/users/${user.id}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perms),
    });

    modal.remove();
    renderUsers(view);
  });
}

function openCreateModal(view) {
  document.getElementById("users-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "users-modal";
  modal.className = "auth-modal-overlay";
  modal.innerHTML = `
    <div class="auth-modal-card" style="max-width:400px;width:100%">
      <h2>Novo usuário</h2>
      <div class="auth-field">
        <label>Username</label>
        <input id="new-username" type="text" placeholder="username">
      </div>
      <div class="auth-field">
        <label>Senha</label>
        <input id="new-password" type="password" placeholder="••••••••">
      </div>
      <div class="auth-field">
        <label>Papel</label>
        <select id="new-role">
          ${ROLES.map((r) => `<option value="${r}">${r}</option>`).join("")}
        </select>
      </div>
      <p class="auth-error hidden" id="new-err"></p>
      <div style="display:flex;gap:8px;margin-top:1rem">
        <button class="btn btn-primary" id="new-save">Criar</button>
        <button class="btn btn-secondary" id="new-cancel">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("new-cancel").addEventListener("click", () => modal.remove());
  document.getElementById("new-save").addEventListener("click", async () => {
    const err = document.getElementById("new-err");
    err.classList.add("hidden");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("new-username").value.trim(),
        password: document.getElementById("new-password").value,
        role: document.getElementById("new-role").value,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      err.textContent = d.error || "Erro ao criar.";
      err.classList.remove("hidden");
      return;
    }
    modal.remove();
    renderUsers(view);
  });
}

async function renderUsers(view) {
  const users = await loadUsers();
  view.innerHTML = `
    <div class="page-header">
      <h1>Usuários</h1>
      <button class="btn btn-primary" id="users-add-btn">
        <i class="ph ph-plus"></i> Novo usuário
      </button>
    </div>
    <div class="panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th><th>Papel</th><th>Status</th><th>Criado em</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td>${escapeHtml(u.username)}</td>
              <td><span class="badge">${u.role}</span></td>
              <td><span class="badge ${u.enabled ? "status-ok" : "status-error"}">${u.enabled ? "Ativo" : "Inativo"}</span></td>
              <td>${new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
              <td>
                <button class="btn btn-secondary btn-sm" data-edit="${u.id}">Editar</button>
                <button class="btn btn-secondary btn-sm" data-delete="${u.id}" style="color:var(--status-error)">Remover</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("users-add-btn").addEventListener("click", () => openCreateModal(view));

  view.querySelectorAll("[data-edit]").forEach((btn) => {
    const user = users.find((u) => u.id === Number(btn.dataset.edit));
    if (user) btn.addEventListener("click", () => openEditModal(user, view));
  });

  view.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remover este usuário?")) return;
      await fetch(`/api/users/${btn.dataset.delete}`, { method: "DELETE" });
      renderUsers(view);
    });
  });
}

export function initUsers() {
  const view = document.getElementById("view-users");
  if (!view) return;
  renderUsers(view);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/users.js
git commit -m "feat: add users management view (admin only)"
```

---

## Task 9: Frontend — index.html + styles.css + nav.js

**Files:**
- Modify: `client/index.html`
- Modify: `client/src/nav.js`
- Modify: `client/styles.css`

- [ ] **Step 1: Adicionar nav item e view container em client/index.html**

Localizar o nav item de settings:
```html
        <a href="#" class="nav-item" data-target="settings">
          <i class="ph ph-gear"></i> Configurações
        </a>
```

Adicionar antes dele:
```html
        <a href="#" class="nav-item" data-target="users" data-requires-perm="users">
          <i class="ph ph-users"></i> Usuários
        </a>
```

Localizar `<!-- View: Configurações -->` e adicionar antes:
```html
      <!-- View: Usuários (rendered by users.js) -->
      <div class="view" id="view-users"></div>
```

- [ ] **Step 2: Atualizar client/src/nav.js**

Substituir o conteúdo de `client/src/nav.js`:

```javascript
import { initTerminalManager } from "./terminal-manager.js";
import { initGateways } from "./gateways.js";
import { initChannels } from "./channels.js";
import { initChat } from "./chat.js";
import { initAgentSessions } from "./agent-sessions.js";
import { initUsers } from "./users.js";
import { getPermissions } from "./auth.js";

const VIEW_INITS = {
  terminal: initTerminalManager,
  gateways: initGateways,
  channels: initChannels,
  chat: initChat,
  sessions: initAgentSessions,
  users: initUsers,
};

const initialized = new Set();

export function initNav() {
  const perms = getPermissions();

  // Hide nav items the current user has no access to
  document.querySelectorAll(".nav-item[data-requires-perm]").forEach((item) => {
    const resource = item.dataset.requiresPerm;
    if (perms[resource] === "none" || perms[resource] === undefined) {
      item.style.display = "none";
    }
  });

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

- [ ] **Step 3: Adicionar CSS ao final de client/styles.css**

```css
/* ── Auth screens (login / setup) ───────────────────────────────── */
.auth-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 12, 20, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.auth-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2.5rem;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

.auth-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--primary);
  margin-bottom: 1.5rem;
}

.auth-logo i { font-size: 1.8rem; }

.auth-card h2 {
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
  color: var(--text-main);
}

.auth-subtitle {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin-bottom: 1.5rem;
}

.auth-field {
  margin-bottom: 1rem;
}

.auth-field label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
}

.auth-field input,
.auth-field select,
.auth-select {
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  color: var(--text-main);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
  font-family: "Inter", sans-serif;
}

.auth-field input:focus,
.auth-select:focus {
  border-color: var(--primary);
}

.auth-error {
  color: var(--status-error);
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}

.auth-error.hidden { display: none; }

/* ── Users view ─────────────────────────────────────────────────── */
.perm-accordion {
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.75rem;
}

.perm-accordion summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-muted);
  user-select: none;
}

.perm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border);
}

.perm-row:last-child { border-bottom: none; }

.perm-resource {
  font-size: 0.82rem;
  color: var(--text-main);
  font-family: monospace;
}

.perm-select {
  width: auto;
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-main);
}
```

- [ ] **Step 4: Commit**

```bash
git add client/index.html client/src/nav.js client/styles.css
git commit -m "feat: add users nav item, view container, permission-based nav hiding, auth/users CSS"
```

---

## Task 10: Verificação final

**Files:** nenhum — só verificação.

- [ ] **Step 1: Rodar todos os testes**

```bash
npm test
```

Esperado: todos passando (db: 7, auth-middleware: 4, auth-api: ~9, user-auth-middleware: ~8, users-api: ~6, gateways-api: 8, terminal-api: 6 = 48+ testes).

- [ ] **Step 2: TypeScript sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Iniciar servidor e testar no browser**

```bash
npm run dev
```

Em outro terminal:
```bash
npm run client:dev
```

Abrir `http://localhost:5173` e verificar:
- Primeira visita → tela de setup
- Criar admin → redireciona para modal de gateway
- Logout via `localStorage.clear()` no console → recarregar → tela de login
- Login com credenciais corretas → acesso ao dashboard
- Login com credenciais erradas → mensagem de erro inline
- View Usuários aparece no nav (admin)
- Criar usuário `operator` e logar com ele → nav de Usuários não aparece
- Editar usuário → modal com permissões granulares funciona

- [ ] **Step 4: Push final**

```bash
git push origin master
```
