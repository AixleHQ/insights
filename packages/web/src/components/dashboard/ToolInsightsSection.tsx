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
import { Activity, DollarSign, Coins, Users } from "lucide-react";
import {
  useToolOverview,
  useToolModels,
  useToolUsers,
  useToolDaily,
  useToolEventTypes,
} from "@/hooks/useApi";
import { ToolModelTable } from "./ToolModelTable";
import { ToolUsersTable } from "./ToolUsersTable";
import { ToolEventTypesTable } from "./ToolEventTypesTable";

interface ToolInsightsSectionProps {
  orgId: string;
  days: number;
  onDaysChange: (days: number) => void;
}

const DAY_OPTIONS = [7, 30, 90] as const;

const trendChartConfig = {
  costUsd: {
    label: "Cost",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function formatCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.001) return `$${n.toFixed(6)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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

function CursorTabContent({ orgId, days }: { orgId: string; days: number }) {
  const { data: dailyResp, isLoading: isLoadingDaily } = useToolDaily(orgId, "cursor", days);
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
        No Cursor events in the last {days} days.
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
          <CardTitle className="text-base font-medium">Daily Cost Trend</CardTitle>
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

export function ToolInsightsSection({ orgId, days, onDaysChange }: ToolInsightsSectionProps) {
  const { data: cursorOverview, isLoading: isLoadingCursor } = useToolOverview(orgId, "cursor");
  const { data: openrouterOverview, isLoading: isLoadingOpenrouter } = useToolOverview(orgId, "openrouter_api");

  const cursorHasData = (cursorOverview?.total_events ?? 0) > 0;
  const openrouterHasData = (openrouterOverview?.total_events ?? 0) > 0;

  // Don't render until both overviews have resolved — avoids a flash where
  // one finishes with 0 events before the other has returned any data.
  if (isLoadingCursor || isLoadingOpenrouter) {
    return null;
  }

  // Only render if at least one tool has data
  if (!cursorHasData && !openrouterHasData) {
    return null;
  }

  const defaultTab = cursorHasData ? "cursor" : "openrouter_api";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-semibold">Tool Insights</CardTitle>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((d) => (
            <Button
              key={d}
              variant={days === d ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => onDaysChange(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs key={`${orgId}-${defaultTab}`} defaultValue={defaultTab}>
          <TabsList>
            {cursorHasData && <TabsTrigger value="cursor">Cursor</TabsTrigger>}
            {openrouterHasData && (
              <TabsTrigger value="openrouter_api">OpenRouter</TabsTrigger>
            )}
          </TabsList>

          {cursorHasData && (
            <TabsContent value="cursor">
              <CursorTabContent orgId={orgId} days={days} />
            </TabsContent>
          )}

          {openrouterHasData && (
            <TabsContent value="openrouter_api">
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                OpenRouter insights coming soon.
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
