#!/usr/bin/env node
// reset-local-env.mjs — reset any dev's local @aixle/insights environment
// to a known-good state after editing the package or after a confused config drift.
//
// What it does, in order:
//   1. Resolve repo root via `git rev-parse --show-toplevel` (no hardcoded paths).
//   2. Stop any running aixle-insights MCP processes (so they reload the dist).
//   3. Rebuild dist when src is newer than dist (skip otherwise — keep it snappy).
//   4. Verify/repair `~/.claude.json` so `mcpServers.aixle-insights` points at the
//      absolute path of `dist/cli.js`. Strip duplicate `insights` and legacy `db90`
//      keys.
//   5. Verify/repair `~/.cursor/mcp.json` (if present) the same way.
//   6. Warn (don't fail) on user-state issues: direct curl ingest hooks in
//      `~/.claude/settings.json`, leftover `@db90/*` global npm packages.
//   7. Restart MCP from the repo root so pre-resolution finds the project.
//   8. Tail `~/.aixle-insights/mcp.log` for up to 30s for the first
//      `project_attribution_resolved` line after restart. Assert `project_id` is
//      non-null. Print a summary either way.
//
// Cross-platform target: macOS + Linux (uses `ps` / `pkill` / `git`). Windows
// support is a followup — flag with `--allow-windows-unsupported` to skip the
// process-kill step there.

import { execFileSync, spawn } from "node:child_process";
import { homedir, platform } from "node:os";
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function log(level, msg) {
  const prefix = {
    info: `${C.cyan}ℹ${C.reset}`,
    ok: `${C.green}✓${C.reset}`,
    warn: `${C.yellow}⚠${C.reset}`,
    err: `${C.red}✗${C.reset}`,
    step: `${C.bold}${C.cyan}▸${C.reset}`,
  }[level] ?? "·";
  process.stderr.write(`${prefix} ${msg}\n`);
}

function fatal(msg) {
  log("err", msg);
  process.exit(1);
}

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    fatal("Could not find repo root via `git rev-parse --show-toplevel`. Run this from inside the db90-rails worktree.");
  }
}

function pkgRoot(root) {
  const p = join(root, "packages", "tools", "aixle-insights");
  if (!existsSync(p)) fatal(`Package directory missing: ${p}`);
  return p;
}

function distEntry(root) {
  return join(pkgRoot(root), "dist", "cli.js");
}

function newestMtime(dir, exts) {
  let newest = 0;
  function walk(d) {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (name.isFile() && exts.some((e) => p.endsWith(e))) {
        const m = statSync(p).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  }
  if (existsSync(dir)) walk(dir);
  return newest;
}

function findRunningMcpPids() {
  if (platform() === "win32") {
    log("warn", "Process lookup skipped on Windows — Windows reset is a followup.");
    return [];
  }
  try {
    const out = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    return out
      .split("\n")
      .filter((line) => line.includes("aixle-insights/dist/cli.js") && line.includes(" run"))
      .map((line) => parseInt(line.trim().split(/\s+/)[0], 10))
      .filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function stopRunningMcps() {
  const pids = findRunningMcpPids();
  if (pids.length === 0) {
    log("ok", "No running aixle-insights MCP processes.");
    return;
  }
  log("step", `Stopping ${pids.length} running MCP process(es): ${pids.join(", ")}`);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (err) {
      log("warn", `kill ${pid} failed: ${err.message ?? err}`);
    }
  }
  // Allow up to 3s for graceful exit; SIGKILL anything still alive.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && findRunningMcpPids().length > 0) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  for (const pid of findRunningMcpPids()) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {/* already dead */}
  }
  log("ok", "MCPs stopped.");
}

function maybeRebuild(pkg) {
  const srcMtime = newestMtime(join(pkg, "src"), [".ts"]);
  const distMtime = newestMtime(join(pkg, "dist"), [".js"]);
  if (srcMtime === 0) fatal("src directory is empty or missing.");
  if (distMtime === 0 || srcMtime > distMtime) {
    log("step", `Rebuilding dist (src ${distMtime === 0 ? "missing dist" : "newer than dist"})…`);
    try {
      execFileSync("npm", ["run", "build"], { cwd: pkg, stdio: "inherit" });
    } catch (err) {
      fatal(`build failed: ${err.message ?? err}`);
    }
    log("ok", "Build complete.");
  } else {
    log("ok", `Dist is up to date (src mtime ≤ dist mtime).`);
  }
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    fatal(`Cannot parse ${path}: ${err.message ?? err}`);
  }
}

