# Terminal Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o terminal único do DashboardClaw em um gerenciador multi-tab com presets de CLIs (Claude, Codex, Gemini, OpenClaw) e uma API embutível para outras views.

**Architecture:** Backend estende `terminal-api.ts` separando spawn de stream (dois passos: POST /spawn → GET /stream?sid), adicionando list e kill. Frontend tem dois módulos: `TerminalTab` (ciclo de vida de uma instância xterm.js+SSE) e `TerminalManager` (tab bar + presets + API pública embutível).

**Tech Stack:** Node.js 20+, TypeScript (server), node-pty, xterm.js 5, xterm-addon-fit 0.8, Vanilla JS ESM (client), vitest + supertest (testes)

---

## File Map

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Modify | `server/terminal-api.ts` | Adicionar spawn, sessions, kill; stream aceita `?sid` |
| Create | `server/terminal-api.test.ts` | Testes dos novos endpoints |
| Create | `client/src/terminal-tab.js` | Ciclo de vida de uma tab: spawn → SSE → xterm → close |
| Create | `client/src/terminal-manager.js` | Tab bar, presets, API pública `openEmbedded` |
| Delete | `client/src/terminal.js` | Substituído pelos dois módulos acima |
| Modify | `client/src/nav.js` | Importar `initTerminalManager` em vez de `initTerminal` |
| Modify | `client/index.html` | Simplificar `#view-terminal` para container vazio |
| Modify | `client/styles.css` | Adicionar estilos de terminal manager |

---

## Task 1: Refatorar terminal-api.ts — separar spawn de stream

**Files:**
- Modify: `server/terminal-api.ts`

### Contexto

O `TerminalSession` atual captura `res` (a SSE response) em closure no momento do spawn. Com a separação em dois passos, `res` começa como `null` e é preenchido quando o SSE conecta. A função `onData` do PTY referencia `session.res` dinamicamente em vez de capturar em closure.

- [ ] **Step 1: Atualizar a interface TerminalSession e extrair cleanupSession**

Localizar a interface `TerminalSession` (linha ~165) e substituir pelo bloco abaixo. Logo após, adicionar a função `cleanupSession` como função interna da factory (dentro de `createTerminalManager`, após a declaração de `sessions`):

```typescript
interface TerminalSession {
  sid: string;
  name: string;
  command: string;
  startedAt: number;
  pty: IPty;
  res: ServerResponse | null;
  keepaliveTimer: ReturnType<typeof setInterval> | null;
  cleaned: boolean;
}
```

Dentro de `createTerminalManager`, logo após `const sessions = new Map<string, TerminalSession>();`, adicionar:

```typescript
function cleanupSession(session: TerminalSession): void {
  if (session.cleaned) return;
  session.cleaned = true;
  if (session.keepaliveTimer) clearInterval(session.keepaliveTimer);
  try { session.res?.end(); } catch { /* already closed */ }
  try { session.pty.kill(); } catch { /* already exited */ }
  sessions.delete(session.sid);
  logger.debug(`Terminal: session ${session.sid} cleaned up`);
}
```

- [ ] **Step 2: Adicionar handleSpawn**

Adicionar a função `handleSpawn` dentro de `createTerminalManager`, antes de `handleStream`:

