import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, Search } from "lucide-react";
import emptyAlertsBack from "@/assets/empty-alerts-back.svg";
import emptyAlertsFront from "@/assets/empty-alerts-front.svg";
import { useOrg } from "@/contexts/OrgContext";
import { useAlerts } from "@/hooks/useApi";
import { type Alert, type AlertSeverity } from "@/lib/types";
import { formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";

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

function NotificationBadge({ status }: { status: Alert["notification_status"] }) {
  if (status === "sent") {
    return (
      <Badge variant="outline" className={cn("font-mono-display text-[10px] tracking-wider capitalize", severityColors.info.bg, severityColors.info.text, severityColors.info.border)}>
        Sent
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className={cn("font-mono-display text-[10px] tracking-wider capitalize", severityColors.critical.bg, severityColors.critical.text, severityColors.critical.border)}>
        Failed
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="font-mono-display text-[10px] tracking-wider capitalize text-muted-foreground">
        Pending
      </Badge>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

type SortColumn = "title" | "severity" | "triggered_by" | "project_name";
type SortDir = "asc" | "desc";

const severityOrder: Record<AlertSeverity, number> = {
  critical: 0, error: 1, warning: 2, info: 3,
};

function sortAlerts(alerts: Alert[], sort: { col: SortColumn; dir: SortDir } | null): Alert[] {
  if (!sort) return alerts;
  return [...alerts].sort((a, b) => {
    let cmp = 0;
    if (sort.col === "severity") {
      cmp = severityOrder[a.severity] - severityOrder[b.severity];
    } else {
      const av = (a[sort.col] ?? "").toLowerCase();
      const bv = (b[sort.col] ?? "").toLowerCase();
      cmp = av < bv ? -1 : av > bv ? 1 : 0;
    }
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

function SortIcon({ col, sort }: { col: SortColumn; sort: { col: SortColumn; dir: SortDir } | null }) {
  if (sort?.col !== col) return <ChevronsUpDown className="ml-1 inline size-3 text-muted-foreground/50" />;
  return sort.dir === "asc"
    ? <ChevronUp className="ml-1 inline size-3" />
    : <ChevronDown className="ml-1 inline size-3" />;
}

function SortableHead({
  col, children, className, sort, onSort,
}: {
  col: SortColumn;
  children: React.ReactNode;
  className?: string;
  sort: { col: SortColumn; dir: SortDir } | null;
  onSort: (col: SortColumn) => void;
}) {
  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-foreground", className)}
      onClick={() => onSort(col)}
    >
      {children}
      <SortIcon col={col} sort={sort} />
    </TableHead>
  );
}

const PLACEHOLDER_ALERTS: Alert[] = [
  { id: "1", organization_id: "org", severity: "critical", title: "Cost threshold exceeded",    message: "Monthly cost reached $1,250 — 25% over the $1,000 threshold. Triggered by a spike in GPT-4o usage across 3 projects.", is_read: false, created_at: new Date(Date.now() - 1000 * 60 * 14).toISOString(),           triggered_by: "Alice Johnson",  project_name: "Backend API",   project_id: "p1", notification_status: "sent" },
  { id: "2", organization_id: "org", severity: "error",    title: "High risk content detected",  message: "A prompt containing potentially sensitive PII was flagged. Content matched rule: SSN pattern.",                          is_read: false, created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),  triggered_by: "Bob Smith",      project_name: "Data Pipeline", project_id: "p2", event_id: "evt-001", notification_status: "sent" },
  { id: "3", organization_id: "org", severity: "warning",  title: "Token threshold exceeded",    message: "Token usage reached 1.2M this week, exceeding the 1M limit. Usage concentrated in the code completion assistant.",      is_read: true,  created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), triggered_by: "Carol Davis",    project_name: "Frontend App",  project_id: "p3", notification_status: "sent" },
  { id: "4", organization_id: "org", severity: "warning",  title: "Usage spike detected",         message: "Unusual increase of 340% in API calls detected between 14:00–15:00 UTC. May indicate a runaway script.",               is_read: true,  created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), project_name: "Infra Tools",   project_id: "p1", notification_status: "failed" },
  { id: "5", organization_id: "org", severity: "error",    title: "High risk content detected",   message: "A prompt requesting database credential exfiltration was blocked. Source user flagged for review.",                     is_read: true,  created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), triggered_by: "Dave Wilson",    project_name: "Backend API",   project_id: "p1", event_id: "evt-002", notification_status: "pending" },
];

export function OrgAlerts() {
  const { currentOrg } = useOrg();
  const { data: rawAlerts, isLoading } = useAlerts(currentOrg?.id || "");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortColumn; dir: SortDir } | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  // PLACEHOLDER_ALERTS fills the table during design review; remove to reveal the empty state.
  const tableAlerts = rawAlerts?.length ? rawAlerts : PLACEHOLDER_ALERTS;

  const projectOptions = useMemo(() => {
    const names = [...new Set(tableAlerts.map((a) => a.project_name).filter(Boolean))] as string[];
    return names.sort();
  }, [tableAlerts]);

  const filtered = useMemo(() => {
    let result = tableAlerts;
    if (projectFilter !== "all") result = result.filter((a) => a.project_name === projectFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q) ||
          (a.triggered_by ?? "").toLowerCase().includes(q) ||
          (a.project_name ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [tableAlerts, projectFilter, search]);

  const showEmpty = !isLoading && filtered.length === 0;
  const sorted = useMemo(() => sortAlerts(filtered, sort), [filtered, sort]);

  function toggleSort(col: SortColumn) {
    setSort((prev) =>
      prev?.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          History of fired alerts across all projects in your organization
        </p>
      </div>

      <div className="flex gap-2">
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
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projectOptions.map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="rounded-md border">
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ) : showEmpty ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <div className="relative mb-3 h-[144px] w-[232px]">
            <div className="absolute inset-0 flex items-center justify-center" style={{ top: "10px" }}>
              <div style={{ transform: "rotate(-30deg) scaleY(0.87) skewX(30deg)" }}>
                <img src={emptyAlertsBack} alt="" className="size-[134px]" />
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ transform: "rotate(-30deg) scaleY(0.87) skewX(30deg)" }}>
                <img src={emptyAlertsFront} alt="" className="size-[134px]" />
              </div>
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">No alerts fired yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Alerts will appear here when your configured thresholds or risk rules are triggered.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead col="title" sort={sort} onSort={toggleSort}>Rule</SortableHead>
                  <SortableHead col="severity" className="w-[110px]" sort={sort} onSort={toggleSort}>Severity</SortableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                  <SortableHead col="triggered_by" className="hidden lg:table-cell" sort={sort} onSort={toggleSort}>Triggered by</SortableHead>
                  <SortableHead col="project_name" className="hidden lg:table-cell" sort={sort} onSort={toggleSort}>Project</SortableHead>
                  <TableHead className="w-[160px]">Timestamp</TableHead>
                  <TableHead className="w-[100px]">Notification</TableHead>
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
                      <TableCell className={cn("font-medium", !alert.is_read && "text-foreground")}>
                        {alert.title}
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={alert.severity} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[240px] truncate text-sm text-muted-foreground">
                        {alert.message}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {alert.triggered_by ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {alert.project_name ? (
                          alert.project_id ? (
                            <Link
                              to={AppRoutes.projects.detail(alert.project_id)}
                              className="hover:underline hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {alert.project_name}
                            </Link>
                          ) : (
                            alert.project_name
                          )
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(alert.created_at)}
                      </TableCell>
                      <TableCell>
                        <NotificationBadge status={alert.notification_status} />
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
                        <TableCell colSpan={8} className="bg-muted/30 px-4 py-3">
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
