import express from "express";
import type { Database } from "./db.js";

export function createChatApi(_db: InstanceType<typeof Database>): express.Router {
  const router = express.Router();
  router.all("*", (_req, res) => {
    res.status(501).json({ error: "Not implemented — Sub-projeto 3" });
  });
  return router;
}