```typescript
async function handleSpawn(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const available = await loadPty(logger);
  if (!available || !_pty) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "node-pty is not installed. Run: npm install node-pty",
      }),
    );
    return;
  }

  const body = await readBody(req);
  let parsed: {
    name?: string;
    command?: string;
    args?: string[];
    cwd?: string;
  } = {};
  try {
    parsed = JSON.parse(body || "{}");
  } catch {
    /* use defaults */
  }

  const shell =
    parsed.command ||
    process.env.SHELL ||
    (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
  const args = parsed.command ? (parsed.args ?? []) : [];
  const cwd = parsed.cwd || workspaceDir;
  const name = parsed.name || shell;

  let proc: IPty;
  try {
    proc = _pty.spawn(shell, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: process.env,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Failed to spawn terminal: ${msg}` }));
    return;
  }

  const sid = generateSid();
  const session: TerminalSession = {
    sid,
    name,
    command: shell,
    startedAt: Date.now(),
    pty: proc,
    res: null,
    keepaliveTimer: null,
    cleaned: false,
  };
  sessions.set(sid, session);

  proc.onData((data) => {
    try {
      if (session.res && !session.res.destroyed) {
        sseEvent(session.res, Buffer.from(data, "utf-8").toString("base64"));
      }
    } catch {
      /* closed */
    }
  });

  proc.onExit(({ exitCode }) => {
    logger.debug(`Terminal: PTY pid=${proc.pid} exited code=${exitCode}`);
    try {
      if (session.res && !session.res.destroyed) {
        sseEvent(session.res, JSON.stringify({ code: exitCode }), "exit");
        session.res.end();
      }
    } catch {
      /* already closed */
    }
    cleanupSession(session);
  });

  logger.debug(
    `Terminal: PTY spawned sid=${sid} pid=${proc.pid} cmd=${shell} cwd=${cwd}`,
  );
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ sid, pid: proc.pid }));
}
```

- [ ] **Step 3: Modificar handleStream para aceitar ?sid**

Substituir toda a função `handleStream` existente pelo bloco abaixo. O bloco preserva o comportamento legado (sem `?sid`) e adiciona suporte ao fluxo de dois passos:

```typescript
async function handleStream(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Parse sid from query string when using two-step spawn→stream flow
  const reqUrl = new URL(req.url || "/", "http://localhost");
  const existingSid = reqUrl.searchParams.get("sid");

  if (existingSid) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const session = sessions.get(existingSid);
    if (!session) {
      sseEvent(
        res,
        JSON.stringify({ error: `Session ${existingSid} not found` }),
        "error",
      );
      res.end();
      return;
    }

    session.res = res;
    sseEvent(res, JSON.stringify({ sid: existingSid }), "session");

    const keepaliveTimer = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        /* closed */
      }
    }, 15_000);
    session.keepaliveTimer = keepaliveTimer;

    res.on("close", () => {
      clearInterval(keepaliveTimer);
      session.res = null;
      session.keepaliveTimer = null;
      logger.debug(`Terminal: SSE disconnected for session ${existingSid}`);
    });
    return;
  }

  // ── Legacy: spawn + stream in one step (backward compat) ──────────────

  const available = await loadPty(logger);
  if (!available || !_pty) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseEvent(
      res,
      JSON.stringify({
        error: "node-pty is not installed. Run: npm install node-pty",
      }),
      "error",
    );
    res.end();
    return;
  }

  const shell =
    process.env.SHELL ||
    (process.platform === "win32" ? "powershell.exe" : "/bin/bash");

  let proc: IPty;
  try {
    proc = _pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workspaceDir,
      env: process.env,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    sseEvent(
      res,
      JSON.stringify({ error: `Failed to spawn terminal: ${msg}` }),
      "error",
    );
    res.end();
    return;
  }

  const sid = generateSid();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  sseEvent(res, JSON.stringify({ sid }), "session");

  const keepaliveTimer = setInterval(() => {
    try {
      res.write(": keepalive\n\n");
    } catch {
      /* closed */
    }
  }, 15_000);

  const session: TerminalSession = {
    sid,
    name: shell,
    command: shell,
    startedAt: Date.now(),
    pty: proc,
    res,
    keepaliveTimer,
    cleaned: false,
  };
  sessions.set(sid, session);

  proc.onData((data) => {
    try {
      if (!res.destroyed) {
        sseEvent(res, Buffer.from(data, "utf-8").toString("base64"));
      }
    } catch {
      /* closed */
    }
  });

  proc.onExit(({ exitCode }) => {
    logger.debug(`Terminal: PTY pid=${proc.pid} exited code=${exitCode}`);
    try {
      if (!res.destroyed) {
        sseEvent(res, JSON.stringify({ code: exitCode }), "exit");
        res.end();
      }
    } catch {
      /* already closed */
    }
    cleanupSession(session);
  });

  res.on("close", () => {
    logger.debug(`Terminal: SSE connection closed for session ${sid}`);
    cleanupSession(session);
  });
}
```

- [ ] **Step 4: Adicionar handleSessions e handleKill**

Adicionar as duas funções após `handleStream`, ainda dentro de `createTerminalManager`:

```typescript
function handleSessions(
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  const list = Array.from(sessions.values()).map((s) => ({
    sid: s.sid,
    name: s.name,
    command: s.command,
    pid: s.pty.pid,
    startedAt: s.startedAt,
    connected: s.res !== null,
  }));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(list));
}

