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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json());

// Workspace
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

// SQLite
const dbPath = resolve(process.cwd(), "dashboardclaw.db");
const db = initDb(dbPath);
logger.info(`Database: ${dbPath}`);

// API routes
app.use("/api/gateways", createGatewaysApi(db));
app.use("/api/channels", createChannelsApi(db));
app.use("/api/agent-sessions", createAgentSessionsApi(db));
app.use("/api/chat", createChatApi(db));

// File API
const fileApiHandler = createFileApiHandler({
  workspaceDir,
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  corsOrigin: "*",
  maxUploadSize: 50 * 1024 * 1024,
});

app.use("/api/files", async (req, res) => {
  const originalUrl = req.url;
  req.url = `/dashboardclaw/api/files${originalUrl === "/" ? "" : originalUrl}`;
  const handled = await fileApiHandler(req, res, req.url.split("?")[0]);
  if (!handled && !res.headersSent) res.status(404).json({ error: "Not found" });
});

// Terminal API
const terminalManager = createTerminalManager(logger, workspaceDir);
app.use("/api/terminal", async (req, res) => {
  const subpath = req.url.split("?")[0];
  const handled = await terminalManager.handleRequest(req, res, subpath);
  if (!handled && !res.headersSent) res.status(404).json({ error: "Not found" });
});

// Static frontend — prod: client/dist/, dev: client/
const clientDist = resolve(__dirname, "../dist/client");
const clientDev = resolve(__dirname, "../client");
const staticDir = existsSync(clientDist) ? clientDist : clientDev;
app.use(express.static(staticDir));

// SPA fallback
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
  logger.info(`-> Gateways API: http://localhost:${port}/api/gateways`);
  logger.info(`-> File API:     http://localhost:${port}/api/files`);
  logger.info(`-> Terminal API: http://localhost:${port}/api/terminal`);
  logger.info(`-> Static:       ${staticDir}`);
});
