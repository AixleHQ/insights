import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Resolved from the test file, not process.cwd(): `npm test` runs from the
// package directory locally but CI runs `npm test --workspace=@aixle/insights`
// from packages/tools.
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

const pkg = JSON.parse(readFileSync(`${packageRoot}package.json`, "utf-8")) as {
  engines: { node: string };
};

const declaredNode = pkg.engines.node;

describe("engines.node contract", () => {
  // The floor is duplicated in four places. It has drifted before: AIX-361
  // raised it to >=20.19.0 in package.json, but the lockfile, the README and
  // RELEASING.md all kept saying >=20, and staging then reverted package.json
  // back to >=20 (03ae19588) with nothing to catch it.
  it("declares a concrete floor", () => {
    expect(declaredNode).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it("matches the lockfile's workspace-member entry", () => {
    const lock = JSON.parse(
      readFileSync(`${workspaceRoot}package-lock.json`, "utf-8"),
    ) as { packages: Record<string, { engines?: { node?: string } }> };
    expect(lock.packages["aixle-insights"]?.engines?.node).toBe(declaredNode);
  });

  it("matches the version quoted in README.md", () => {
    const readme = readFileSync(`${packageRoot}README.md`, "utf-8");
    const bare = declaredNode.replace(/^>=/, "");
    // Accept either `>=` or `≥` so the contract does not dictate typography.
    // Built by substring rather than `new RegExp`, which would trip
    // security/detect-non-literal-regexp.
    const accepted = [`Node.js >= ${bare}`, `Node.js ≥ ${bare}`];
    expect(
      accepted.some((form) => readme.includes(form)),
      `README.md must state the Node floor as one of: ${accepted.join(" | ")}`,
    ).toBe(true);
  });

  it("matches the version quoted in RELEASING.md", () => {
    const releasing = readFileSync(`${workspaceRoot}RELEASING.md`, "utf-8");
    expect(releasing).toContain(`\`${declaredNode}\``);
  });
});

describe("local runtime artifacts stay untracked", () => {
  // state-<host>-<hash>.json embeds session UUIDs; credentials.json holds a
  // bearer token. state-localhost-523d45af.json was committed by the
  // db90-mcp -> aixle-insights rename in 10485069a because the root .gitignore
  // rules still pointed at the old path. (AIX-559)
  it("has no tracked state-*.json or credentials.json under the package", () => {
    // Probe for a work tree first, and skip only on that. A blanket catch around
    // `git ls-files` would also swallow a corrupt index or a permission error and
    // report success, which is the one outcome this test must never produce.
    try {
      execFileSync("git", ["rev-parse", "--git-dir"], {
        cwd: repoRoot,
        stdio: "ignore",
      });
    } catch {
      // Not a git work tree (e.g. an extracted tarball) — nothing to assert.
      return;
    }
    const tracked = execFileSync(
      "git",
      ["ls-files", "--", "packages/tools/aixle-insights"],
      { cwd: repoRoot, encoding: "utf-8" },
    );
    const offenders = tracked
      .split("\n")
      .filter((p) => /(^|\/)(credentials\.json|state-.*\.json)$/.test(p));
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nightly publish — post-publish verification contract.
//
// These assert on inline bash in the workflow, which has no unit-test harness
// of its own. The failure mode being guarded is a well-meaning simplification:
// every line below looks redundant right up until a publish lands inside npm's
// scanning window. npm has scanned every publish for malware since 2026-07-28
// and the package is not installable until that completes — "typically around
// five minutes ... up to 15 minutes or more" — so an instant readback fails on
// healthy publishes. Run 32375219884 is the incident; see ARD.md.
// ---------------------------------------------------------------------------
describe("nightly publish: post-publish verification contract", () => {
  const workflowPath = `${repoRoot}.github/workflows/npm-nightly-builds.yml`;
  const resolverPath = `${packageRoot}scripts/nightly-release-resolve.ts`;

  // Absent when running from an extracted tarball rather than the repo, same
  // reasoning as the git guard above: skip rather than fail spuriously.
  const workflow = existsSync(workflowPath)
    ? readFileSync(workflowPath, "utf-8")
    : null;

  it("reads the registry with --prefer-online at every workflow call site", () => {
    if (workflow === null) return;
    // Comment lines mention `npm view` too; only executable lines count.
    const reads = workflow
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("npm view") && !line.startsWith("#"));

    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter((line) => !line.includes("--prefer-online"))).toEqual([]);
  });

  it("reads the registry with --prefer-online in the resolver too", () => {
    if (!existsSync(resolverPath)) return;
    const source = readFileSync(resolverPath, "utf-8");
    const calls = source.match(/(?:sh|shOrNull)\("npm",\s*\[[^\]]*\]/g) ?? [];

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('"--prefer-online"');
    }
  });

  it("waits out the scanning window instead of asserting the dist-tag once", () => {
    if (workflow === null) return;
    const match = workflow.match(/AVAILABILITY_BUDGET_SECONDS=(\d+)/);
    expect(match).not.toBeNull();
    // 900s covers npm's documented "up to 15 minutes or more" upper bound.
    expect(Number(match?.[1] ?? 0)).toBeGreaterThanOrEqual(900);
  });

  it("creates the GitHub Release before the smoke test, never after", () => {
    if (workflow === null) return;
    const release = workflow.indexOf("- name: Create GitHub Release");
    const smoke = workflow.indexOf("- name: Post-publish smoke test");

    expect(release).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(-1);
    // Ordering is load-bearing: while the Release was gated on the smoke test,
    // one scanning-window flake permanently forfeited the release notes of an
    // already-published version, and a re-run could not recover them because
    // the resolver then classifies up-to-date.
    expect(release).toBeLessThan(smoke);
  });

  it("retries the installability check instead of calling npx once", () => {
    if (workflow === null) return;
    const start = workflow.indexOf("- name: Post-publish smoke test");
    expect(start).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const end = rest.indexOf("\n      - name:");
    const block = end === -1 ? rest : rest.slice(0, end);

    // The --help call is the native-binding check (better-sqlite3 loads
    // eagerly), so it must survive any rework of this step.
    expect(block).toMatch(/npx -y "@aixle\/insights@\$\{COMPUTED_VERSION\}" --help/);

    // ...and it must be *retried*. Installability, not metadata, is what npm's
    // publish scanning window actually gates — npm's own guidance is about
    // automation that "assumes a package is installable immediately after
    // publishing". A single-shot npx is the same defect as a single-shot
    // dist-tag read, one layer down, and we only ever sampled it once.
    expect(
      /(?:until|while)[^\n]*npx[^\n]*--help/.test(block),
      "the npx --help check must sit in a retry loop, not run once",
    ).toBe(true);

    // Bounded by the same budget rather than spinning forever.
    const npxAt = block.search(/npx -y "@aixle\/insights/);
    expect(block.slice(npxAt)).toContain("AVAILABILITY_BUDGET_SECONDS");
  });

  it("still restores an npm cache — the premise --prefer-online defends against", () => {
    if (workflow === null) return;
    // If this ever stops being true, the --prefer-online rationale in the
    // workflow and resolver comments goes stale and should be revisited.
    expect(workflow).toMatch(/cache:\s*"npm"/);
  });
});