function handleKill(
  _req: IncomingMessage,
  res: ServerResponse,
  sid: string,
): void {
  const session = sessions.get(sid);
  if (session) cleanupSession(session);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}
```

- [ ] **Step 5: Atualizar handleRequest com as novas rotas**

Substituir o objeto retornado por `createTerminalManager` (o método `handleRequest`):

```typescript
return {
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    subpath: string,
  ): Promise<boolean> {
    if (subpath === "/stream" && req.method === "GET") {
      await handleStream(req, res);
      return true;
    }
    if (subpath === "/spawn" && req.method === "POST") {
      await handleSpawn(req, res);
      return true;
    }
    if (subpath === "/sessions" && req.method === "GET") {
      handleSessions(req, res);
      return true;
    }
    if (subpath.startsWith("/sessions/") && req.method === "DELETE") {
      const sid = subpath.slice("/sessions/".length);
      handleKill(req, res, sid);
      return true;
    }
    if (subpath === "/input" && req.method === "POST") {
      await handleInput(req, res);
      return true;
    }
    if (subpath === "/resize" && req.method === "POST") {
      await handleResize(req, res);
      return true;
    }
    return false;
  },

  isAvailable(): Promise<boolean> {
    return loadPty(logger);
  },
};
```

- [ ] **Step 6: Verificar compilação**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add server/terminal-api.ts
git commit -m "feat: extend terminal-api with spawn, sessions list, and kill endpoints"
```

---

## Task 2: Testes do backend — server/terminal-api.test.ts

**Files:**
- Create: `server/terminal-api.test.ts`

- [ ] **Step 1: Criar o arquivo de testes**

