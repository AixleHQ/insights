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

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function truncateModelName(name: string): string {
  return name.length > 30 ? `${name.slice(0, 30)}…` : name;
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
