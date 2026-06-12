import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartSkeleton } from "@/components/ui/skeletons";
import { getToolColor, humanizeToolName } from "@/lib/utils";

export interface ToolUsageData {
  tool_name: string;
  event_count: number;
  total_cost: number;
}

interface TopToolsChartProps {
  data: ToolUsageData[];
  isLoading?: boolean;
  className?: string;
}

const chartConfig = {
  event_count: {
    label: "Events",
    color: "var(--chart-1)",
  },
  total_cost: {
    label: "Cost",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function TopToolsChart({ data, isLoading, className }: TopToolsChartProps) {
  const sortedData = [...data]
    .sort((a, b) => b.event_count - a.event_count)
    .slice(0, 5)
    .map((d) => ({
      ...d,
      display_name: humanizeToolName(d.tool_name),
      color: getToolColor(d.tool_name),
    }));

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Top Tools</CardTitle>
        <CardDescription className="text-xs">
          Most used AI tools by event count
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ChartSkeleton variant="bars" barCount={5} />
        ) : sortedData.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            No tool data available
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedData}
                layout="vertical"
                margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="display_name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  width={80}
                  tickFormatter={(value) =>
                    value.length > 12 ? `${value.slice(0, 12)}...` : value
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        if (name === "total_cost") {
                          return `$${(value as number).toFixed(2)}`;
                        }
                        return new Intl.NumberFormat("en-US").format(value as number);
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="event_count"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                >
                  {sortedData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
