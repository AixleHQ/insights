import { useState, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartSkeleton } from "@/components/ui/skeletons";
import { ErrorState } from "@/components/ui/error-state";
import { cn, getToolColor, humanizeToolName } from "@/lib/utils";
import { useDailyByTool, useDailyByModel } from "@/hooks/useApi";
import type { DashboardPeriod } from "@/lib/types";
import { currentMonth, getLast12Months } from "@/lib/dashboardUtils";

interface WeeklyToolUsageChartProps {
  orgId: string;
  projectId?: string;
  externalPeriod?: DashboardPeriod;
  className?: string;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
}

const MODEL_PALETTE = [
  "hsl(221 83% 53%)",
  "hsl(142 71% 45%)",
  "hsl(339 90% 51%)",
  "hsl(32 95% 55%)",
  "hsl(271 91% 65%)",
  "hsl(199 89% 48%)",
  "hsl(0 72% 51%)",
  "hsl(60 100% 38%)",
];

function getModelColor(index: number): string {
  return MODEL_PALETTE[index % MODEL_PALETTE.length];
}

function formatWeekDate(dateStr: string): string {
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (start.getMonth() === end.getMonth()) {
    return `${fmt(start)} – ${end.getDate()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

export function WeeklyToolUsageChart({ orgId, projectId, externalPeriod, className, selectedMonth: selectedMonthProp, onMonthChange }: WeeklyToolUsageChartProps) {
  const [groupBy, setGroupBy] = useState<"tool" | "model">("tool");
  const [internalMonth, setInternalMonth] = useState(currentMonth);

  const months = useMemo(() => getLast12Months(), []);

  const controlled = !!externalPeriod;
  const isAllTime = externalPeriod?.type === "all_time";

  const selectedMonth = selectedMonthProp ?? internalMonth;
  const setSelectedMonth = onMonthChange ?? setInternalMonth;

  const opts = useMemo(() => {
    if (isAllTime) return { allTime: true, period: "month" as const, projectId };
    const month = externalPeriod?.value ?? selectedMonth;
    return { period: "week" as const, month, projectId };
  }, [isAllTime, externalPeriod, selectedMonth, projectId]);

  const { data: toolData, isLoading: isLoadingTool, isError: isErrorTool, refetch: refetchTool } = useDailyByTool(orgId, opts);
  const { data: modelData, isLoading: isLoadingModel, isError: isErrorModel, refetch: refetchModel } = useDailyByModel(orgId, opts);

  const isLoading = groupBy === "tool" ? isLoadingTool : isLoadingModel;
  const isError = groupBy === "tool" ? isErrorTool : isErrorModel;
  const refetch = groupBy === "tool" ? refetchTool : refetchModel;

  const useMonthlyLabels = isAllTime || opts.period === "month";

  const { keys, chartData, chartConfig } = useMemo(() => {
    const formatLabel = (dateStr: string) =>
      useMonthlyLabels
        ? new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : formatWeekDate(dateStr);

    if (groupBy === "tool") {
      const tools = toolData?.tools ?? [];
      const data = (toolData?.data ?? []).map((row) => ({
        ...row,
        dateLabel: formatLabel(row.date),
      }));
      const config: ChartConfig = {};
      tools.forEach((tool) => {
        config[tool] = { label: humanizeToolName(tool), color: getToolColor(tool) };
      });
      return { keys: tools, chartData: data, chartConfig: config };
    } else {
      const models = modelData?.models ?? [];
      const data = (modelData?.data ?? []).map((row) => ({
        ...row,
        dateLabel: formatLabel(row.date),
      }));
      const config: ChartConfig = {};
      models.forEach((model, i) => {
        config[model] = { label: model, color: getModelColor(i) };
      });
      return { keys: models, chartData: data, chartConfig: config };
    }
  }, [groupBy, toolData, modelData, useMonthlyLabels]);

  const getColor = (key: string, index: number) =>
    groupBy === "tool" ? getToolColor(key) : getModelColor(index);

  return (
    <Card className={cn("col-span-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">
          {isAllTime ? "Monthly Usage" : "Weekly Usage"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              size="sm"
              variant={groupBy === "tool" ? "default" : "ghost"}
              className="rounded-none border-0 h-8 text-xs"
              onClick={() => setGroupBy("tool")}
            >
              Tool
            </Button>
            <Button
              size="sm"
              variant={groupBy === "model" ? "default" : "ghost"}
              className="rounded-none border-0 h-8 text-xs"
              onClick={() => setGroupBy("model")}
            >
              Model
            </Button>
          </div>
          {!controlled && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex h-[280px] items-center justify-center">
            <ErrorState
              compact
              title="Could not load chart"
              description="Something went wrong fetching the data."
              onRetry={() => refetch()}
            />
          </div>
        ) : isLoading ? (
          <ChartSkeleton height={280} />
        ) : chartData.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            No data for this period.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  width={40}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: getColor(name as string, keys.indexOf(name as string)) }}
                          />
                          <span>
                            {groupBy === "tool" ? humanizeToolName(name as string) : (name as string)}: {value}
                          </span>
                        </span>
                      )}
                    />
                  }
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: "10px" }}
                  iconType="circle"
                  iconSize={8}
                  formatter={(value) => (
                    <span className="text-xs text-muted-foreground">
                      {groupBy === "tool" ? humanizeToolName(value as string) : (value as string)}
                    </span>
                  )}
                />
                {keys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={getColor(key, i)} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
