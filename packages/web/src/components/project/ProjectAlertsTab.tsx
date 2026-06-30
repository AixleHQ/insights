import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/formatters";
import { type AlertSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";

export interface ProjectAlertsTabProps {
  projectId: string;
}

// Shape of a project-level alert entry (placeholder until API ships)
interface ProjectAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  triggered_by?: string;
  event_id?: string;
  created_at: string;
  notification_status?: "sent" | "failed" | "pending";
}

const severityColors: Record<AlertSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-risk-critical/10", text: "text-risk-critical", border: "border-risk-critical/30" },
  error:    { bg: "bg-risk-high/10",     text: "text-risk-high",     border: "border-risk-high/30" },
  warning:  { bg: "bg-risk-medium/10",   text: "text-risk-medium",   border: "border-risk-medium/30" },
  info:     { bg: "bg-risk-low/10",      text: "text-risk-low",      border: "border-risk-low/30" },
};

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const colors = severityColors[severity];
  return (
    <Badge
      variant="outline"
      className={cn("font-mono-display text-[10px] tracking-wider capitalize", colors.bg, colors.text, colors.border)}
    >
      {severity}
    </Badge>
  );
}

// TODO AIX-374: remove PLACEHOLDER_ALERTS once the project-level alerts API ships
const PLACEHOLDER_ALERTS: ProjectAlert[] = [
  { id: "1", severity: "error",    title: "High risk content detected", message: "A prompt containing sensitive PII was flagged — matched rule: SSN pattern.", triggered_by: "Alice Johnson", event_id: "evt-001", created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),            notification_status: "sent" },
  { id: "2", severity: "warning",  title: "Token threshold exceeded",   message: "Token usage reached 1.2M this week, exceeding the 1M monthly limit.",       triggered_by: "Bob Smith",                          created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),   notification_status: "sent" },
  { id: "3", severity: "critical", title: "Cost threshold exceeded",    message: "Monthly cost reached $1,250 — 25% over the $1,000 threshold.",               triggered_by: "Carol Davis",                        created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),  notification_status: "failed" },
  { id: "4", severity: "error",    title: "High risk content detected", message: "A prompt requesting credential exfiltration was blocked.",                    triggered_by: "Dave Wilson",   event_id: "evt-002", created_at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(), notification_status: "pending" },
];

type ProjectSortColumn = "title" | "severity" | "triggered_by";
type ProjectSortDir = "asc" | "desc";

const projectSeverityOrder: Record<AlertSeverity, number> = {
  critical: 0, error: 1, warning: 2, info: 3,
};

function sortProjectAlerts(alerts: ProjectAlert[], sort: { col: ProjectSortColumn; dir: ProjectSortDir } | null): ProjectAlert[] {
  if (!sort) return alerts;
  return [...alerts].sort((a, b) => {
    let cmp = 0;
    if (sort.col === "severity") {
      cmp = projectSeverityOrder[a.severity] - projectSeverityOrder[b.severity];
    } else {
      const av = (a[sort.col] ?? "").toLowerCase();
      const bv = (b[sort.col] ?? "").toLowerCase();
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

function ProjectSortIcon({ col, sort }: { col: ProjectSortColumn; sort: { col: ProjectSortColumn; dir: ProjectSortDir } | null }) {
  if (sort?.col !== col) return <ChevronsUpDown className="ml-1 inline size-3 text-muted-foreground/50" />;
  return sort.dir === "asc"
    ? <ChevronUp className="ml-1 inline size-3" />
    : <ChevronDown className="ml-1 inline size-3" />;
}

function ProjectSortableHead({ col, children, className, sort, onSort }: {
  col: ProjectSortColumn;
  children: React.ReactNode;
  className?: string;
  sort: { col: ProjectSortColumn; dir: ProjectSortDir } | null;
  onSort: (col: ProjectSortColumn) => void;
}) {
  return (
    <TableHead className={cn("cursor-pointer select-none hover:text-foreground", className)} onClick={() => onSort(col)}>
      {children}
      <ProjectSortIcon col={col} sort={sort} />
    </TableHead>
  );
}

function AlertHistoryTable({ alerts }: { alerts: ProjectAlert[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ col: ProjectSortColumn; dir: ProjectSortDir } | null>(null);

  function toggleSort(col: ProjectSortColumn) {
    setSort((prev) => prev?.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return alerts;
    const q = search.trim().toLowerCase();
    return alerts.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.message.toLowerCase().includes(q) ||
        (a.triggered_by ?? "").toLowerCase().includes(q),
    );
  }, [alerts, search]);

  const sorted = useMemo(() => sortProjectAlerts(filtered, sort), [filtered, sort]);

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium text-foreground">No alerts fired yet</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">
          Alerts will appear here when your configured thresholds or risk rules are triggered.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          aria-label="Search alerts"
          placeholder="Search alerts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium text-foreground">No alerts found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <ProjectSortableHead col="title" sort={sort} onSort={toggleSort}>Rule</ProjectSortableHead>
                <ProjectSortableHead col="severity" className="w-[110px]" sort={sort} onSort={toggleSort}>Severity</ProjectSortableHead>
                <TableHead className="hidden md:table-cell">Details</TableHead>
                <ProjectSortableHead col="triggered_by" className="hidden lg:table-cell" sort={sort} onSort={toggleSort}>Triggered by</ProjectSortableHead>
                <TableHead className="w-[160px]">Timestamp</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((alert) => (
                <React.Fragment key={alert.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                  >
                    <TableCell className="font-medium">{alert.title}</TableCell>
                    <TableCell><SeverityBadge severity={alert.severity} /></TableCell>
                    <TableCell className="hidden md:table-cell max-w-[280px] truncate text-sm text-muted-foreground">
                      {alert.message}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {alert.triggered_by ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDateTime(alert.created_at)}
                    </TableCell>
                    <TableCell>
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          expandedId === alert.id && "rotate-180",
                        )}
                      />
                    </TableCell>
                  </TableRow>
                  {expandedId === alert.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30 px-4 py-3">
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Full context
                          </p>
                          <p className="text-sm">{alert.message}</p>
                          {alert.event_id && (
                            <Link
                              to={AppRoutes.events.detail(alert.event_id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="size-3" />
                              View triggering event
                            </Link>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ProjectAlertsTab(_props: ProjectAlertsTabProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Alert History</h2>
        <p className="text-sm text-muted-foreground">
          Alerts fired for this project based on your configured rules.
        </p>
      </div>

      <AlertHistoryTable alerts={PLACEHOLDER_ALERTS} />
    </div>
  );
}
