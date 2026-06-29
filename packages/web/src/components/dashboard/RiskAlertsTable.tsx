import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useOrgRiskAlerts } from "@/hooks/useApi";
import { humanizeToolName } from "@/lib/utils";
import { formatCost, formatTokens, formatCount } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";
import type { DashboardPeriod } from "@/lib/types";

interface RiskAlertsTableProps {
  orgId: string;
  projectId?: string;
  period?: DashboardPeriod;
  className?: string;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
      <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-14 ml-auto" /></TableCell>
    </TableRow>
  );
}

export function RiskAlertsTable({ orgId, projectId, period, className }: RiskAlertsTableProps) {
  const navigate = useNavigate();
  const { data: rows, isLoading, isError, refetch } = useOrgRiskAlerts(orgId, projectId, period);

  const handleRowClick = (toolName: string) => {
    navigate(`${AppRoutes.events.root}?tool_name=${encodeURIComponent(toolName)}&risk_level=not_none`);
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Risk Alerts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="hidden md:table-cell text-right">Tokens In</TableHead>
              <TableHead className="hidden md:table-cell text-right">Tokens Out</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24">
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
                <TableCell colSpan={5} className="h-24 text-center">
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
                  <TableCell className="font-medium">{humanizeToolName(row.toolName)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCount(row.eventCount)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">
                    {formatTokens(row.tokensIn)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-sm text-muted-foreground">
                    {formatTokens(row.tokensOut)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
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
