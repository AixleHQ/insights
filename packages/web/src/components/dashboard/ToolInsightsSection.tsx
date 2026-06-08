import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, DollarSign, Coins, Users, RefreshCw, LayoutGrid } from "lucide-react";
import { formatCost, formatTokens } from "@/lib/formatters";
import type { Connector } from "@/lib/types";
import {
  useToolOverview,
  useToolModels,
  useToolUsers,
  useToolDaily,
  useToolEventTypes,
  useConnectors,
  useConnectorSyncStatus,
  useSyncConnector,
} from "@/hooks/useApi";
import { ToolModelTable } from "./ToolModelTable";
import { ToolUsersTable } from "./ToolUsersTable";
import { ToolEventTypesTable } from "./ToolEventTypesTable";
import { ToolModelCostChart } from "./ToolModelCostChart";

interface ToolInsightsSectionProps {
  orgId: string;
  days: number;
  onDaysChange: (days: number) => void;
}

const DAY_OPTIONS = [7, 30, 90, 365] as const;

const PERIOD_THRESHOLDS = { month: 365, week: 60 } as const;

function periodForDays(days: number): "day" | "week" | "month" {
  if (days >= PERIOD_THRESHOLDS.month) return "month";
  if (days >= PERIOD_THRESHOLDS.week) return "week";
  return "day";
}

function labelForDays(days: number): string {
  if (days === 365) return "1y";
  return `${days}d`;
}

function humanizeDays(days: number): string {
  if (days === 365) return "1 year";
  return `${days} days`;
}

function chartTitleForPeriod(period: "day" | "week" | "month"): string {
  if (period === "month") return "Monthly Cost Trend";
  if (period === "week") return "Weekly Cost Trend";
  return "Daily Cost Trend";
}

