/**
 * Terminal API — PTY management + SSE/POST bridge
 *
 * Spawns server-side PTY sessions via node-pty and bridges them
 * to the browser through Server-Sent Events (PTY → browser) and
 * POST requests (browser → PTY). Everything runs on the main
 * gateway HTTP port — no WebSocket, no side port, no extra SSH
 * tunnel forwarding required.
 *
 * All external types are defined locally so the module compiles without
 * @types/node-pty being installed.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Minimal interfaces — fully self-contained, no external @types needed
// ---------------------------------------------------------------------------

/** Subset of node-pty's IPty we actually use */
interface IPty {
  onData(cb: (data: string) => void): { dispose(): void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): {
    dispose(): void;
  };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  readonly pid: number;
}

/** The spawn function from node-pty */
interface INodePty {
  spawn(
    file: string,
    args: string[],
    options: Record<string, unknown>,
  ): IPty;
}

interface TerminalLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

// ---------------------------------------------------------------------------
// Cached dynamic import for node-pty
//
// When OpenClaw loads plugins via jiti, bare `import("node-pty")` resolves
// from the *gateway's* node_modules, not the plugin's. We use `createRequire`
// anchored at this file's location to force resolution from the plugin's own
// node_modules, then fall back to a bare dynamic import() for environments
// where it works natively.
// ---------------------------------------------------------------------------

let _pty: INodePty | null = null;
let _ptyPromise: Promise<boolean> | null = null;

// String variable dodges TS module resolution for dynamic import()
const PTY_PKG: string = "node-pty";

/**
 * Try to load a native/CJS module using multiple resolution strategies.
 * Each strategy is tried in order; all failures are logged so we can
 * actually diagnose what's going wrong under jiti.
 */
async function pluginImport(
  pkg: string,
  logger: TerminalLogger,
): Promise<Record<string, unknown>> {
  const errors: string[] = [];

  // Strategy 1: createRequire anchored at this source file
  try {
    const req = createRequire(import.meta.url);
    logger.debug(
      `Terminal: trying createRequire(${import.meta.url}).resolve("${pkg}")`,
    );
    const resolved = req.resolve(pkg);
    logger.debug(`Terminal: resolved ${pkg} → ${resolved}`);
    const mod = req(pkg);
    return typeof mod === "object" && mod !== null
      ? (mod as Record<string, unknown>)
      : { default: mod };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`createRequire(import.meta.url): ${msg}`);
  }

  // Strategy 2: createRequire anchored at process.cwd()
  try {
    const cwdUrl = `file://${process.cwd()}/package.json`;
    const req = createRequire(cwdUrl);
    logger.debug(`Terminal: trying createRequire(${cwdUrl})("${pkg}")`);
    const mod = req(pkg);
    return typeof mod === "object" && mod !== null
      ? (mod as Record<string, unknown>)
      : { default: mod };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`createRequire(cwd): ${msg}`);
  }

  // Strategy 3: bare dynamic import()
  try {
    logger.debug(`Terminal: trying dynamic import("${pkg}")`);
    const mod = await (import(pkg) as Promise<Record<string, unknown>>);
    return mod;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`import(): ${msg}`);
  }

  // Strategy 4: try well-known global node_modules paths directly
  const globalPaths = [
    `/usr/lib/node_modules/${pkg}`,
    `/usr/local/lib/node_modules/${pkg}`,
  ];
  for (const gp of globalPaths) {
    try {
      logger.debug(`Terminal: trying direct require("${gp}")`);
      const req = createRequire(import.meta.url);
      const mod = req(gp);
      return typeof mod === "object" && mod !== null
        ? (mod as Record<string, unknown>)
        : { default: mod };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`global(${gp}): ${msg}`);
    }
  }

  throw new Error(
    `Cannot load "${pkg}" — tried ${errors.length} strategies:\n  ` +
      errors.join("\n  "),
  );
}

function loadPty(logger: TerminalLogger): Promise<boolean> {
  if (_ptyPromise) return _ptyPromise;
  _ptyPromise = pluginImport(PTY_PKG, logger).then(
    (mod) => {
      _pty = (mod.default ?? mod) as unknown as INodePty;
      logger.info("Terminal: node-pty loaded successfully");
      return true;
    },
    (err) => {
      logger.warn(
        `Terminal: node-pty not available — ${err instanceof Error ? err.message : err}`,
      );
      return false;
    },
  );
  return _ptyPromise;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

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

function generateSid(): string {
  return randomBytes(12).toString("hex");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a single SSE event to a response. */
function sseEvent(res: ServerResponse, data: string, event?: string): void {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
}

/** Read the full request body as a UTF-8 string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createTerminalManager(
  logger: TerminalLogger,
  workspaceDir: string,
) {
  // Start loading node-pty eagerly so it's warm by the time a connection arrives.
  loadPty(logger);

  const sessions = new Map<string, TerminalSession>();

  function cleanupSession(session: TerminalSession): void {
    if (session.cleaned) return;
    session.cleaned = true;
    if (session.keepaliveTimer) clearInterval(session.keepaliveTimer);
    try { session.res?.end(); } catch { /* already closed */ }
    try { session.pty.kill(); } catch { /* already exited */ }
    sessions.delete(session.sid);
    logger.debug(`Terminal: session ${session.sid} cleaned up`);
  }

  // ---- POST spawn handler ------------------------------------------------

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

  // ---- SSE stream handler ------------------------------------------------

  async function handleStream(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Parse sid from query string when using two-step spawn→stream flow
    const reqUrl = new URL(req.url || "/", "http://localhost");
    const existingSid = reqUrl.searchParams.get("sid");

    if (existingSid) {
      const session = sessions.get(existingSid);
      if (!session) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `Session ${existingSid} not found` }));
        return;
      }

      // Evict any existing SSE connection before taking over — prevents dangling TCP + timer
      if (session.res && !session.res.destroyed) {
        if (session.keepaliveTimer) clearInterval(session.keepaliveTimer);
        try { session.res.end(); } catch { /* already closed */ }
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

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

  // ---- POST input handler ------------------------------------------------

  async function handleInput(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let parsed: { sid?: string; data?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const session = parsed.sid ? sessions.get(parsed.sid) : undefined;
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    if (typeof parsed.data === "string") {
      session.pty.write(parsed.data);
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }

  // ---- POST resize handler -----------------------------------------------

  async function handleResize(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let parsed: { sid?: string; cols?: number; rows?: number };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const session = parsed.sid ? sessions.get(parsed.sid) : undefined;
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    if (typeof parsed.cols === "number" && typeof parsed.rows === "number") {
      session.pty.resize(
        Math.max(1, Math.floor(parsed.cols)),
        Math.max(1, Math.floor(parsed.rows)),
      );
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  }

  // ---- GET sessions list handler -----------------------------------------

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

  // ---- DELETE session (kill) handler -------------------------------------

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

  // ---- public API ---------------------------------------------------------

  return {
    /**
     * Route terminal sub-requests. Call with the sub-path after
     * `/dashboardclaw/terminal` (e.g. "/stream", "/spawn", "/sessions",
     * "/input", "/resize"). Returns true if handled, false otherwise.
     */
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

    /** Returns true if node-pty is installed and loaded. */
    isAvailable(): Promise<boolean> {
      return loadPty(logger);
    },
  };
}
