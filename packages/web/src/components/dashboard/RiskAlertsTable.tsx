import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProviderLogo } from "@/components/icons";
import { useOrgRiskAlerts } from "@/hooks/useApi";
import { humanizeToolName } from "@/lib/utils";
import { formatCost, formatTokens, formatCount, periodLabel } from "@/lib/formatters";
import { projectScopeLabel } from "@/lib/dashboardUtils";
import { cn } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";
import type { DashboardPeriod } from "@/lib/types";

interface RiskAlertsTableProps {
  orgId: string;
  projectId?: string;
  projects?: { id: string; name: string }[];
  period?: DashboardPeriod;
  className?: string;
}

/** Figma Eng Lead Risk Alerts: muted mixed-case headers, 16×8 cell padding. */
const HEAD_CLASS = "text-xs font-medium text-muted-foreground";
const CELL_CLASS = "py-4 px-2";
const NUMERIC_CLASS = "text-right text-sm tabular-nums";
const TOOL_NAME_CLASS = "text-sm";

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell className={CELL_CLASS}>
        <Skeleton className="h-8 w-36" />
      </TableCell>
      <TableCell className={cn(CELL_CLASS, "text-right")}>
        <Skeleton className="ml-auto h-4 w-12" />
      </TableCell>
      <TableCell className={cn(CELL_CLASS, "text-right")}>
        <Skeleton className="ml-auto h-4 w-28" />
      </TableCell>
      <TableCell className={cn(CELL_CLASS, "text-right")}>
        <Skeleton className="ml-auto h-4 w-14" />
      </TableCell>
    </TableRow>
  );
}

export function RiskAlertsTable({ orgId, projectId, projects, period, className }: RiskAlertsTableProps) {
  const navigate = useNavigate();
  const { data: rows, isLoading, isError, refetch } = useOrgRiskAlerts(orgId, projectId, period);

  const handleRowClick = (toolName: string) => {
    navigate(`${AppRoutes.events.root}?tool_name=${encodeURIComponent(toolName)}&risk_level=not_none`);
  };

  const scopeLabel = projects ? projectScopeLabel(projectId, projects, "Risk alerts") : undefined;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <span className="type-body-lg font-medium">Risk Alerts</span>
        {scopeLabel && (
          <CardDescription className="text-xs">
            {scopeLabel}
            {period && ` · ${periodLabel(period)}`}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={HEAD_CLASS}>Tool</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-right")}>Events</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-right")}>Tokens in / out</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-right")}>Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24">
                  <ErrorState
                    compact
                    title="Could not load risk alerts"
                    description="Something went wrong fetching the data."
                    onRetry={() => refetch()}
                  />
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <CheckCircle className="size-6 text-green-500" />
                    <span className="text-sm">No risk events detected</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={row.toolName}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(row.toolName)}
                >
                  <TableCell className={CELL_CLASS}>
                    <div className="flex items-center gap-2">
                      <ProviderLogo
                        provider={row.toolName}
                        size="sm"
                        showBackground
                        className="shrink-0 !size-8"
                      />
                      <span className={TOOL_NAME_CLASS}>{humanizeToolName(row.toolName)}</span>
                    </div>
                  </TableCell>
                  <TableCell className={cn(CELL_CLASS, NUMERIC_CLASS)}>
                    {formatCount(row.eventCount)}
                  </TableCell>
                  <TableCell className={cn(CELL_CLASS, NUMERIC_CLASS)}>
                    {formatTokens(row.tokensIn)} / {formatTokens(row.tokensOut)}
                  </TableCell>
                  <TableCell className={cn(CELL_CLASS, NUMERIC_CLASS)}>
                    {formatCost(row.costUsd)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