const trendChartConfig = {
  costUsd: {
    label: "Cost",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function formatSyncTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: typeof Activity;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-bold font-mono tracking-tight">{value}</div>
        )}
        {sub && !isLoading && (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

function isActiveOpenRouterConnector(c: Connector): boolean {
  const type = c.connectorType ?? c.connector_type;
  const active = c.isActive ?? c.is_active;
  return type === "openrouter" && !!active;
}

function SyncStatusSubsection({ orgId, connectorId }: { orgId: string; connectorId: string }) {
  const { data: syncStatus, isLoading: isLoadingSync, isError: isSyncError } = useConnectorSyncStatus(orgId, connectorId);
  const { mutate: syncConnector, isPending: isSyncing } = useSyncConnector();

  function handleSyncNow() {
    syncConnector({ orgId, connectorId });
  }

  if (isLoadingSync) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">Data Sync</p>
        {isSyncError ? (
          <p className="text-xs text-destructive">Unable to fetch sync status.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Last synced: {formatSyncTime(syncStatus?.last_sync_at ?? null)}
            {syncStatus?.status === "error" && syncStatus.last_error && (
              <span className="ml-2 text-destructive">— {syncStatus.last_error}</span>
            )}
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleSyncNow}
        disabled={isSyncing}
        className="h-8 gap-1.5"
      >
        <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
        {isSyncing ? "Syncing…" : "Sync Now"}
      </Button>
    </div>
  );
}

function OpenRouterTabContent({ orgId, days, period }: { orgId: string; days: number; period: "day" | "week" | "month" }) {
  const { data: connectorsResp } = useConnectors(orgId);
  const { data: dailyResp, isLoading: isLoadingDaily } = useToolDaily(orgId, "openrouter_api", days, period);
  const { data: modelsResp, isLoading: isLoadingModels } = useToolModels(orgId, "openrouter_api", days);
  const { data: usersResp, isLoading: isLoadingUsers } = useToolUsers(orgId, "openrouter_api", days);

  const activeOpenRouterConnector = connectorsResp?.find(isActiveOpenRouterConnector);

  const daily = dailyResp?.daily ?? [];
  const models = modelsResp?.models ?? [];
  const users = usersResp?.users ?? [];

  const totalEvents = daily.reduce((s, d) => s + d.eventCount, 0);
  const totalCost = daily.reduce((s, d) => s + d.costUsd, 0);
  const activeUsers = users.length;
  const modelsUsed = models.length;

  if (!isLoadingDaily && totalEvents === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No OpenRouter events in the last {humanizeDays(days)}.
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Sync status — only shown when an active OpenRouter connector exists */}
      {activeOpenRouterConnector && (
        <SyncStatusSubsection orgId={orgId} connectorId={activeOpenRouterConnector.id} />
      )}

      {/* Overview metric cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <StatCard
          title="Total Events"
          value={totalEvents.toLocaleString()}
          icon={Activity}
          isLoading={isLoadingDaily}
        />
        <StatCard
          title="Total Cost"
          value={formatCost(totalCost)}
          icon={DollarSign}
          isLoading={isLoadingDaily}
        />
        <StatCard
          title="Models Used"
          value={String(modelsUsed)}
          icon={LayoutGrid}
          isLoading={isLoadingModels}
        />
        <StatCard
          title="Active Users"
          value={String(activeUsers)}
          icon={Users}
          isLoading={isLoadingUsers}
        />
      </div>

      {/* Cost by model chart */}
      <ToolModelCostChart models={models} isLoading={isLoadingModels} />

      {/* Full model table */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Model Breakdown</h4>
        <ToolModelTable models={models} isLoading={isLoadingModels} />
      </div>

      {/* Users table */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Top Users</h4>
        <ToolUsersTable users={users} isLoading={isLoadingUsers} />
      </div>
    </div>
  );
}

function CursorTabContent({ orgId, days, period }: { orgId: string; days: number; period: "day" | "week" | "month" }) {
  const { data: dailyResp, isLoading: isLoadingDaily } = useToolDaily(orgId, "cursor", days, period);
  const { data: modelsResp, isLoading: isLoadingModels } = useToolModels(orgId, "cursor", days);
  const { data: usersResp, isLoading: isLoadingUsers } = useToolUsers(orgId, "cursor", days);
  const { data: eventTypesResp, isLoading: isLoadingEventTypes } = useToolEventTypes(orgId, "cursor", days);

  const daily = dailyResp?.daily ?? [];
  const models = modelsResp?.models ?? [];
  const users = usersResp?.users ?? [];
  const eventTypes = eventTypesResp?.eventTypes ?? [];

  const totalEvents = daily.reduce((s, d) => s + d.eventCount, 0);
  const totalCost = daily.reduce((s, d) => s + d.costUsd, 0);
  const totalTokensIn = daily.reduce((s, d) => s + d.tokensIn, 0);
  const totalTokensOut = daily.reduce((s, d) => s + d.tokensOut, 0);
  const activeUsers = users.length;

  const chartData = daily.map((d) => ({
    date: formatDate(d.date),
    costUsd: d.costUsd,
  }));

  if (!isLoadingDaily && totalEvents === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No Cursor events in the last {humanizeDays(days)}.
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Overview metric cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          title="Total Events"
          value={totalEvents.toLocaleString()}
          icon={Activity}
          isLoading={isLoadingDaily}
        />
        <StatCard
          title="Total Cost"
          value={formatCost(totalCost)}
          icon={DollarSign}
          isLoading={isLoadingDaily}
        />
        <StatCard
          title="Tokens In"
          value={formatTokens(totalTokensIn)}
          icon={Coins}
          isLoading={isLoadingDaily}
        />
        <StatCard
          title="Tokens Out"
          value={formatTokens(totalTokensOut)}
          icon={Coins}
          isLoading={isLoadingDaily}
        />
        <StatCard
          title="Active Users"
          value={String(activeUsers)}
          icon={Users}
          isLoading={isLoadingUsers}
        />
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">{chartTitleForPeriod(period)}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingDaily ? (
            <div className="flex h-[180px] items-center justify-center">
              <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            </div>
          ) : (
            <ChartContainer config={trendChartConfig} className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cursorCostGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    width={45}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCost(value as number)}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="costUsd"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#cursorCostGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Model and event type tables */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Model Breakdown</h4>
          <ToolModelTable models={models} isLoading={isLoadingModels} />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Event Types</h4>
          <ToolEventTypesTable eventTypes={eventTypes} isLoading={isLoadingEventTypes} />
        </div>
      </div>

      {/* Users table */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Top Users</h4>
        <ToolUsersTable users={users} isLoading={isLoadingUsers} />
      </div>
    </div>
  );
}

function AnthropicTabContent({ orgId, days, period }: { orgId: string; days: number; period: "day" | "week" | "month" }) {
  const { data: dailyResp, isLoading: isLoadingDaily } = useToolDaily(orgId, "anthropic_api", days, period);
  const { data: modelsResp, isLoading: isLoadingModels } = useToolModels(orgId, "anthropic_api", days);
  const { data: usersResp, isLoading: isLoadingUsers } = useToolUsers(orgId, "anthropic_api", days);

  const daily = dailyResp?.daily ?? [];
  const models = modelsResp?.models ?? [];
  const users = usersResp?.users ?? [];

  const totalEvents = daily.reduce((s, d) => s + d.eventCount, 0);
  const totalCost = daily.reduce((s, d) => s + d.costUsd, 0);
  const totalTokensIn = daily.reduce((s, d) => s + d.tokensIn, 0);
  const totalTokensOut = daily.reduce((s, d) => s + d.tokensOut, 0);

  if (!isLoadingDaily && totalEvents === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No Anthropic API events in the last {humanizeDays(days)}.
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <StatCard title="Total Events" value={totalEvents.toLocaleString()} icon={Activity} isLoading={isLoadingDaily} />
        <StatCard title="Total Cost" value={formatCost(totalCost)} icon={DollarSign} isLoading={isLoadingDaily} />
        <StatCard title="Tokens In" value={formatTokens(totalTokensIn)} icon={Coins} isLoading={isLoadingDaily} />
        <StatCard title="Tokens Out" value={formatTokens(totalTokensOut)} icon={Coins} isLoading={isLoadingDaily} />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Model Breakdown</h4>
        <ToolModelTable models={models} isLoading={isLoadingModels} />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Top Users</h4>
        <ToolUsersTable users={users} isLoading={isLoadingUsers} />
      </div>
    </div>
  );
}

// Maps tab value → connector_type used to find the right connector for sync
const TAB_TO_CONNECTOR: Record<string, string> = {
  cursor: "cursor",
  openrouter_api: "openrouter",
  anthropic_api: "anthropic",
};

export function ToolInsightsSection({ orgId, days, onDaysChange }: ToolInsightsSectionProps) {
  const queryClient = useQueryClient();
  const { data: cursorOverview, isLoading: isLoadingCursor } = useToolOverview(orgId, "cursor");
  const { data: openrouterOverview, isLoading: isLoadingOpenrouter } = useToolOverview(orgId, "openrouter_api");
  const { data: anthropicOverview, isLoading: isLoadingAnthropic } = useToolOverview(orgId, "anthropic_api");
  const { data: connectors } = useConnectors(orgId);
  const { mutateAsync: syncConnector } = useSyncConnector();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const cursorHasData = (cursorOverview?.total_events ?? 0) > 0;
  const openrouterHasData = (openrouterOverview?.total_events ?? 0) > 0;
  const anthropicHasData = (anthropicOverview?.total_events ?? 0) > 0;

  const resolvedTab = activeTab ?? (cursorHasData ? "cursor" : openrouterHasData ? "openrouter_api" : "anthropic_api");

  async function handleRefreshNow() {
    const connectorType = TAB_TO_CONNECTOR[resolvedTab];
    if (!connectorType) return;

    const connector = (connectors ?? []).find((c) => {
      const type = c.connectorType ?? c.connector_type;
      const active = c.isActive ?? c.is_active;
      return type === connectorType && active;
    });

    setIsRefreshing(true);
    try {
      if (connector) {
        await syncConnector({ orgId, connectorId: connector.id });
      }
      // Invalidate only the stats for the active tool
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "stats", "tools", resolvedTab],
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  // Don't render until all overviews have resolved — avoids a flash where
  // one finishes with 0 events before the others have returned any data.
  if (isLoadingCursor || isLoadingOpenrouter || isLoadingAnthropic) {
    return null;
  }

  // Only render if at least one tool has data
  if (!cursorHasData && !openrouterHasData && !anthropicHasData) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">Tool Insights</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleRefreshNow}
            disabled={isRefreshing}
          >
            <RefreshCw className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Syncing..." : "Refresh Now"}
          </Button>
          <div className="flex gap-1">
            {DAY_OPTIONS.map((d) => (
              <Button
                key={d}
                variant={days === d ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => onDaysChange(d)}
              >
                {labelForDays(d)}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={resolvedTab} onValueChange={setActiveTab}>
          <TabsList>
            {cursorHasData && <TabsTrigger value="cursor">Cursor</TabsTrigger>}
            {openrouterHasData && (
              <TabsTrigger value="openrouter_api">OpenRouter</TabsTrigger>
            )}
            {anthropicHasData && (
              <TabsTrigger value="anthropic_api">Anthropic API</TabsTrigger>
            )}
          </TabsList>

          {cursorHasData && (
            <TabsContent value="cursor">
              <CursorTabContent orgId={orgId} days={days} period={periodForDays(days)} />
            </TabsContent>
          )}

          {openrouterHasData && (
            <TabsContent value="openrouter_api">
              <OpenRouterTabContent orgId={orgId} days={days} period={periodForDays(days)} />
            </TabsContent>
          )}

          {anthropicHasData && (
            <TabsContent value="anthropic_api">
              <AnthropicTabContent orgId={orgId} days={days} period={periodForDays(days)} />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