```typescript
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { tmpdir } from "node:os";
import { createTerminalManager } from "./terminal-api.js";

const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function makeApp() {
  const app = express();
  app.use(express.json());
  const manager = createTerminalManager(logger, tmpdir());

  app.use("/api/terminal", async (req, res) => {
    const subpath = req.url.split("?")[0] || "/";
    const handled = await manager.handleRequest(req, res, subpath);
    if (!handled && !res.headersSent) {
      res.status(404).json({ error: "Not found" });
    }
  });

  return { app, manager };
}

describe("GET /api/terminal/sessions", () => {
  it("returns empty array when no sessions exist", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/terminal/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });
});

describe("DELETE /api/terminal/sessions/:sid", () => {
  it("returns ok for non-existent sid (idempotent)", async () => {
    const { app } = makeApp();
    const res = await request(app).delete(
      "/api/terminal/sessions/nonexistentsid",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("POST /api/terminal/spawn", () => {
  it("returns sid and pid when node-pty is available", async () => {
    const { app, manager } = makeApp();
    const available = await manager.isAvailable();
    if (!available) {
      console.warn("node-pty not available — skipping spawn test");
      return;
    }

    const res = await request(app)
      .post("/api/terminal/spawn")
      .send({ name: "Test Shell" });

    expect(res.status).toBe(200);
    expect(typeof res.body.sid).toBe("string");
    expect(res.body.sid.length).toBeGreaterThan(0);
    expect(typeof res.body.pid).toBe("number");

    // Clean up spawned PTY
    await request(app).delete(`/api/terminal/sessions/${res.body.sid}`);
  });

  it("returns 503 when node-pty is not available", async () => {
    const { app, manager } = makeApp();
    const available = await manager.isAvailable();
    if (available) {
      console.warn("node-pty available — skipping 503 test");
      return;
    }

    const res = await request(app)
      .post("/api/terminal/spawn")
      .send({ name: "Test Shell" });

    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/terminal/sessions after spawn", () => {
  it("lists the spawned session", async () => {
    const { app, manager } = makeApp();
    const available = await manager.isAvailable();
    if (!available) {
      console.warn("node-pty not available — skipping list test");
      return;
    }

    const spawnRes = await request(app)
      .post("/api/terminal/spawn")
      .send({ name: "Listed Session" });
    expect(spawnRes.status).toBe(200);
    const { sid } = spawnRes.body as { sid: string };

    const listRes = await request(app).get("/api/terminal/sessions");
    expect(listRes.status).toBe(200);
    const found = (listRes.body as Array<{ sid: string; name: string }>).find(
      (s) => s.sid === sid,
    );
    expect(found).toBeDefined();
    expect(found!.name).toBe("Listed Session");

    // Clean up
    await request(app).delete(`/api/terminal/sessions/${sid}`);
  });

  it("removes session from list after kill", async () => {
    const { app, manager } = makeApp();
    const available = await manager.isAvailable();
    if (!available) return;

    const spawnRes = await request(app)
      .post("/api/terminal/spawn")
      .send({ name: "Kill Me" });
    const { sid } = spawnRes.body as { sid: string };

    await request(app).delete(`/api/terminal/sessions/${sid}`);

    const listRes = await request(app).get("/api/terminal/sessions");
    const found = (listRes.body as Array<{ sid: string }>).find(
      (s) => s.sid === sid,
    );
    expect(found).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar os testes**

```bash
npm test
```

Esperado: todos os testes passando (os que dependem de node-pty pulam com aviso se não instalado; os outros — sessions vazio e kill idempotente — sempre passam).

- [ ] **Step 3: Commit**

```bash
git add server/terminal-api.test.ts
git commit -m "test: add backend tests for terminal spawn, sessions, and kill endpoints"
```

---

## Task 3: Frontend — client/src/terminal-tab.js

**Files:**
- Create: `client/src/terminal-tab.js`

Responsabilidade: ciclo de vida completo de uma tab — spawn PTY → conectar SSE → xterm.js → input/resize → fechar.

- [ ] **Step 1: Criar client/src/terminal-tab.js**

```javascript
export class TerminalTab {
  #sid = null;
  #term = null;
  #fit = null;
  #es = null;
  #container = null;
  #name;
  #alive = false;
  #command;
  #args;
  #cwd;

  constructor({ name, command = null, args = [], cwd = null }) {
    this.#name = name;
    this.#command = command;
    this.#args = args;
    this.#cwd = cwd;
  }

