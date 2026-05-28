import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cursorWorkspaceMetadata,
  cursorWorkspaceMetadataFromStorageDir,
  isGlobalStateDbPath,
  resolveCursorWorkspaceFolder,
} from "../workspace-metadata.js";

describe("isGlobalStateDbPath", () => {
  it("detects globalStorage state.vscdb", () => {
    expect(
      isGlobalStateDbPath(
        "/Users/me/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
      )
    ).toBe(true);
  });

  it("returns false for workspace hash stores", () => {
    expect(
      isGlobalStateDbPath(
        "/Users/me/Library/Application Support/Cursor/User/workspaceStorage/abc123/state.vscdb"
      )
    ).toBe(false);
  });
});

describe("resolveCursorWorkspaceFolder", () => {
  it("reads folder URI from workspace.json", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-ws-"));
    const wsDir = join(root, "workspaceStorage", "abc123");
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, "workspace.json"),
      JSON.stringify({ folder: "file:///Users/dev/my-app" })
    );
    const dbPath = join(wsDir, "state.vscdb");
    writeFileSync(dbPath, "");

    expect(resolveCursorWorkspaceFolder(dbPath)).toBe("/Users/dev/my-app");
  });

  it("returns null for global state.vscdb", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-global-"));
    const globalDb = join(root, "globalStorage", "state.vscdb");
    mkdirSync(join(root, "globalStorage"), { recursive: true });
    writeFileSync(globalDb, "");
    expect(resolveCursorWorkspaceFolder(globalDb)).toBeNull();
  });
});

describe("cursorWorkspaceMetadata", () => {
  it("tags global DB with workspace_scope global and no folder", () => {
    const dbPath = "/tmp/Cursor/User/globalStorage/state.vscdb";
    expect(cursorWorkspaceMetadata(dbPath)).toEqual({
      workspace: dbPath,
      workspace_scope: "global",
    });
  });

  it("tags workspace DB with scope workspace and optional folder", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-meta-"));
    const wsDir = join(root, "workspaceStorage", "hash");
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, "workspace.json"),
      JSON.stringify({ folder: "file:///Users/dev/project" })
    );
    const dbPath = join(wsDir, "state.vscdb");
    writeFileSync(dbPath, "");

    expect(cursorWorkspaceMetadata(dbPath)).toEqual({
      workspace: dbPath,
      workspace_scope: "workspace",
      workspace_folder: "/Users/dev/project",
    });
  });
});

describe("cursorWorkspaceMetadataFromStorageDir", () => {
  it("uses workspace storage dir as workspace and resolves folder", () => {
    const root = mkdtempSync(join(tmpdir(), "db90-legacy-"));
    const wsDir = join(root, "workspaceStorage", "legacy");
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, "workspace.json"),
      JSON.stringify({ folder: "file:///Users/dev/legacy-repo" })
    );

    expect(cursorWorkspaceMetadataFromStorageDir(wsDir)).toEqual({
      workspace: wsDir,
      workspace_scope: "workspace",
      workspace_folder: "/Users/dev/legacy-repo",
    });
  });
});
