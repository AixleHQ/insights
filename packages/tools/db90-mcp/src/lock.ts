import {
  mkdirSync,
  openSync,
  closeSync,
  unlinkSync,
  existsSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "./log.js";

const LOCK_FILE = join(APP_DIR, "state.lock");
const STALE_MS = 10 * 60 * 1000;

let heldFd: number | null = null;

function isStale(): boolean {
  try {
    const raw = readFileSync(LOCK_FILE, "utf8");
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts > STALE_MS;
  } catch {
    return true;
  }
}

export function acquireLock(): boolean {
  if (heldFd !== null) return false;
  mkdirSync(APP_DIR, { recursive: true });
  if (existsSync(LOCK_FILE) && isStale()) {
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // race — fall through to the open(O_EXCL) attempt
    }
  }
  try {
    const fd = openSync(LOCK_FILE, "wx");
    writeSync(fd, String(Date.now()));
    heldFd = fd;
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(): void {
  if (heldFd !== null) {
    try {
      closeSync(heldFd);
    } catch {
      // ignore
    }
    heldFd = null;
  }
  try {
    if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}
