import { useState, useCallback } from "react";
import { Download, Search, X, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { useUnifiedAuditLogs, useExportUnifiedAuditLogs } from "@/hooks/useApi";
import type { UnifiedAuditLogFilters } from "@/hooks/useApi";
import type { UnifiedAuditLog } from "@/lib/types";
import { getAuditActionLabel } from "@/lib/audit-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditLogDrawer } from "./AuditLogDrawer";
import { cn } from "@/lib/utils";
import { SEVERITY_CLASS } from "@/lib/audit-styles";

interface UnifiedAuditTimelineTabProps {
  orgId: string;
}

type SeverityFilter = "all" | "info" | "warning" | "critical";
type OutcomeFilter = "all" | "success" | "failure";

export function UnifiedAuditTimelineTab({ orgId }: UnifiedAuditTimelineTabProps) {
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<UnifiedAuditLog | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const activeFilters: UnifiedAuditLogFilters = {
    page,
    per_page: 20,
    ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
    ...(outcomeFilter !== "all" ? { outcome: outcomeFilter } : {}),
    ...(appliedFromDate ? { from_date: appliedFromDate } : {}),
    ...(appliedToDate ? { to_date: appliedToDate } : {}),
  };

  const { data, isLoading } = useUnifiedAuditLogs(orgId, activeFilters);
  const { exportLogs, isExporting } = useExportUnifiedAuditLogs(orgId);

  const logs = data?.data ?? [];
  const meta = data?.meta;

  const handleSeverityChange = useCallback((value: SeverityFilter) => {
    setSeverityFilter(value);
    setPage(1);
    setDrawerOpen(false);
  }, []);

  const handleOutcomeChange = useCallback((value: OutcomeFilter) => {
    setOutcomeFilter(value);
    setPage(1);
    setDrawerOpen(false);
  }, []);

  const applyDates = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setPage(1);
    setDrawerOpen(false);
  };

  const clearFilters = () => {
    setSeverityFilter("all");
    setOutcomeFilter("all");
    setFromDate("");
    setToDate("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setPage(1);
    setDrawerOpen(false);
  };

  const hasActiveFilters =
    severityFilter !== "all" ||
    outcomeFilter !== "all" ||
    appliedFromDate ||
    appliedToDate;

  const handleRowClick = (log: UnifiedAuditLog, index: number) => {
    setSelectedLog(log);
    setSelectedIndex(index);
    setDrawerOpen(true);
  };

  const handleNavigate = (direction: "prev" | "next") => {
    const next = direction === "prev" ? selectedIndex - 1 : selectedIndex + 1;
    if (next >= 0 && next < logs.length) {
      setSelectedIndex(next);
      setSelectedLog(logs[next]);
    }
  };

  const handleExport = () => {
    const exportFilters: Omit<UnifiedAuditLogFilters, "page" | "per_page"> = {
      ...(severityFilter !== "all" ? { severity: severityFilter } : {}),
      ...(outcomeFilter !== "all" ? { outcome: outcomeFilter } : {}),
      ...(appliedFromDate ? { from_date: appliedFromDate } : {}),
      ...(appliedToDate ? { to_date: appliedToDate } : {}),
    };
    void exportLogs(exportFilters);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Severity pills */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Severity</p>
          <div className="flex gap-1">
            {(["all", "info", "warning", "critical"] as SeverityFilter[]).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={severityFilter === v ? "default" : "outline"}
                className="h-7 px-2 text-xs capitalize"
                onClick={() => handleSeverityChange(v)}
              >
                {v === "all" ? "All" : v}
              </Button>
            ))}
          </div>
        </div>

        {/* Outcome pills */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Outcome</p>
          <div className="flex gap-1">
            {(["all", "success", "failure"] as OutcomeFilter[]).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={outcomeFilter === v ? "default" : "outline"}
                className="h-7 px-2 text-xs capitalize"
                onClick={() => handleOutcomeChange(v)}
              >
                {v === "all" ? "All" : v}
              </Button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="unified-from-date" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="unified-from-date"
              type="date"
              className="h-7 w-36 text-xs"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="unified-to-date" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="unified-to-date"
              type="date"
              className="h-7 w-36 text-xs"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <Button size="sm" className="h-7" onClick={applyDates}>
            <Search className="mr-1 size-3" />
            Apply
          </Button>
        </div>

        {hasActiveFilters && (
          <Button size="sm" variant="ghost" className="h-7" onClick={clearFilters}>
            <X className="mr-1 size-3" />
            Clear
          </Button>
        )}

        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className="mr-1 size-3" />
            {isExporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {/* Truncation warning */}
      {meta?.truncated && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Results capped at 1,000 entries per source. Apply date or scope filters to narrow results.
        </p>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No audit log entries found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log, index) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(log, index)}
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {log.scope}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.actor ? (
                        <div>
                          <p className="text-sm font-medium">
                            {log.actor.name || log.actor.email}
                          </p>
                          {log.actor.name && (
                            <p className="text-xs text-muted-foreground">{log.actor.email}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {getAuditActionLabel(log.action, log.scope)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {log.severity ? (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            SEVERITY_CLASS[log.severity]
                          )}
                        >
                          {log.severity}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.outcome ? (
                        <Badge
                          variant={log.outcome === "failure" ? "destructive" : "outline"}
                          className={cn(
                            "text-xs",
                            log.outcome === "success" && "text-green-600 dark:text-green-400"
                          )}
                        >
                          {log.outcome}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.resourceType ? (
                        <span className="text-muted-foreground">
                          {log.resourceType}
                          {log.resourceId && (
                            <span className="ml-1 font-mono text-xs opacity-60">
                              #{log.resourceId.slice(0, 8)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.current_page} of {meta.total_pages} ({meta.total_count} entries)
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= meta.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <AuditLogDrawer
        log={selectedLog}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onNavigate={handleNavigate}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex < logs.length - 1}
      />
    </div>
  );
}
