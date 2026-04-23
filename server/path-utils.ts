import { resolve, relative, isAbsolute } from "node:path";

/**
 * Resolves a user-supplied path against workspaceDir, returning the absolute
 * path if it is inside the workspace, or null if it escapes (traversal).
 *
 * Accepts:
 *  - relative paths     "projects/foo"
 *  - workspace-prefixed "workspace/projects/foo"
 *  - absolute paths     "/absolute/path/inside/workspace"
 */
export function resolveWorkspacePath(
  workspaceDir: string,
  requestedPath: string,
): string | null {
  if (!requestedPath || requestedPath.includes("\0")) {
    return requestedPath === "" ? workspaceDir : null;
  }

  let normalized = requestedPath.replace(/\\/g, "/").trim();

  if (!normalized || normalized === "/" || normalized === ".") {
    return workspaceDir;
  }

  if (isAbsolute(normalized)) {
    const abs = resolve(normalized);
    const rel = relative(workspaceDir, abs);
    if (!rel || rel === ".") return workspaceDir;
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    return abs;
  }

  normalized = normalized.replace(/^\/+/, "").replace(/\/+$/, "");

  if (normalized === "workspace" || normalized.startsWith("workspace/")) {
    normalized = normalized.slice("workspace".length).replace(/^\/+/, "");
  }

  if (!normalized || normalized === ".") return workspaceDir;

  const resolved = resolve(workspaceDir, normalized);
  const rel = relative(workspaceDir, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;

  return resolved;
}
