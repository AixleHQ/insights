import { useState, useId } from "react";
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
import { formatCost, formatTokens, formatCount } from "@/lib/formatters";
import {
  useActiveTools,
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
import { ErrorState } from "@/components/ui/error-state";

interface ToolInsightsSectionProps {
  orgId: string;
  days: number;
  onDaysChange: (days: number) => void;
  projectId?: string;
}

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  github_copilot: "GitHub Copilot",
  aider: "Aider",
  continue: "Continue",
  cody: "Cody",
  tabnine: "Tabnine",
  amazon_q: "Amazon Q",
  openrouter_api: "OpenRouter",
  anthropic_api: "Anthropic API",
  openai_api: "OpenAI API",
  gemini_api: "Gemini API",
};

const TOOL_CONNECTOR: Record<string, string> = {
  cursor: "cursor",
  github_copilot: "github_copilot",
  openrouter_api: "openrouter",
  anthropic_api: "anthropic",
  openai_api: "openai",
  gemini_api: "gemini",
};

const TOOLS_WITH_EVENT_TYPES = new Set(["claude_code", "cursor", "windsurf", "github_copilot"]);
const TOOLS_WITH_COST_CHART = new Set(["openrouter_api"]);

function toolLabel(slug: string): string {
  return TOOL_LABELS[slug] ?? slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
        <CardTitle className="type-label text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="type-h2 font-mono">{value}</div>
        )}
        {sub && !isLoading && (
          <p className="mt-1 type-caption text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
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
        <p className="type-label">Data Sync</p>
        {isSyncError ? (
          <p className="text-xs text-destructive">Unable to fetch sync status.</p>
        ) : (
          <p className="type-caption text-muted-foreground">
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

function ToolTabContent({
  orgId,
  toolSlug,
  days,
  period,
  projectId,
}: {
  orgId: string;
  toolSlug: string;
  days: number;
  period: "day" | "week" | "month";
  projectId?: string;
}) {
  const gradientId = useId();
  const connectorType = TOOL_CONNECTOR[toolSlug] ?? null;
  const showEventTypes = TOOLS_WITH_EVENT_TYPES.has(toolSlug);
  const showCostChart = TOOLS_WITH_COST_CHART.has(toolSlug);
  const label = toolLabel(toolSlug);

  const { data: connectorsResp } = useConnectors(orgId);
  const { data: dailyResp, isLoading: isLoadingDaily, isError: isErrorDaily, refetch: refetchDaily } = useToolDaily(orgId, toolSlug, days, period === "month" ? undefined : period, projectId);
  const { data: modelsResp, isLoading: isLoadingModels, isError: isErrorModels, refetch: refetchModels } = useToolModels(orgId, toolSlug, days, projectId);
  const { data: usersResp, isLoading: isLoadingUsers, isError: isErrorUsers, refetch: refetchUsers } = useToolUsers(orgId, toolSlug, days, projectId);
  const { data: eventTypesResp, isLoading: isLoadingEventTypes, isError: isErrorEventTypes, refetch: refetchEventTypes } = useToolEventTypes(orgId, showEventTypes ? toolSlug : "", days, projectId);

  const activeConnector = connectorType
    ? connectorsResp?.find((c) => {
        const type = c.connectorType ?? c.connector_type;
        const active = c.isActive ?? c.is_active;
        return type === connectorType && !!active;
      })
    : undefined;

  const daily = dailyResp?.daily ?? [];
  const models = modelsResp?.models ?? [];
  const users = usersResp?.users ?? [];
  const eventTypes = eventTypesResp?.eventTypes ?? [];

  const totalEvents = daily.reduce((s, d) => s + d.eventCount, 0);
  const totalCost = daily.reduce((s, d) => s + d.costUsd, 0);
  const totalTokensIn = daily.reduce((s, d) => s + d.tokensIn, 0);
  const totalTokensOut = daily.reduce((s, d) => s + d.tokensOut, 0);
  const activeUsers = users.length;
  const modelsUsed = models.length;

  const chartData = daily.map((d) => ({
    date: formatDate(d.date),
    costUsd: d.costUsd,
  }));

  if (!isLoadingDaily && !isErrorDaily && totalEvents === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No {label} events in the last {humanizeDays(days)}.
      </div>
    );
  }

  if (isErrorDaily && !isLoadingDaily) {
    return (
      <div className="flex h-40 items-center justify-center">
        <ErrorState
          compact
          title="Could not load data"
          description={`Something went wrong fetching ${label} data.`}
          onRetry={() => refetchDaily()}
        />
      </div>
    );
  }

  const hasTokenData = totalTokensIn > 0 || totalTokensOut > 0;

  return (
    <div className="space-y-6 mt-4">
      {activeConnector && (
        <SyncStatusSubsection orgId={orgId} connectorId={activeConnector.id} />
      )}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Total Events" value={formatCount(totalEvents)} icon={Activity} isLoading={isLoadingDaily} />
        <StatCard title="Total Cost" value={formatCost(totalCost)} icon={DollarSign} isLoading={isLoadingDaily} />
        {hasTokenData && (
          <>
            <StatCard title="Tokens In" value={formatTokens(totalTokensIn)} icon={Coins} isLoading={isLoadingDaily} />
            <StatCard title="Tokens Out" value={formatTokens(totalTokensOut)} icon={Coins} isLoading={isLoadingDaily} />
          </>
        )}
        {!hasTokenData && (
          <StatCard title="Models Used" value={String(modelsUsed)} icon={LayoutGrid} isLoading={isLoadingModels} />
        )}
        <StatCard title="Active Users" value={String(activeUsers)} icon={Users} isLoading={isLoadingUsers} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="type-body-lg font-medium">{chartTitleForPeriod(period)}</CardTitle>
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
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
                    fill={`url(#${gradientId})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {showCostChart && (
        <ToolModelCostChart models={models} isLoading={isLoadingModels} isError={isErrorModels} onRetry={() => refetchModels()} />
      )}

      {showEventTypes && eventTypes.length > 0 ? (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <div className="space-y-2">
            <h4 className="type-label text-muted-foreground">Model Breakdown</h4>
            <ToolModelTable models={models} isLoading={isLoadingModels} isError={isErrorModels} onRetry={() => refetchModels()} />
          </div>
          <div className="space-y-2">
            <h4 className="type-label text-muted-foreground">Event Types</h4>
            <ToolEventTypesTable eventTypes={eventTypes} isLoading={isLoadingEventTypes} isError={isErrorEventTypes} onRetry={() => refetchEventTypes()} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <h4 className="type-label text-muted-foreground">Model Breakdown</h4>
          <ToolModelTable models={models} isLoading={isLoadingModels} isError={isErrorModels} onRetry={() => refetchModels()} />
        </div>
      )}

      <div className="space-y-2">
        <h4 className="type-label text-muted-foreground">Top Users</h4>
        <ToolUsersTable users={users} isLoading={isLoadingUsers} isError={isErrorUsers} onRetry={() => refetchUsers()} />
      </div>
    </div>
  );
}

export function ToolInsightsSection({ orgId, days, onDaysChange, projectId }: ToolInsightsSectionProps) {
  const queryClient = useQueryClient();
  const { data: activeToolsResp, isLoading } = useActiveTools(orgId);
  const { data: connectors } = useConnectors(orgId);
  const { mutateAsync: syncConnector } = useSyncConnector();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const toolsWithData = activeToolsResp?.tools ?? [];
  const resolvedTab = activeTab ?? toolsWithData[0]?.tool_name ?? "";

  async function handleRefreshNow() {
    const connectorType = TOOL_CONNECTOR[resolvedTab];

    setIsRefreshing(true);
    try {
      if (connectorType) {
        const connector = (connectors ?? []).find((c) => {
          const type = c.connectorType ?? c.connector_type;
          const active = c.isActive ?? c.is_active;
          return type === connectorType && active;
        });
        if (connector) {
          await syncConnector({ orgId, connectorId: connector.id });
        }
      }
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "stats", "tools", resolvedTab],
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isLoading) {
    return null;
  }

  if (toolsWithData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="type-h4">Tool Insights</CardTitle>
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
            {toolsWithData.map((tool) => (
              <TabsTrigger key={tool.tool_name} value={tool.tool_name}>
                {toolLabel(tool.tool_name)}
              </TabsTrigger>
            ))}
          </TabsList>

          {toolsWithData.map((tool) => (
            <TabsContent key={tool.tool_name} value={tool.tool_name}>
              <ToolTabContent
                orgId={orgId}
                toolSlug={tool.tool_name}
                days={days}
                period={periodForDays(days)}
                projectId={projectId}
              />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
