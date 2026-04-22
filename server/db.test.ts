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
