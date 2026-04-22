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
  // NOTE: do NOT use express.json() here — terminal-api reads the raw body
  // stream internally via readBody(). Pre-consuming the stream would cause
  // handleSpawn/handleInput/handleResize to hang waiting for the 'end' event.
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
    if (!available) {
      console.warn("node-pty not available — skipping kill+list test");
      return;
    }

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
