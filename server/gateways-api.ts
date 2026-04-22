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

  router.get("/", (_req, res) => {
    const rows = db.prepare("SELECT * FROM gateways ORDER BY name").all() as GatewayRow[];
    res.json(rows.map(toPublic));
  });

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
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
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

    db.prepare(
      "INSERT INTO service_status (gateway_id, service, status, value, detail) VALUES (?, 'gateway', ?, ?, ?)"
    ).run(id, status, value, detail);

    const session = db.prepare("SELECT id FROM sessions WHERE gateway_id = ?").get(id);
    if (session) {
      db.prepare("UPDATE sessions SET last_seen = CURRENT_TIMESTAMP WHERE gateway_id = ?").run(id);
    } else {
      db.prepare("INSERT INTO sessions (gateway_id) VALUES (?)").run(id);
    }

    res.json({ status, value, detail });
  });

  router.get("/:id/status", (req, res) => {
    const id = Number(req.params.id);
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const rows = db
      .prepare("SELECT * FROM service_status WHERE gateway_id = ? ORDER BY checked_at DESC LIMIT ?")
      .all(id, limit);
    res.json(rows);
  });

  return router;
}