  get sid() { return this.#sid; }
  get name() { return this.#name; }
  set name(v) { this.#name = String(v); }
  get isAlive() { return this.#alive; }

  async open(container) {
    this.#container = container;

    // 1. Spawn PTY on the server
    const body = { name: this.#name };
    if (this.#command) { body.command = this.#command; body.args = this.#args; }
    if (this.#cwd) body.cwd = this.#cwd;

    const spawnRes = await fetch("/api/terminal/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!spawnRes.ok) {
      const err = await spawnRes.json().catch(() => ({}));
      throw new Error(err.error || `Spawn failed: HTTP ${spawnRes.status}`);
    }

    const { sid } = await spawnRes.json();
    this.#sid = sid;

    // 2. Init xterm.js
    this.#term = new window.Terminal({
      cursorBlink: true,
      theme: { background: "#0f111a", foreground: "#eee" },
      fontFamily: "monospace",
      fontSize: 14,
    });
    this.#fit = new window.FitAddon.FitAddon();
    this.#term.loadAddon(this.#fit);
    this.#term.open(container);

    // 3. Connect SSE to the spawned PTY
    this.#es = new EventSource(`/api/terminal/stream?sid=${sid}`);

    this.#es.onmessage = (e) => {
      this.#term.write(atob(e.data));
    };

    this.#es.addEventListener("session", () => {
      // SSE confirmed — send initial resize
      this.#fit.fit();
      this.#sendResize();
    });

    this.#es.addEventListener("error", (e) => {
      try {
        const data = JSON.parse(e.data);
        this.#term.writeln(`\r\n\x1b[31mErro: ${data.error}\x1b[0m`);
      } catch {
        if (this.#alive) {
          this.#term.writeln("\r\n\x1b[31mConexão perdida com o terminal.\x1b[0m");
        }
      }
      this.#es.close();
      this.#alive = false;
    });

    this.#es.addEventListener("exit", (e) => {
      const { code } = JSON.parse(e.data);
      this.#term.writeln(
        `\r\n\x1b[33m[processo encerrado com código ${code}]\x1b[0m`,
      );
      this.#es.close();
      this.#alive = false;
    });

    // Browser → PTY: input
    this.#term.onData((data) => {
      if (!this.#sid) return;
      fetch("/api/terminal/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: this.#sid, data }),
      });
    });

    // Resize on window resize
    const onResize = () => {
      this.#fit?.fit();
      this.#sendResize();
    };
    window.addEventListener("resize", onResize);
    this._onResize = onResize;

    this.#alive = true;
  }

  activate() {
    if (!this.#container) return;
    this.#container.style.display = "block";
    // Give the browser a frame to render before fitting
    requestAnimationFrame(() => {
      this.#fit?.fit();
      this.#sendResize();
      this.#term?.focus();
    });
  }

  deactivate() {
    if (this.#container) this.#container.style.display = "none";
  }

  close() {
    this.#alive = false;
    this.#es?.close();
    this.#term?.dispose();
    if (this._onResize) window.removeEventListener("resize", this._onResize);
    if (this.#sid) {
      fetch(`/api/terminal/sessions/${this.#sid}`, { method: "DELETE" });
      this.#sid = null;
    }
  }

  #sendResize() {
    if (!this.#sid || !this.#term) return;
    fetch("/api/terminal/resize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sid: this.#sid,
        cols: this.#term.cols,
        rows: this.#term.rows,
      }),
    });
  }

  // Expose for external callers (e.g. embedded terminal resize)
  _sendResize() { this.#sendResize(); }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/terminal-tab.js
git commit -m "feat: add TerminalTab class with full SSE lifecycle"
```

---

## Task 4: Frontend — client/src/terminal-manager.js

**Files:**
- Create: `client/src/terminal-manager.js`

Responsabilidade: tab bar, presets, limites, API pública `openEmbedded`.

- [ ] **Step 1: Criar client/src/terminal-manager.js**

```javascript
import { TerminalTab } from "./terminal-tab.js";

export const TERMINAL_PRESETS = [
  { id: "shell",    label: "Shell",       command: null,         args: [] },
  { id: "claude",   label: "Claude CLI",  command: "claude",    args: ["--dangerously-skip-permissions"] },
  { id: "codex",    label: "Codex CLI",   command: "codex",     args: [] },
  { id: "gemini",   label: "Gemini CLI",  command: "gemini",    args: [] },
  { id: "openclaw", label: "OpenClaw",    command: "openclaw",  args: [] },
];

const MAX_TABS = 8;

class TerminalManagerClass {
  #tabs = [];        // Array<{ tab: TerminalTab, paneEl: HTMLElement }>
  #activeIndex = -1;
  #tabBarEl = null;
  #bodyEl = null;
  #initialized = false;

  init(viewContainerId) {
    if (this.#initialized) return;
    this.#initialized = true;

    const view = document.getElementById(viewContainerId);
    if (!view) return;

    view.innerHTML = `
      <div class="terminal-toolbar">
        <div class="terminal-tabs" id="terminal-tabs"></div>
        <div class="terminal-add-wrapper">
          <button class="terminal-add-btn" id="terminal-add-btn" title="Novo terminal">
            <i class="ph ph-plus"></i>
          </button>
          <div class="terminal-preset-dropdown hidden" id="terminal-preset-dropdown">
            ${TERMINAL_PRESETS.map(
              (p) =>
                `<button class="terminal-preset-item" data-preset="${p.id}">${p.label}</button>`,
            ).join("")}
            <div class="terminal-preset-divider"></div>
            <button class="terminal-preset-item" data-preset="custom">Custom…</button>
            <div class="terminal-custom-input hidden" id="terminal-custom-input">
              <input type="text" placeholder="ex: node -i" id="terminal-custom-cmd">
              <button class="btn btn-primary btn-sm" id="terminal-custom-ok">Abrir</button>
            </div>
          </div>
        </div>
      </div>
      <div class="terminal-body" id="terminal-body"></div>
    `;

    this.#tabBarEl = document.getElementById("terminal-tabs");
    this.#bodyEl = document.getElementById("terminal-body");

    this.#bindAddButton();
    this.openTab({ preset: "shell" });
  }

  async openTab({ preset, command, args, label } = {}) {
    if (this.#tabs.length >= MAX_TABS) {
      alert(`Máximo de ${MAX_TABS} terminais simultâneos atingido.`);
      return null;
    }

    let name = label ?? null;
    let cmd = command ?? null;
    let cmdArgs = args ?? [];

    if (preset && preset !== "custom") {
      const p = TERMINAL_PRESETS.find((x) => x.id === preset);
      if (p) {
        name = name ?? p.label;
        cmd = p.command;
        cmdArgs = p.args;
      }
    }
    name = name ?? "Shell";

    const paneEl = document.createElement("div");
    paneEl.className = "terminal-pane";
    paneEl.style.display = "none";
    this.#bodyEl.appendChild(paneEl);

    const tab = new TerminalTab({ name, command: cmd, args: cmdArgs });

    try {
      await tab.open(paneEl);
    } catch (err) {
      paneEl.remove();
      alert(`Erro ao abrir terminal: ${err.message}`);
      return null;
    }

    this.#tabs.push({ tab, paneEl });
    this.#renderTabBar();
    this.#activateTab(this.#tabs.length - 1);

    return tab;
  }

  async openEmbedded(containerId, { preset, command, args, label } = {}) {
    const container =
      typeof containerId === "string"
        ? document.getElementById(containerId)
        : containerId;
    if (!container) throw new Error(`Container não encontrado: ${containerId}`);

    let name = label ?? "Terminal";
    let cmd = command ?? null;
    let cmdArgs = args ?? [];

    if (preset) {
      const p = TERMINAL_PRESETS.find((x) => x.id === preset);
      if (p) {
        name = label ?? p.label;
        cmd = p.command;
        cmdArgs = p.args;
      }
    }

    const tab = new TerminalTab({ name, command: cmd, args: cmdArgs });
    await tab.open(container);
    tab.activate();
    return tab;
  }

  #activateTab(index) {
    this.#tabs.forEach(({ tab, paneEl }, i) => {
      if (i === index) {
        paneEl.style.display = "block";
        tab.activate();
      } else {
        tab.deactivate();
        paneEl.style.display = "none";
      }
    });
    this.#activeIndex = index;
    this.#renderTabBar();
  }

  #closeTab(index) {
    const { tab, paneEl } = this.#tabs[index];
    tab.close();
    paneEl.remove();
    this.#tabs.splice(index, 1);

    if (this.#tabs.length === 0) {
      this.openTab({ preset: "shell" });
    } else {
      this.#activateTab(Math.min(index, this.#tabs.length - 1));
    }
  }

  #renderTabBar() {
    if (!this.#tabBarEl) return;
    this.#tabBarEl.innerHTML = this.#tabs
      .map(
        ({ tab }, i) => `
        <div class="terminal-tab ${i === this.#activeIndex ? "active" : ""}"
             data-index="${i}">
          <span class="terminal-tab-label"
                contenteditable="true"
                spellcheck="false">${tab.name}</span>
          <button class="terminal-tab-close" data-close="${i}">×</button>
        </div>
      `,
      )
      .join("");

    this.#tabBarEl.querySelectorAll(".terminal-tab").forEach((el) => {
      const i = Number(el.dataset.index);
      el.addEventListener("click", (e) => {
        if (!e.target.classList.contains("terminal-tab-close")) {
          this.#activateTab(i);
        }
      });
      el.querySelector(".terminal-tab-label").addEventListener("blur", (e) => {
        const newName = e.target.textContent.trim();
        if (newName) this.#tabs[i].tab.name = newName;
      });
    });

    this.#tabBarEl.querySelectorAll(".terminal-tab-close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.#closeTab(Number(btn.dataset.close));
      });
    });
  }

  #bindAddButton() {
    const addBtn = document.getElementById("terminal-add-btn");
    const dropdown = document.getElementById("terminal-preset-dropdown");
    const customSection = document.getElementById("terminal-custom-input");
    const customCmd = document.getElementById("terminal-custom-cmd");
    const customOk = document.getElementById("terminal-custom-ok");

    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
      customSection.classList.add("hidden");
    });

    document.addEventListener("click", () =>
      dropdown.classList.add("hidden"),
    );

    dropdown.querySelectorAll(".terminal-preset-item").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const preset = btn.dataset.preset;
        if (preset === "custom") {
          customSection.classList.toggle("hidden");
          customCmd.focus();
          return;
        }
        dropdown.classList.add("hidden");
        await this.openTab({ preset });
      });
    });

    customOk.addEventListener("click", async () => {
      const raw = customCmd.value.trim();
      if (!raw) return;
      const [cmd, ...rest] = raw.split(/\s+/);
      dropdown.classList.add("hidden");
      customCmd.value = "";
      await this.openTab({ command: cmd, args: rest, label: raw });
    });

    customCmd.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") customOk.click();
    });
  }
}

