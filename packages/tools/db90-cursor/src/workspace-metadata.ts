import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Install-wide aggregate store vs per-workspace hash directory. */
export type WorkspaceScope = "global" | "workspace";

export function isGlobalStateDbPath(dbPath: string): boolean {
  return dbPath.replace(/\\/g, "/").includes("/globalStorage/state.vscdb");
}

function fileUriToPath(uri: string): string | null {
  try {
    if (uri.startsWith("file://")) return fileURLToPath(uri);
    return uri;
  } catch {
    return null;
  }
}

function readWorkspaceFolderFromJson(workspaceStorageDir: string): string | null {
  const jsonPath = join(workspaceStorageDir, "workspace.json");
  if (!existsSync(jsonPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as Record<string, unknown>;
    if (typeof parsed.folder === "string") {
      return fileUriToPath(parsed.folder);
    }
    const folders = parsed.folders;
    if (Array.isArray(folders) && folders.length > 0) {
      const first = folders[0] as Record<string, unknown>;
      if (typeof first.path === "string") return fileUriToPath(first.path);
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolve the opened project folder for a workspace-scoped Cursor store.
 * @param dbPathOrWorkspaceDir `.../workspaceStorage/<hash>/state.vscdb` or that hash directory.
 */
export function resolveCursorWorkspaceFolder(dbPathOrWorkspaceDir: string): string | null {
  if (isGlobalStateDbPath(dbPathOrWorkspaceDir)) return null;
  const normalized = dbPathOrWorkspaceDir.replace(/\\/g, "/");
  const wsDir = normalized.endsWith("/state.vscdb")
    ? dirname(dbPathOrWorkspaceDir)
    : dbPathOrWorkspaceDir;
  return readWorkspaceFolderFromJson(wsDir);
}

/** Metadata fields for daily stats / recent commit (db path is state.vscdb). */
export function cursorWorkspaceMetadata(dbPath: string): {
  workspace: string;
  workspace_scope: WorkspaceScope;
  workspace_folder?: string;
} {
  const workspace_scope: WorkspaceScope = isGlobalStateDbPath(dbPath) ? "global" : "workspace";
  const folder =
    workspace_scope === "workspace" ? resolveCursorWorkspaceFolder(dbPath) : null;
  return {
    workspace: dbPath,
    workspace_scope,
    ...(folder ? { workspace_folder: folder } : {}),
  };
}

/** Legacy `cursor.db` rows: `workspace` is the workspaceStorage hash directory. */
export function cursorWorkspaceMetadataFromStorageDir(workspaceStorageDir: string): {
  workspace: string;
  workspace_scope: WorkspaceScope;
  workspace_folder?: string;
} {
  const folder = resolveCursorWorkspaceFolder(workspaceStorageDir);
  return {
    workspace: workspaceStorageDir,
    workspace_scope: "workspace",
    ...(folder ? { workspace_folder: folder } : {}),
  };
}
