// Returns a numeric value for ordering retention durations (higher = longer retention)
export function retentionOrder(value: string): number {
  if (value === "forever") return Infinity;
  const parts = value.split("_");
  const unit = parts[parts.length - 1];
  const amount = parseInt(parts[0]);
  if (unit === "hours") return amount;
  if (unit === "days") return amount * 24;
  return 0;
}

export function formatRetentionLabel(value: string): string {
  if (value === "forever") return "Forever";
  const parts = value.split("_");
  const unit = parts[parts.length - 1];
  const amount = parseInt(parts[0]);
  if (unit === "hours") return `${amount} hours`;
  if (unit === "days") {
    if (amount % 365 === 0) {
      const years = amount / 365;
      return `${years} year${years > 1 ? "s" : ""}`;
    }
    if (amount === 180) return "6 months";
    return `${amount} days`;
  }
  return value;
}