export const terminalManager = new TerminalManagerClass();

export function initTerminalManager() {
  terminalManager.init("view-terminal");
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/terminal-manager.js
git commit -m "feat: add TerminalManager with tab bar, presets, and embedded API"
```

---

## Task 5: Atualizar nav.js

**Files:**
- Modify: `client/src/nav.js`

- [ ] **Step 1: Substituir a importação de terminal**

Alterar a linha 1 de `client/src/nav.js`:

```javascript
// antes:
import { initTerminal } from "./terminal.js";

// depois:
import { initTerminalManager } from "./terminal-manager.js";
```

- [ ] **Step 2: Substituir a entrada no VIEW_INITS**

Alterar a linha `terminal: initTerminal,`:

```javascript
// antes:
const VIEW_INITS = {
  terminal: initTerminal,

// depois:
const VIEW_INITS = {
  terminal: initTerminalManager,
```

- [ ] **Step 3: Commit**

```bash
git add client/src/nav.js
git commit -m "refactor: nav.js uses initTerminalManager instead of initTerminal"
```

---

## Task 6: Atualizar index.html — view-terminal

**Files:**
- Modify: `client/index.html`

O `terminal-manager.js` injeta o HTML da toolbar + body via `view.innerHTML`. A view precisa ser um container vazio com flex layout (sem padding).

- [ ] **Step 1: Substituir o bloco view-terminal**

Localizar:
```html
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
```

Substituir por:
```html
      <!-- View: Terminal (content injected by terminal-manager.js) -->
      <div class="view terminal-view" id="view-terminal"></div>
```

- [ ] **Step 2: Commit**

```bash
git add client/index.html
git commit -m "feat: update terminal view to empty container for terminal-manager injection"
```

---

## Task 7: Adicionar CSS para terminal manager

**Files:**
- Modify: `client/styles.css`

- [ ] **Step 1: Adicionar regras de override para .terminal-view**

A classe `.view` tem `padding: 32px` e `overflow-y: auto`. A view de terminal precisa de zero padding e layout flex vertical para que a toolbar e o body preencham a altura disponível.

Adicionar ao **final** de `client/styles.css`:

```css
/* ── Terminal View override ─────────────────────────────────────── */
.view.terminal-view {
  padding: 0;
  overflow: hidden;
  display: none;
  flex-direction: column;
}

.view.terminal-view.active {
  display: flex;
}

/* ── Terminal Manager ───────────────────────────────────────────── */
.terminal-toolbar {
  display: flex;
  align-items: center;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
  height: 40px;
  flex-shrink: 0;
  overflow: hidden;
}

.terminal-tabs {
  display: flex;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
  height: 100%;
}

.terminal-tabs::-webkit-scrollbar { display: none; }

.terminal-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  min-width: 110px;
  max-width: 200px;
  border-right: 1px solid var(--border);
  cursor: pointer;
  user-select: none;
  color: var(--text-muted);
  font-size: 0.82rem;
  flex-shrink: 0;
  transition: background 0.15s;
}

.terminal-tab:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-main);
}