function saveJson(path, obj) {
  copyFileSync(path, `${path}.bak-reset-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function repairClaudeConfig(distAbs) {
  const path = join(homedir(), ".claude.json");
  const cfg = loadJson(path);
  if (!cfg) {
    log("warn", `${path} missing — skipping Claude Code config repair.`);
    return { changed: false };
  }
  cfg.mcpServers ??= {};
  const desired = { type: "stdio", command: "node", args: [distAbs, "run"] };

  let changed = false;

  // Drop the legacy `db90` and duplicate `insights` keys.
  for (const k of ["db90", "insights"]) {
    if (k in cfg.mcpServers) {
      delete cfg.mcpServers[k];
      changed = true;
      log("ok", `~/.claude.json: removed legacy mcpServers.${k}`);
    }
  }

  // Ensure the canonical entry is correct.
  const current = cfg.mcpServers["aixle-insights"];
  const matches =
    current &&
    current.command === desired.command &&
    Array.isArray(current.args) &&
    current.args.length === desired.args.length &&
    current.args.every((a, i) => a === desired.args[i]);
  if (!matches) {
    cfg.mcpServers["aixle-insights"] = desired;
    changed = true;
    log("ok", `~/.claude.json: set mcpServers["aixle-insights"] → node ${distAbs} run`);
  }

  if (changed) saveJson(path, cfg);
  else log("ok", `~/.claude.json: already canonical.`);
  return { changed };
}

function repairCursorConfig(distAbs) {
  const path = join(homedir(), ".cursor", "mcp.json");
  if (!existsSync(path)) {
    log("info", "~/.cursor/mcp.json not present — Cursor not configured here, skipping.");
    return { changed: false };
  }
  const cfg = loadJson(path) ?? {};
  cfg.mcpServers ??= {};
  const desired = { command: "node", args: [distAbs, "run"] };

  let changed = false;
  // Cursor convention in this repo uses key `insights`. Drop legacy `db90` too.
  if ("db90" in cfg.mcpServers) {
    delete cfg.mcpServers.db90;
    changed = true;
    log("ok", "~/.cursor/mcp.json: removed legacy mcpServers.db90");
  }

  const current = cfg.mcpServers["insights"];
  const matches =
    current &&
    current.command === desired.command &&
    Array.isArray(current.args) &&
    current.args.length === desired.args.length &&
    current.args.every((a, i) => a === desired.args[i]);
  if (!matches) {
    cfg.mcpServers["insights"] = desired;
    changed = true;
    log("ok", `~/.cursor/mcp.json: set mcpServers["insights"] → node ${distAbs} run`);
  }

  if (changed) saveJson(path, cfg);
  else log("ok", `~/.cursor/mcp.json: already canonical.`);
  return { changed };
}

function warnOnUserState() {
  // Direct ingest curl hooks bypass project attribution entirely.
  const settingsPath = join(homedir(), ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const cfg = loadJson(settingsPath) ?? {};
    const hooks = cfg.hooks ?? {};
    const offenders = [];
    for (const key of ["PostToolUse", "Stop"]) {
      const groups = hooks[key] ?? [];
      for (const g of groups) {
        for (const h of g.hooks ?? []) {
          const cmd = h.command ?? "";
          if (/api\/v1\/ingest\/events/.test(cmd)) offenders.push(`${key} → curl POST /ingest/events`);
        }
      }
    }
    if (offenders.length) {
      log("warn", "Direct ingest curl hooks present in ~/.claude/settings.json (they post events without project_id):");
      for (const o of offenders) log("warn", `   • ${o}`);
      log("warn", "   → consider removing; the MCP server now handles ingest with attribution.");
    }
  }

  // Stale globally installed @db90/* packages — leftover from the old layout.
  try {
    const out = execFileSync("npm", ["ls", "-g", "--depth=0", "--json"], { encoding: "utf8" });
    const parsed = JSON.parse(out);
    const deps = parsed.dependencies ?? {};
    const stale = Object.keys(deps).filter((k) => k.startsWith("@db90/"));
    if (stale.length) {
      log("warn", `Stale global packages present: ${stale.join(", ")}`);
      log("warn", `   → run: npm uninstall -g ${stale.join(" ")}`);
    }
  } catch {
    // npm not available or no globals — nothing to flag.
  }
}

function restartMcp(root, distAbs) {
  log("step", `Restarting MCP from ${root} …`);
  const child = spawn(process.execPath, [distAbs, "run"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();
  // Give it a moment to actually spawn.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800);
  const pids = findRunningMcpPids();
  if (pids.length === 0) fatal("MCP did not start. Check /tmp or run `node dist/cli.js run` manually to see the error.");
  log("ok", `MCP running as PID ${pids.join(",")} (cwd=${root}).`);
  return pids[0];
}

function waitForAttribution(restartedAtMs, timeoutMs = 30000) {
  const logPath = join(homedir(), ".aixle-insights", "mcp.log");
  if (!existsSync(logPath)) {
    log("warn", `${logPath} missing — cannot verify attribution. The MCP may need a sync cycle to create it.`);
    return null;
  }
  const deadline = Date.now() + timeoutMs;
  let lastSize = statSync(logPath).size;
  let lastChecked = "";
  while (Date.now() < deadline) {
    const size = statSync(logPath).size;
    if (size > lastSize) {
      const raw = readFileSync(logPath, "utf8");
      lastSize = size;
      // Find latest project_attribution_resolved line with ts > restartedAtMs.
      const lines = raw.trim().split("\n").reverse();
      for (const line of lines) {
        if (line === lastChecked) break;
        if (!line.includes('"event":"project_attribution_resolved"')) continue;
        try {
          const parsed = JSON.parse(line);
          const tsMs = Date.parse(parsed.ts);
          if (tsMs >= restartedAtMs) return parsed;
        } catch { /* skip */ }
      }
      lastChecked = lines[0] ?? "";
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  return null;
}

function main() {
  const root = repoRoot();
  const pkg = pkgRoot(root);
  const distAbs = distEntry(root);

  log("step", `Resetting local @aixle/insights env`);
  log("info", `repo root: ${root}`);

  stopRunningMcps();
  maybeRebuild(pkg);
  if (!existsSync(distAbs)) fatal(`Dist entry missing after build: ${distAbs}`);

  repairClaudeConfig(distAbs);
  repairCursorConfig(distAbs);
  warnOnUserState();

  const restartedAt = Date.now();
  const pid = restartMcp(root, distAbs);

  log("step", `Waiting up to 30s for project_attribution_resolved log line…`);
  const resolved = waitForAttribution(restartedAt);
  if (!resolved) {
    log("warn", "No new attribution log line within 30s. The MCP may resolve on its first sync cycle (5min).");
    log("info", `Tail ~/.aixle-insights/mcp.log to monitor. PID = ${pid}`);
    process.exit(0);
  }
  const projectId = resolved.data?.project_id;
  const source = resolved.data?.source;
  if (projectId) {
    log("ok", `Project attribution OK: project_id=${projectId} source=${source}`);
    log("info", `Open a NEW Claude Code / Cursor session in this workspace to use the rebuilt MCP.`);
  } else {
    log("err", `Attribution resolved but project_id is null (source=${source}).`);
    log("info", `Most likely: this directory's git remote isn't registered as a Aixle Insights project. Check the dashboard's /projects.`);
    process.exit(1);
  }
}

main();
