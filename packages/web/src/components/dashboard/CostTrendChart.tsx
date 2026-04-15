import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface DailyCostData {
  date: string;
  cost: number;
  events: number;
}

interface CostTrendChartProps {
  data: DailyCostData[];
  isLoading?: boolean;
  className?: string;
}

type TimeRange = "7d" | "30d";

const chartConfig = {
  cost: {
    label: "Cost",
    color: "var(--chart-1)",
  },
  events: {
    label: "Events",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function formatDate(dateStr: string, range: TimeRange): string {
  const date = new Date(dateStr);
  if (range === "7d") {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function CostTrendChart({ data, isLoading, className }: CostTrendChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const filteredData = timeRange === "7d" ? data.slice(-7) : data.slice(-30);
  const formattedData = filteredData.map((item) => ({
    ...item,
    dateLabel: formatDate(item.date, timeRange),
  }));

  const totalCost = filteredData.reduce((sum, item) => sum + item.cost, 0);
  const avgCost = filteredData.length > 0 ? totalCost / filteredData.length : 0;

  return (
    <Card className={cn("col-span-full lg:col-span-2", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Cost Trend</CardTitle>
          <CardDescription className="text-xs">
            Total: {formatCurrency(totalCost)} | Avg: {formatCurrency(avgCost)}/day
          </CardDescription>
        </div>
        <div className="flex gap-1">
          <Button
            variant={timeRange === "7d" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTimeRange("7d")}
          >
            7 days
          </Button>
          <Button
            variant={timeRange === "30d" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTimeRange("30d")}
          >
            30 days
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[200px] items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={(value) => `$${value}`}
                  className="text-xs text-muted-foreground"
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  width={50}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) =>
                        name === "cost" ? formatCurrency(value as number) : value
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
