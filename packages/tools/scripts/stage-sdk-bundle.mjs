#!/usr/bin/env node
// Stages a built copy of @db90/sdk into the current connector's local
// node_modules/@db90/sdk so npm pack's `bundledDependencies` actually bundles it.
//
// Why this exists: `npm ci` at the workspace root hoists @db90/sdk to
// packages/tools/node_modules/@db90/sdk (a symlink). npm pack only bundles
// dependencies physically located in the package's own node_modules, so without
// this script every connector tarball would publish with a dangling
// "@db90/sdk": "*" registry dependency that npm cannot resolve (the SDK is
// private). Run from the connector's working directory via `prepack`.
//
// Cross-platform: pure Node fs APIs, no shell, no tar.

import { cp, rm, mkdir, access, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(here, "..", "db90-sdk");
const connectorRoot = process.cwd();
const target = join(connectorRoot, "node_modules", "@db90", "sdk");

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

const sdkPkg = JSON.parse(await readFile(join(sdkRoot, "package.json"), "utf-8"));
if (sdkPkg.name !== "@db90/sdk") {
  console.error(`stage-sdk-bundle: expected @db90/sdk at ${sdkRoot}, found ${sdkPkg.name}`);
  process.exit(1);
}

const distPath = join(sdkRoot, "dist");
if (!(await exists(distPath))) {
  console.error("stage-sdk-bundle: SDK dist/ missing — building first.");
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: sdkRoot,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("stage-sdk-bundle: SDK build failed.");
    process.exit(r.status ?? 1);
  }
}

if (existsSync(target)) await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

// Mirror the SDK's `files` whitelist: dist/ and package.json. If files ever
// expands (e.g. README, LICENSE), update both there and here.
await cp(distPath, join(target, "dist"), { recursive: true });
await cp(join(sdkRoot, "package.json"), join(target, "package.json"));

console.log(`stage-sdk-bundle: staged @db90/sdk into ${target}`);
