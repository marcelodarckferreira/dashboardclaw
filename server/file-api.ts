import { IncomingMessage, ServerResponse } from "node:http";
import { readdir, readFile, writeFile, unlink, stat, mkdir } from "node:fs/promises";
import { join, relative, resolve, dirname, basename, extname } from "node:path";
import { resolveWorkspacePath } from "./path-utils.js";

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
}

interface FileApiConfig {
  workspaceDir: string;
  maxFileSize: number; // bytes
  corsOrigin: string; // origem CORS permitida (vazio = same-origin)
  maxUploadSize: number; // tamanho máximo de upload em bytes
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Mapa de extensões para MIME types comuns (para download)
 */
const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".csv": "text/csv",
  ".sh": "application/x-sh",
  ".py": "text/x-python",
  ".go": "text/x-go",
  ".rs": "text/x-rust",
  ".toml": "application/toml",
  ".log": "text/plain",
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * Resultado do parser multipart: nome do campo, nome do arquivo, e dados binários
 */
interface MultipartFile {
  fieldName: string;
  fileName: string;
  data: Buffer;
  contentType: string;
}

/**
 * Parser multipart/form-data sem dependências externas.
 * Implementação simplificada que extrai boundary, separa as partes e retorna
 * campos de texto e arquivos binários.
 */
function parseMultipartBody(
  rawBody: Buffer,
  contentType: string
): { fields: Record<string, string>; files: MultipartFile[] } {
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];

  // Extrair boundary do content-type
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/);
  if (!boundaryMatch) {
    return { fields, files };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const endDelimiter = Buffer.from(`--${boundary}--`);

  // Encontrar posições dos delimiters no body
  let pos = 0;
  const parts: Buffer[] = [];
  while (pos < rawBody.length) {
    const idx = rawBody.indexOf(delimiter, pos);
    if (idx === -1) break;
    if (parts.length > 0) {
      // Conteúdo entre o delimitador anterior e o atual
      // Remove \r\n antes do delimiter e \r\n após o delimiter line
      const partEnd = idx - 2; // -2 para remover \r\n antes do --boundary
      if (partEnd > pos) {
        parts.push(rawBody.subarray(pos, partEnd));
      }
    }
    // Pular o delimiter + possível \r\n
    pos = idx + delimiter.length;
    // Verificar se é o end delimiter
    if (rawBody.subarray(idx, idx + endDelimiter.length).equals(endDelimiter)) {
      break;
    }
    // Pular \r\n após o delimiter
    if (rawBody[pos] === 0x0d && rawBody[pos + 1] === 0x0a) {
      pos += 2;
    }
  }

  // Se a abordagem acima falhou, usar split alternativo
  if (parts.length === 0) {
    // Fallback: dividir pelo boundary como string
    const bodyStr = rawBody.toString("binary");
    const boundaryStr = `--${boundary}`;
    const rawParts = bodyStr.split(boundaryStr);
    for (let i = 1; i < rawParts.length; i++) {
      const part = rawParts[i];
      if (part.startsWith("--")) break; // End delimiter
      if (part.startsWith("\r\n")) {
        parts.push(Buffer.from(part.slice(2), "binary"));
      } else {
        parts.push(Buffer.from(part, "binary"));
      }
    }
  }

  // Processar cada parte
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerStr = part.subarray(0, headerEnd).toString("utf-8");
    let bodyData = part.subarray(headerEnd + 4);

    // Remover \r\n trailing
    if (
      bodyData.length >= 2 &&
      bodyData[bodyData.length - 2] === 0x0d &&
      bodyData[bodyData.length - 1] === 0x0a
    ) {
      bodyData = bodyData.subarray(0, bodyData.length - 2);
    }

    // Parse headers da parte
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const fileNameMatch = headerStr.match(/filename="([^"]*?)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);
    const fieldName = nameMatch ? nameMatch[1] : "unknown";

    if (fileNameMatch) {
      // É um arquivo
      files.push({
        fieldName,
        fileName: fileNameMatch[1],
        data: bodyData,
        contentType: ctMatch ? ctMatch[1].trim() : "application/octet-stream",
      });
    } else {
      // É um campo de texto
      fields[fieldName] = bodyData.toString("utf-8");
    }
  }

  return { fields, files };
}

/**
 * Lê o body inteiro de uma requisição como Buffer (para upload binário)
 */
