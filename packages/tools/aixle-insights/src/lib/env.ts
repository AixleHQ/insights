/**
 * `DB90_*` env vars are deprecated aliases for the `AIXLE_INSIGHTS_*` names (branding rename,
 * AIX-624). Both are honored indefinitely until a removal date is announced; the deprecated
 * name only wins when the current name is unset, so setting both is safe.
 */
export interface EnvAliasOptions {
  /** Preferred, currently-documented env var name. */
  current: string;
  /** Deprecated env var name, still honored as a fallback. */
  deprecated: string;
  onDeprecatedUse?: (deprecatedName: string, currentName: string) => void;
}

export function readEnvWithDeprecatedAlias(options: EnvAliasOptions): string | undefined {
  const currentValue = process.env[options.current]?.trim();
  if (currentValue) return currentValue;
  const deprecatedValue = process.env[options.deprecated]?.trim();
  if (deprecatedValue) {
    options.onDeprecatedUse?.(options.deprecated, options.current);
    return deprecatedValue;
  }
  return undefined;
}

export function readBooleanEnvWithDeprecatedAlias(options: EnvAliasOptions): boolean {
  const value = readEnvWithDeprecatedAlias(options);
  return ["1", "true", "yes"].includes(value?.toLowerCase() ?? "");
}

export function warnDeprecatedEnvVar(
  deprecatedName: string,
  currentName: string,
  log: (message: string) => void = console.error
): void {
  log(`Warning: ${deprecatedName} is deprecated; use ${currentName} instead.`);
}