.terminal-tab.active {
  background: rgba(59, 130, 246, 0.1);
  color: var(--primary);
  border-bottom: 2px solid var(--primary);
}

.terminal-tab-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  outline: none;
}

.terminal-tab-label:focus {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  padding: 0 3px;
}

.terminal-tab-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 0.95rem;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.terminal-tab:hover .terminal-tab-close,
.terminal-tab.active .terminal-tab-close {
  opacity: 1;
}

.terminal-tab-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

.terminal-add-wrapper {
  position: relative;
  flex-shrink: 0;
  padding: 0 8px;
  height: 100%;
  display: flex;
  align-items: center;
}

.terminal-add-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 1rem;
  display: flex;
  align-items: center;
  transition: all 0.15s;
}

.terminal-add-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
}

.terminal-preset-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.terminal-preset-dropdown.hidden { display: none; }

.terminal-preset-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  color: var(--text-main);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: "Inter", sans-serif;
  transition: background 0.1s;
}

.terminal-preset-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.terminal-preset-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.terminal-custom-input {
  padding: 6px 8px;
  display: flex;
  gap: 6px;
}

.terminal-custom-input.hidden { display: none; }

.terminal-custom-input input {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 4px 8px;
  color: var(--text-main);
  font-size: 0.8rem;
  outline: none;
  font-family: monospace;
}

