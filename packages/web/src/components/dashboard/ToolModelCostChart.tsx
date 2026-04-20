import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { ToolModelStat } from "@/lib/types";
import { formatCost } from "@/lib/formatters";

interface ToolModelCostChartProps {
  models: ToolModelStat[];
  isLoading: boolean;
}

const chartConfig = {
  costUsd: {
    label: "Cost",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function truncateName(name: string): string {
  return name.length > 30 ? `${name.slice(0, 30)}…` : name;
}

export function ToolModelCostChart({ models, isLoading }: ToolModelCostChartProps) {
  const chartData = [...models]
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 10)
    .map((m) => ({
      name: truncateName(m.name),
      costUsd: m.costUsd,
    }));

  const barHeight = 28;
  const minHeight = 120;
  const chartHeight = Math.max(minHeight, chartData.length * barHeight);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Cost by Model</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
            No model data for this period.
          </div>
        ) : (
          // height is data-driven — can't use a static Tailwind class here
          <ChartContainer config={chartConfig} className="w-full" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  width={180}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCost(value as number)}
                    />
                  }
                />
                <Bar
                  dataKey="costUsd"
                  fill="var(--chart-2)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                  label={{
                    position: "right",
                    formatter: (v: number) => formatCost(v),
                    fill: "currentColor",
                    fontSize: 11,
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
