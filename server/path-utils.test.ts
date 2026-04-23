import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { resolveWorkspacePath } from "./path-utils.js";

const WS = resolve("/workspace");

describe("resolveWorkspacePath", () => {
  it("resolves a relative path within workspace", () => {
    expect(resolveWorkspacePath(WS, "projects/foo")).toBe(
      resolve(WS, "projects/foo"),
    );
  });

  it("resolves workspace root for empty-ish paths", () => {
    expect(resolveWorkspacePath(WS, ".")).toBe(WS);
    expect(resolveWorkspacePath(WS, "")).toBe(WS);
  });

  it("resolves an absolute path that is inside the workspace", () => {
    const inside = resolve(WS, "sub/dir");
    expect(resolveWorkspacePath(WS, inside)).toBe(inside);
  });

  it("returns null for path traversal via ../", () => {
    expect(resolveWorkspacePath(WS, "../../etc/passwd")).toBeNull();
  });

  it("returns null for absolute path outside workspace", () => {
    expect(resolveWorkspacePath(WS, "/etc")).toBeNull();
    expect(resolveWorkspacePath(WS, "/tmp")).toBeNull();
  });

  it("returns null for null-byte injection", () => {
    expect(resolveWorkspacePath(WS, "foo\0bar")).toBeNull();
  });

  it("strips workspace/ prefix", () => {
    expect(resolveWorkspacePath(WS, "workspace/projects")).toBe(
      resolve(WS, "projects"),
    );
  });
});
