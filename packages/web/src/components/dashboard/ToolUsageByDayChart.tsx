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
import type { DailyToolData } from "@/hooks/useApi";

interface ToolUsageByDayChartProps {
  data: DailyToolData[];
  tools: string[];
  isLoading?: boolean;
  className?: string;
  onDaysChange?: (days: number) => void;
}

type TimeRange = "7d" | "30d" | "60d" | "90d" | "1y";

const DEFAULT_TIME_RANGE: TimeRange = "7d";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; days: number }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "60d", label: "60 days", days: 60 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "1y", label: "1 year", days: 365 },
];

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

function getDaysForRange(range: TimeRange): number {
  return TIME_RANGE_OPTIONS.find((opt) => opt.value === range)?.days || 30;
}

function getRangeLabel(range: TimeRange): string {
  return TIME_RANGE_OPTIONS.find((opt) => opt.value === range)?.label || "30 days";
}

export const TOOL_USAGE_DEFAULT_DAYS = 7;

export function ToolUsageByDayChart({ data, tools, isLoading, className, onDaysChange }: ToolUsageByDayChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);

  const handleTimeRangeChange = (value: string) => {
    const range = value as TimeRange;
    setTimeRange(range);
    onDaysChange?.(getDaysForRange(range));
  };

  const filteredData = useMemo(() => {
    const days = getDaysForRange(timeRange);
    const sliced = data.slice(-days);
    return sliced.map((item) => ({
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
            {totalEvents.toLocaleString()} events in the last {getRangeLabel(timeRange)}
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={handleTimeRangeChange}>
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
        {isLoading ? (
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
