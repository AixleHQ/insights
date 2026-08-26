import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderLogo } from "@/components/icons";
import { cn, humanizeToolName } from "@/lib/utils";
import { formatCost, formatCount, formatTokens } from "@/lib/formatters";
import type { MemberDashboardToolRow, MemberDashboardModelRow } from "@/hooks/useApi";

type UsageView = "tool" | "model";

const USAGE_HEAD_CLASS = "text-xs font-medium text-muted-foreground";
const USAGE_CELL_CLASS = "py-4 px-2";
const USAGE_NUMERIC_CLASS = "text-right text-sm tabular-nums";
const USAGE_TOOL_NAME_CLASS = "text-sm";

interface MemberUsageTableProps {
  toolBreakdown: MemberDashboardToolRow[];
  modelBreakdown: MemberDashboardModelRow[];
  isLoading?: boolean;
  className?: string;
}

export function MemberUsageTable({
  toolBreakdown,
  modelBreakdown,
  isLoading,
  className,
}: MemberUsageTableProps) {
  const [view, setView] = useState<UsageView>("tool");

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <span className="type-body-lg font-medium">Usage</span>
        <Tabs value={view} onValueChange={(v) => setView(v as UsageView)}>
          <TabsList>
            <TabsTrigger value="tool">Tool</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : view === "tool" ? (
          <UsageToolTable rows={toolBreakdown} />
        ) : (
          <UsageModelTable rows={modelBreakdown} />
        )}
      </CardContent>
    </Card>
  );
}

function UsageToolTable({ rows }: { rows: MemberDashboardToolRow[] }) {
  if (rows.length === 0) {
    return <EmptyUsage message="No tool usage data for this period" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={USAGE_HEAD_CLASS}>Tool</TableHead>
          <TableHead className={cn(USAGE_HEAD_CLASS, "text-right")}>Events</TableHead>
          <TableHead className={cn(USAGE_HEAD_CLASS, "text-right")}>Tokens in / out</TableHead>
          <TableHead className={cn(USAGE_HEAD_CLASS, "text-right")}>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.tool_name}>
            <TableCell className={USAGE_CELL_CLASS}>
              <div className="flex items-center gap-2">
                <ProviderLogo
                  provider={row.tool_name}
                  size="sm"
                  showBackground
                  className="shrink-0 !size-8"
                />
                <span className={USAGE_TOOL_NAME_CLASS}>{humanizeToolName(row.tool_name)}</span>
              </div>
            </TableCell>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_NUMERIC_CLASS)}>
              {formatCount(row.event_count)}
            </TableCell>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_NUMERIC_CLASS)}>
              {formatTokens(row.tokens_in)} / {formatTokens(row.tokens_out)}
            </TableCell>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_NUMERIC_CLASS)}>
              {formatCost(row.cost_usd)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UsageModelTable({ rows }: { rows: MemberDashboardModelRow[] }) {
  if (rows.length === 0) {
    return <EmptyUsage message="No model usage data for this period" />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className={USAGE_HEAD_CLASS}>Model</TableHead>
          <TableHead className={cn(USAGE_HEAD_CLASS, "text-right")}>Events</TableHead>
          <TableHead className={cn(USAGE_HEAD_CLASS, "text-right")}>Tokens in / out</TableHead>
          <TableHead className={cn(USAGE_HEAD_CLASS, "text-right")}>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.model}>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_TOOL_NAME_CLASS)}>{row.model}</TableCell>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_NUMERIC_CLASS)}>
              {formatCount(row.event_count)}
            </TableCell>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_NUMERIC_CLASS)}>
              {formatTokens(row.tokens_in)} / {formatTokens(row.tokens_out)}
            </TableCell>
            <TableCell className={cn(USAGE_CELL_CLASS, USAGE_NUMERIC_CLASS)}>
              {formatCost(row.cost_usd)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptyUsage({ message }: { message: string }) {
  return (
    <p className={cn("py-8 text-center text-sm text-muted-foreground")}>{message}</p>
  );
}
