/**
 * Shared CLI argument base type. Every connector exposes at minimum these
 * flags; each extends this shape with tool-specific flags (claude adds
 * `--watch` / `--watch-interval`, cursor adds `--since`).
 *
 * The full argv parsing loop stays in each connector's `cli.ts` because the
 * flag sets diverge enough that a generic parser would be more complex than
 * two small switch statements. This type + the helpers below are the shared
 * vocabulary.
 */
export interface BaseArgs {
  token?: string;
  host?: string;
  projectId?: string;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
}

export const BASE_ARGS_DEFAULTS: BaseArgs = {
  dryRun: false,
  verbose: false,
  help: false,
};

/**
 * If `arg` is of the form `--name=VALUE`, return VALUE. Otherwise undefined.
 * Callers are responsible for checking the name prefix separately.
 *
 * Example: extractEqualsValue("--token=abc", "--token") === "abc"
 */
export function extractEqualsValue(arg: string, name: string): string | undefined {
  const prefix = `${name}=`;
  if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  return undefined;
}