.terminal-custom-input input:focus {
  border-color: var(--primary);
}

.terminal-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #0f111a;
}

.terminal-pane {
  position: absolute;
  inset: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/styles.css
git commit -m "style: add terminal manager tab bar and dropdown CSS"
```

---

## Task 8: Deletar terminal.js e verificar tudo

**Files:**
- Delete: `client/src/terminal.js`

- [ ] **Step 1: Deletar client/src/terminal.js**

```bash
git rm client/src/terminal.js
```

- [ ] **Step 2: Rodar todos os testes**

```bash
npm test
```

Esperado: todos passando — `server/db.test.ts`, `server/gateways-api.test.ts`, `server/terminal-api.test.ts`.

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Iniciar o servidor e testar no browser**

Terminal 1:
```bash
npm run dev
```

Terminal 2:
```bash
npm run client:dev
```

Abrir `http://localhost:5173`, navegar para **Terminal** e verificar:

- Tab "Shell" abre automaticamente com xterm.js funcional
- Botão `[+]` abre dropdown com presets: Shell, Claude CLI, Codex CLI, Gemini CLI, OpenClaw, Custom…
- Cada preset abre um novo tab independente
- Trocar de tab preserva o conteúdo do tab anterior
- Fechar tab mata o PTY (verificar via `GET /api/terminal/sessions`)
- Ao fechar o último tab, um Shell novo abre automaticamente
- Renomear tab via clique duplo no label funciona
- Custom… revela o input e abre com o comando digitado

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: Terminal Manager complete — multi-tab PTY with CLI presets and embedded API"
```
