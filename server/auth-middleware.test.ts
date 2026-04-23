import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { initDb, type Database } from "./db.js";
import { requireGatewayAuth } from "./auth-middleware.js";

let dbPath: string;
let db: Database;

beforeEach(() => {
  dbPath = join(tmpdir(), `test-auth-${Date.now()}.db`);
  db = initDb(dbPath);
});

afterEach(() => {
  try { db.close(); } catch { /* already closed */ }
  if (existsSync(dbPath)) unlinkSync(dbPath);
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/protected", requireGatewayAuth(db));
  app.get("/api/protected/resource", (_req, res) => res.json({ ok: true }));
  app.get("/api/public/resource", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requireGatewayAuth", () => {
  it("returns 401 when X-Gateway-Id header is missing", async () => {
    const res = await request(makeApp()).get("/api/protected/resource");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 401 when X-Gateway-Id is not a valid gateway", async () => {
    const res = await request(makeApp())
      .get("/api/protected/resource")
      .set("X-Gateway-Id", "9999");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("passes through when X-Gateway-Id matches an existing gateway", async () => {
    db
      .prepare(
        "INSERT INTO gateways (name, host, port, token) VALUES (?, ?, ?, ?)",
      )
      .run("test-gw", "localhost", 8080, "tok");
    const gw = db
      .prepare("SELECT id FROM gateways WHERE name = ?")
      .get("test-gw") as { id: number };

    const res = await request(makeApp())
      .get("/api/protected/resource")
      .set("X-Gateway-Id", String(gw.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("does not block routes that are not under the protected prefix", async () => {
    const res = await request(makeApp()).get("/api/public/resource");
    expect(res.status).toBe(200);
  });
});
