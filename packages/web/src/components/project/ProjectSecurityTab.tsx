import { useState } from "react";
import {
  Shield,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useProjectAuditLogs, type AuditLogFilters } from "@/hooks/useApi";
import { AUDIT_ACTION_LABELS, SCOPE_AUDIT_ACTION_OPTIONS } from "@/lib/audit-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export function ProjectSecurityTab({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");

  const activeFilters: AuditLogFilters = {
    page,
    per_page: 20,
    ...(actionFilter !== "all" ? { log_action: actionFilter } : {}),
    ...(appliedFromDate ? { from_date: appliedFromDate } : {}),
    ...(appliedToDate ? { to_date: appliedToDate } : {}),
  };

  const { data, isLoading } = useProjectAuditLogs(projectId, activeFilters);

  const logs = data?.data ?? [];
  const meta = data?.meta;

  const handleActionChange = (value: string) => {
    setActionFilter(value);
    setPage(1);
  };

  const applyDateFilters = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setPage(1);
  };

  const clearFilters = () => {
    setActionFilter("all");
    setFromDate("");
    setToDate("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setPage(1);
  };

  const hasActiveFilters =
    actionFilter !== "all" || !!appliedFromDate || !!appliedToDate;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Security & Audit Log</h2>
        <p className="text-sm text-muted-foreground">
          Track all security-relevant actions taken within this project
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <Select value={actionFilter} onValueChange={handleActionChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_AUDIT_ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="project-audit-from-date" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="project-audit-from-date"
                type="date"
                className="w-36"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="project-audit-to-date" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="project-audit-to-date"
                type="date"
                className="w-36"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={applyDateFilters}>
              <Search className="mr-1 size-3" />
              Apply dates
            </Button>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="mr-1 size-3" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

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
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {log.actor ? (
                        <div>
                          <p className="text-sm font-medium">{log.actor.name || log.actor.email}</p>
                          {log.actor.name && (
                            <p className="text-xs text-muted-foreground">{log.actor.email}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action.startsWith("impersonation") ? "destructive" : "secondary"
                        }
                        className="text-xs"
                      >
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                      {log.action.startsWith("impersonation") && typeof log.metadata?.impersonator_email === "string" && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          by {log.metadata.impersonator_email}
                        </p>
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
                        <span className="text-muted-foreground/50">&mdash;</span>
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
    </div>
  );
}