async function readRawBody(
  req: IncomingMessage,
  maxSize: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy();
        reject(new Error(`Upload too large (max ${Math.round(maxSize / 1024 / 1024)}MB)`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function isPathSafe(workspaceDir: string, requestedPath: string): boolean {
  return resolveWorkspacePath(workspaceDir, requestedPath) !== null;
}

/**
 * Parse request body as JSON
 */
async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

/**
 * Normalize a path for API operations to workspace-relative form.
 */
function normalizePath(workspaceDir: string, dirPath: string): string {
  const resolved = resolveWorkspacePath(workspaceDir, dirPath);
  if (!resolved) {
    return dirPath;
  }

  const rel = relative(workspaceDir, resolved);
  return rel && rel !== "" ? rel : ".";
}

/**
 * List directory contents
 */
async function listDirectory(
  workspaceDir: string,
  dirPath: string,
  recursive: boolean = false
): Promise<FileEntry[]> {
  const normalizedPath = normalizePath(workspaceDir, dirPath);
  const fullPath = resolve(workspaceDir, normalizedPath);
  const entries = await readdir(fullPath, { withFileTypes: true });
  
  const results: FileEntry[] = [];
  
  for (const entry of entries) {
    // Skip hidden files and node_modules
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    
    const entryPath = join(dirPath, entry.name);
    const fullEntryPath = join(fullPath, entry.name);
    
    if (entry.isDirectory()) {
      results.push({
        name: entry.name,
        path: entryPath,
        type: "directory",
      });
      
      if (recursive) {
        const subEntries = await listDirectory(workspaceDir, entryPath, true);
        results.push(...subEntries);
      }
    } else if (entry.isFile()) {
      try {
        const stats = await stat(fullEntryPath);
        results.push({
          name: entry.name,
          path: entryPath,
          type: "file",
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
      } catch {
        // Skip files we can't stat
      }
    }
  }
  
  return results;
}

/**
 * Create file API handler
 */
export function createFileApiHandler(config: FileApiConfig) {
  const { workspaceDir, maxFileSize } = config;
  const corsOrigin = config.corsOrigin || "";
  const maxUploadSize = config.maxUploadSize || DEFAULT_MAX_UPLOAD_SIZE;
  
  return async function handleFileApi(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string
  ): Promise<boolean> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const method = req.method || "GET";
    
    // CORS restritivo: usa a origem configurada ou same-origin
    const allowedOrigin = corsOrigin || (req.headers.origin || "");
    if (allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }
    
    try {
      // GET /api/files - List directory
      if (pathname === "/dashboardclaw/api/files" && method === "GET") {
        const dirPath = normalizePath(workspaceDir, url.searchParams.get("path") || "/");
        const recursive = url.searchParams.get("recursive") === "true";
        
        if (!isPathSafe(workspaceDir, dirPath)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        
        const files = await listDirectory(workspaceDir, dirPath, recursive);
        sendJson(res, 200, { files, workspaceDir });
        return true;
      }
      
      // GET /api/files/read - Read file content
      if (pathname === "/dashboardclaw/api/files/read" && method === "GET") {
        const filePath = url.searchParams.get("path");
        
        if (!filePath) {
          sendError(res, 400, "Missing path parameter");
          return true;
        }
        
        if (!isPathSafe(workspaceDir, filePath)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        
        const fullPath = resolveWorkspacePath(workspaceDir, filePath);
        if (!fullPath) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        const stats = await stat(fullPath);
        
        if (stats.size > maxFileSize) {
          sendError(res, 413, `File too large (max ${maxFileSize / 1024 / 1024}MB)`);
          return true;
        }
        
        const content = await readFile(fullPath, "utf-8");
        sendJson(res, 200, {
          path: normalizePath(workspaceDir, filePath),
          content,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        });
        return true;
      }
      
      // POST /api/files/write - Write file content
      if (pathname === "/dashboardclaw/api/files/write" && method === "POST") {
        const body = await parseJsonBody(req);
        const filePath = body.path as string;
        const content = body.content as string;
        
        if (!filePath || content === undefined) {
          sendError(res, 400, "Missing path or content");
          return true;
        }
        
        if (!isPathSafe(workspaceDir, filePath)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        
        const fullPath = resolveWorkspacePath(workspaceDir, filePath);
        if (!fullPath) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        
        // Ensure directory exists
        await mkdir(dirname(fullPath), { recursive: true });
        
        await writeFile(fullPath, content, "utf-8");
        sendJson(res, 200, { ok: true, path: normalizePath(workspaceDir, filePath) });
        return true;
      }
      
      // DELETE /api/files - Delete file
      if (pathname === "/dashboardclaw/api/files" && method === "DELETE") {
        const filePath = url.searchParams.get("path");
        
        if (!filePath) {
          sendError(res, 400, "Missing path parameter");
          return true;
        }
        
        if (!isPathSafe(workspaceDir, filePath)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        
        const fullPath = resolveWorkspacePath(workspaceDir, filePath);
        if (!fullPath) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        await unlink(fullPath);
        sendJson(res, 200, { ok: true, path: normalizePath(workspaceDir, filePath) });
        return true;
      }
      
      // POST /api/files/mkdir - Create directory
      if (pathname === "/dashboardclaw/api/files/mkdir" && method === "POST") {
        const body = await parseJsonBody(req);
        const dirPath = body.path as string;
        
        if (!dirPath) {
          sendError(res, 400, "Missing path");
          return true;
        }
        
        if (!isPathSafe(workspaceDir, dirPath)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        
        const fullPath = resolveWorkspacePath(workspaceDir, dirPath);
        if (!fullPath) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }
        await mkdir(fullPath, { recursive: true });
        sendJson(res, 200, { ok: true, path: normalizePath(workspaceDir, dirPath) });
        return true;
      }

      // POST /api/files/upload — Upload de arquivo binário via multipart/form-data
      if (pathname === "/dashboardclaw/api/files/upload" && method === "POST") {
        const contentType = req.headers["content-type"] || "";
        if (!contentType.includes("multipart/form-data")) {
          sendError(res, 400, "Content-Type must be multipart/form-data");
          return true;
        }

        let rawBody: Buffer;
        try {
          rawBody = await readRawBody(req, maxUploadSize);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          sendError(res, 413, msg);
          return true;
        }

        const { fields, files: uploadedFiles } = parseMultipartBody(rawBody, contentType);
        
        // O campo "path" indica o diretório destino no workspace
        const targetDir = fields["path"] || "/";
        if (!isPathSafe(workspaceDir, targetDir)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }

        const results: Array<{ name: string; path: string; size: number }> = [];

        for (const file of uploadedFiles) {
          if (!file.fileName) continue;

          // Sanitizar nome do arquivo (remover path traversal)
          const safeName = basename(file.fileName).replace(/[\0]/g, "");
          if (!safeName) continue;

          const filePath = join(targetDir, safeName);
          if (!isPathSafe(workspaceDir, filePath)) continue;

          const fullPath = resolveWorkspacePath(workspaceDir, filePath);
          if (!fullPath) continue;

          // Garantir que o diretório destino existe
          await mkdir(dirname(fullPath), { recursive: true });

          // Escrever arquivo binário diretamente (sem conversão UTF-8)
          await writeFile(fullPath, file.data);

          results.push({
            name: safeName,
            path: normalizePath(workspaceDir, filePath),
            size: file.data.length,
          });
        }

        sendJson(res, 200, {
          ok: true,
          uploaded: results.length,
          files: results,
        });
        return true;
      }

      // GET /api/files/download — Download de arquivo binário com Content-Disposition
      if (pathname === "/dashboardclaw/api/files/download" && method === "GET") {
        const filePath = url.searchParams.get("path");

        if (!filePath) {
          sendError(res, 400, "Missing path parameter");
          return true;
        }

        if (!isPathSafe(workspaceDir, filePath)) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }

        const fullPath = resolveWorkspacePath(workspaceDir, filePath);
        if (!fullPath) {
          sendError(res, 403, "Access denied: path outside workspace");
          return true;
        }

        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          sendError(res, 400, "Cannot download a directory");
          return true;
        }

        // Ler como buffer binário (não UTF-8)
        const fileBuffer = await readFile(fullPath);
        const fileName = basename(fullPath);
        const mimeType = getMimeType(fullPath);

        res.writeHead(200, {
          "Content-Type": mimeType,
          "Content-Length": fileBuffer.length,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
          "Cache-Control": "no-cache",
        });
        res.end(fileBuffer);
        return true;
      }
      
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      
      if (message.includes("ENOENT")) {
        sendError(res, 404, "File or directory not found");
      } else if (message.includes("EACCES")) {
        sendError(res, 403, "Permission denied");
      } else if (message.includes("EISDIR")) {
        sendError(res, 400, "Path is a directory, not a file");
      } else {
        sendError(res, 500, message);
      }
      return true;
    }
  };
}

export { DEFAULT_MAX_FILE_SIZE };
export type { FileApiConfig, FileEntry };
