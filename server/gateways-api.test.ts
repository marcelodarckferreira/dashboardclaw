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

  it("returns all gateways without token field", async () => {
    db.prepare("INSERT INTO gateways (name, host, port, token) VALUES (?,?,?,?)")
      .run("Prod", "192.168.1.10", 18789, "tok1");
    const res = await request(app).get("/api/gateways");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Prod");
    expect(res.body[0].token).toBeUndefined();
  });
});

describe("POST /api/gateways", () => {
  it("creates a gateway and returns it without token", async () => {
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
