import type { DashboardPeriod } from "@/lib/types";

export function formatCost(n: number | string | null | undefined): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num) || num === 0) return "$0.00";
  if (num < 0.001) return `$${num.toFixed(6)}`;
  if (num < 0.01) return `$${num.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatPercentage(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// For already-computed percentage values (e.g. 12.3 → "12.3%").
// Distinct from formatPercentage which expects a fraction (0.123 → "12.3%").
export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

// For AI contribution percentages from Cursor recentCommit metadata.
// Omits decimals when the value is a whole number (60 → "60%", 66.67 → "66.67%").
export function formatAiPercentage(value: number): string {
  const decimals = value % 1 === 0 ? 0 : 2;
  return `${value.toFixed(decimals)}%`;
}

export function periodLabel(p: DashboardPeriod): string {
  if (p.type === "all_time") return "All time";
  const [y, m] = p.value.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function truncateModelName(name: string): string {
  return name.length > 30 ? `${name.slice(0, 30)}…` : name;
}

const US_DATETIME_DISPLAY: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const US_LONG_DATE: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
};

/** ISO (or parseable) timestamp for tables; en-US; invalid → em dash. */
export function formatDateTime(iso: string | null | undefined): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", US_DATETIME_DISPLAY);
}

/** Calendar date only (e.g. invitation expiry fallback); invalid Date → em dash. */
export function formatLongUsDate(date: Date): string {
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", US_LONG_DATE);
}

// Event attribution — classifies who performed an event.
// The backend serializer sets `attribution` on each event; this maps it to a display label.
export const EventAttribution = {
  USER: "user",
  ORGANIZATION: "organization",
  SERVICE: "service",
  UNKNOWN: "unknown",
} as const;

export type EventAttributionType = (typeof EventAttribution)[keyof typeof EventAttribution];

const ATTRIBUTION_LABELS: Record<EventAttributionType, string> = {
  [EventAttribution.USER]: "User",
  [EventAttribution.ORGANIZATION]: "Organization",
  [EventAttribution.SERVICE]: "Service",
  [EventAttribution.UNKNOWN]: "-",
};

export function getEventActorLabel(event: {
  user?: { email?: string } | null;
  attribution?: string;
}): string {
  if (event.user?.email) return event.user.email;
  const key = (event.attribution || "unknown") as EventAttributionType;
  return ATTRIBUTION_LABELS[key] || ATTRIBUTION_LABELS[EventAttribution.UNKNOWN];
}
