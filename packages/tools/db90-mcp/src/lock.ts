import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const LOCK_FILE = "state.lock";

/** Stale lock TTL — longer than a normal transcript sync run. */
const DEFAULT_STALE_MS = 30 * 60 * 1000;

function lockOwnerIsAlive(owner: string): boolean {
  const pid = Number.parseInt(owner.split(":")[0] ?? "", 10);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface SyncLock {
  acquired: boolean;
  release: () => void;
}

/**
 * Advisory lock file under the MCP app directory. Prevents overlapping sync runs
 * across timer ticks, manual tool calls, and separate MCP processes.
 */
export function acquireSyncLock(appDir: string, staleMs: number = DEFAULT_STALE_MS): SyncLock {
  mkdirSync(appDir, { recursive: true });
  const lockPath = join(appDir, LOCK_FILE);
  const owner = `${process.pid}:${randomUUID()}`;

  const tryAcquire = (): boolean => {
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      writeFileSync(lockPath, owner, "utf-8");
      return true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "EEXIST") throw err;
      let fd: number | null = null;
      try {
        fd = openSync(lockPath, "r");
        const st = fstatSync(fd);
        if (Date.now() - st.mtimeMs > staleMs) {
          try {
            const existingOwner = readFileSync(lockPath, "utf-8");
            if (lockOwnerIsAlive(existingOwner)) return false;
            const current = statSync(lockPath);
            if (current.dev === st.dev && current.ino === st.ino) {
              unlinkSync(lockPath);
            }
          } catch {
            // another winner removed it — fall through to retry
          }
          return tryAcquire();
        }
      } catch {
        // stat/unlink race — treat as not acquired
      } finally {
        if (fd !== null) closeSync(fd);
      }
      return false;
    }
  };

  const acquired = tryAcquire();
  return {
    acquired,
    release: () => {
      if (!acquired) return;
      try {
        if (readFileSync(lockPath, "utf-8") !== owner) return;
        unlinkSync(lockPath);
      } catch {
        // best-effort
      }
    },
  };
}
