import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { cn, getToolColor, humanizeToolName } from "@/lib/utils";
import { formatCount } from "@/lib/formatters";
import { ErrorState } from "@/components/ui/error-state";
import type { DailyToolData } from "@/hooks/useApi";
import { type TimeRange, TIME_RANGE_OPTIONS } from "@/lib/chartUtils";

interface ToolUsageByDayChartProps {
  data: DailyToolData[];
  tools: string[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

function getToolDisplayName(tool: string): string {
  return humanizeToolName(tool);
}

function formatDate(dateStr: string, range: TimeRange): string {
  const date = new Date(dateStr);
  if (range === "7d") {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  if (range === "1y") {
    return date.toLocaleDateString("en-US", { month: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getRangeLabel(range: TimeRange): string {
  return TIME_RANGE_OPTIONS.find((opt) => opt.value === range)?.label || "30 days";
}

export function ToolUsageByDayChart({ data, tools, isLoading, isError, onRetry, className, timeRange, onTimeRangeChange }: ToolUsageByDayChartProps) {
  const filteredData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      dateLabel: formatDate(item.date, timeRange),
    })) as (DailyToolData & { dateLabel: string })[];
  }, [data, timeRange]);

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    tools.forEach((tool) => {
      config[tool] = {
        label: getToolDisplayName(tool),
        color: getToolColor(tool),
      };
    });
    return config;
  }, [tools]);

  const totalEvents = useMemo(() => {
    return filteredData.reduce((sum, day) => {
      return sum + tools.reduce((daySum, tool) => daySum + (Number(day[tool]) || 0), 0);
    }, 0);
  }, [filteredData, tools]);

  return (
    <Card className={cn("col-span-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Usage by Tool</CardTitle>
          <CardDescription className="text-xs">
            {formatCount(totalEvents)} events in the last {getRangeLabel(timeRange)}
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={(value) => onTimeRangeChange(value as TimeRange)}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="flex h-[280px] items-center justify-center">
            <ErrorState
              compact
              title="Could not load chart"
              description="Something went wrong fetching the data."
              onRetry={onRetry}
            />
          </div>
        ) : isLoading ? (
          <div className="flex h-[280px] items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs text-muted-foreground"
                  tick={{ fill: "currentColor", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  className="text-xs text-muted-foreground"
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
                            style={{ backgroundColor: getToolColor(name as string) }}
                          />
                          <span>{getToolDisplayName(name as string)}: {value}</span>
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
                    <span className="text-xs text-muted-foreground">{getToolDisplayName(value as string)}</span>
                  )}
                />
                {tools.map((tool) => (
                  <Bar
                    key={tool}
                    dataKey={tool}
                    fill={getToolColor(tool)}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
