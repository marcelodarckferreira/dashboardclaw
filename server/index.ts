import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createFileApiHandler, DEFAULT_MAX_FILE_SIZE } from "./file-api.js";
import { createTerminalManager } from "./terminal-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// Configuração Básica de CORS para permitir que o Frontend (Vite) conecte
app.use(cors({
  origin: "*", // Em produção, restrinja para a URL do frontend
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Servir os arquivos estáticos do Dashboard (Nível 1)
app.use(express.static(resolve(__dirname, "../client")));

// Logger mockado já que não temos mais o logger do PluginApi
const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`)
};

// Resolução do Diretório de Workspace
let workspaceDir = process.env.WORKSPACE_DIR;
if (!workspaceDir) {
  const cwdWorkspace = resolve(process.cwd(), "workspace");
  if (existsSync(cwdWorkspace)) {
    workspaceDir = cwdWorkspace;
  } else {
    workspaceDir = process.cwd();
  }
}

logger.info(`Starting Dashboard Server...`);
logger.info(`Workspace Directory: ${workspaceDir}`);

// Middleware para validar o Gateway Token (enviado via header Authorization)
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Neste novo modelo, o próprio Dashboard armazena o token e o envia.
  // O servidor NodeJS repassa o token para o OpenClaw, mas para proteger os arquivos locais:
  const clientToken = req.headers.authorization?.replace("Bearer ", "");
  
  // Se você quiser proteger a FileAPI/Terminal local com uma senha local, pode validar aqui.
  // Por enquanto, aceitamos a conexão local. O proxy para o OpenClaw fará a auth de verdade.
  next();
};

// 1. Inicializar File API
const fileApiHandler = createFileApiHandler({
  workspaceDir,
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  corsOrigin: "*",
  maxUploadSize: 50 * 1024 * 1024 // 50MB
});

// Converter o handler antigo do HTTP nativo para Express middleware
app.use("/api/files", authMiddleware, async (req, res) => {
  // O handler antigo espera req.url contendo /dashboardclaw/api/files/...
  // Vamos reescrever a URL para ele entender
  const originalUrl = req.url;
  req.url = `/dashboardclaw/api/files${originalUrl === "/" ? "" : originalUrl}`;
  
  const handled = await fileApiHandler(req, res, req.url.split("?")[0]);
  if (!handled && !res.headersSent) {
    res.status(404).json({ error: "File API route not found" });
  }
});

// 2. Inicializar Terminal API (PTY)
const terminalManager = createTerminalManager(logger, workspaceDir);

app.use("/api/terminal", authMiddleware, async (req, res) => {
  const originalUrl = req.url; // ex: /stream, /input, /resize
  const subpath = originalUrl.split("?")[0];
  
  const handled = await terminalManager.handleRequest(req, res, subpath);
  if (!handled && !res.headersSent) {
    res.status(404).json({ error: "Terminal API route not found" });
  }
});

// 3. (Futuro) Proxy para a API real do OpenClaw
// O frontend enviará requisições para /api/openclaw/... e nós faremos o forward com o token.

// Start server
server.listen(port, () => {
  logger.info(`🚀 Standalone Backend rodando na porta ${port}`);
  logger.info(`-> File API: http://localhost:${port}/api/files`);
  logger.info(`-> Terminal API: http://localhost:${port}/api/terminal`);
});
