export type ReadFailureReason = "invalid_json" | "unreadable";

/**
 * Classifies a caught error from `JSON.parse(readFileSync(...))` (or a parsed keychain
 * payload) into a log-safe reason + error string.
 *
 * V8's `JSON.parse` throws a `SyntaxError` whose `.message` can embed a prefix (or, for a
 * short enough input, the entirety) of the unparsed content — e.g.
 * `JSON.parse("example_local_fixture_1234567890")` produces
 * `Unexpected token 'e', "example_lo"... is not valid JSON`. Logging that message would
 * leak exactly the secret content the parse-failure events exist to describe without
 * exposing (see `credentials_parse_failed` / `credentials_keytar_parse_failed` /
 * `config_parse_failed` / `state_parse_failed`). So for a `SyntaxError` this reports only
 * the error name, never `.message`.
 *
 * Any other error (fs I/O — `EACCES`, `EISDIR`, etc.) is reported as `unreadable` using its
 * errno `code`, which never contains file content and is more actionable than a bare name.
 */
export function describeReadFailure(err: unknown): { reason: ReadFailureReason; error: string } {
  if (err instanceof SyntaxError) {
    return { reason: "invalid_json", error: "SyntaxError" };
  }
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code) return { reason: "unreadable", error: code };
  return { reason: "unreadable", error: err instanceof Error ? err.name : "unknown_error" };
}
