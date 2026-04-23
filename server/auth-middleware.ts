import type { Request, Response, NextFunction } from "express";
import type BetterSqlite3 from "better-sqlite3";

export function requireGatewayAuth(db: BetterSqlite3.Database) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = req.headers["x-gateway-id"];
    const id = raw ? Number(raw) : NaN;

    if (!raw || !Number.isInteger(id) || id <= 0) {
      res.status(401).json({ error: "Missing or invalid X-Gateway-Id header" });
      return;
    }

    const row = db
      .prepare("SELECT id FROM gateways WHERE id = ?")
      .get(id) as { id: number } | undefined;

    if (!row) {
      res.status(401).json({ error: "Gateway not found" });
      return;
    }

    next();
  };
}
