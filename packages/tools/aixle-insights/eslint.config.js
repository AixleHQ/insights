// ESLint 9/10 flat config for @aixle/insights.
//
// Scope is deliberately narrow: eslint-plugin-security rules only. This package
// has never been linted (16.5k lines across src/ + src/test/), so switching on
// js.configs.recommended or typescript-eslint's recommended set here would bury
// the security signal under a large unrelated diff. See ARD.md decision I.
//
// Severities are listed explicitly rather than spread from
// security.configs.recommended, which sets every rule to "warn" — a severity
// `eslint` exits 0 on. Listing them also stops a plugin patch release from
// silently adding a rule that breaks CI. When bumping eslint-plugin-security,
// diff its rule list against this block.
import security from "eslint-plugin-security";
import tsParser from "@typescript-eslint/parser";

/**
 * Twelve rules that are clean across the whole package today, so any new
 * violation is a real finding — plus two that are structurally incompatible
 * with what this package does. Counts below are from an AST survey of the
 * non-test tree at the time of writing (AIX-559).
 */
const securityRules = {
  "security/detect-bidi-characters": "error",
  "security/detect-buffer-noassert": "error",
  "security/detect-child-process": "error",
  "security/detect-disable-mustache-escape": "error",
  "security/detect-eval-with-expression": "error",
  "security/detect-new-buffer": "error",
  "security/detect-no-csrf-before-method-override": "error",
  "security/detect-non-literal-regexp": "error",
  "security/detect-non-literal-require": "error",
  "security/detect-possible-timing-attacks": "error",
  "security/detect-pseudoRandomBytes": "error",
  "security/detect-unsafe-regex": "error",

  // OFF — 94 reports across 18 files (93 distinct lines) in the non-test tree;
  // effectively every fs call site in the package. Reading local Claude/Cursor
  // data files by computed path is this package's entire function. Path
  // containment is enforced structurally instead, by validatedRealPathWithinRoot
  // / resolveCursorSqlitePath (src/readers/cursor-sqlite.ts).
  "security/detect-non-literal-fs-filename": "off",

  // OFF — 58 reports. All are lookups into maps keyed by tool name, model id
  // or session id (src/pricing.ts, src/auth/exchange.ts, src/sync.ts), plus
  // argv[i + 1] scanning in src/cli.ts. Suppressing them inline would hide the
  // twelve rules above.
  "security/detect-object-injection": "off",
};

export default [
  {
    // ESLint flat config default-ignores only **/node_modules/ and .git/.
    // It does NOT read .gitignore, so dist/ has to be named here.
    ignores: ["dist/**", "coverage/**"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { security },
    rules: securityRules,
  },
  {
    // src/hooks/hook-forwarder.mjs and scripts/reset-local-env.mjs — plain ESM,
    // handled by the default parser.
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { security },
    rules: securityRules,
  },
];
