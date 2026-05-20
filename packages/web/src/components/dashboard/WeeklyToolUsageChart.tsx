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
import { cn, humanizeToolName } from "@/lib/utils";
import { useDailyByTool, useDailyByModel } from "@/hooks/useApi";

interface WeeklyToolUsageChartProps {
  orgId: string;
  projectId?: string;
  className?: string;
}

const TOOL_COLORS: Record<string, string> = {
  claude_code: "hsl(32 95% 55%)",
  github_copilot: "hsl(211 100% 50%)",
  cursor: "hsl(271 91% 65%)",
  aider: "hsl(142 71% 45%)",
  windsurf: "hsl(199 89% 48%)",
  cody: "hsl(339 90% 51%)",
  Other: "hsl(220 9% 46%)",
};

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

function getToolColor(tool: string): string {
  return TOOL_COLORS[tool] ?? TOOL_COLORS["Other"];
}

function getModelColor(index: number): string {
  return MODEL_PALETTE[index % MODEL_PALETTE.length];
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getLast12Months(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    months.push({ value, label });
  }
  return months;
}

function formatWeekDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WeeklyToolUsageChart({ orgId, projectId, className }: WeeklyToolUsageChartProps) {
  const [groupBy, setGroupBy] = useState<"tool" | "model">("tool");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const months = useMemo(() => getLast12Months(), []);
  const opts = { period: "week" as const, month: selectedMonth, projectId };

  const { data: toolData, isLoading: isLoadingTool } = useDailyByTool(orgId, opts);
  const { data: modelData, isLoading: isLoadingModel } = useDailyByModel(orgId, opts);

  const isLoading = groupBy === "tool" ? isLoadingTool : isLoadingModel;

  const { keys, chartData, chartConfig } = useMemo(() => {
    if (groupBy === "tool") {
      const tools = toolData?.tools ?? [];
      const data = (toolData?.data ?? []).map((row) => ({
        ...row,
        dateLabel: formatWeekDate(row.date),
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
        dateLabel: formatWeekDate(row.date),
      }));
      const config: ChartConfig = {};
      models.forEach((model, i) => {
        config[model] = { label: model, color: getModelColor(i) };
      });
      return { keys: models, chartData: data, chartConfig: config };
    }
  }, [groupBy, toolData, modelData]);

  const getColor = (key: string, index: number) =>
    groupBy === "tool" ? getToolColor(key) : getModelColor(index);

  return (
    <Card className={cn("col-span-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">Weekly Usage</CardTitle>
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
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[280px] items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          </div>
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
