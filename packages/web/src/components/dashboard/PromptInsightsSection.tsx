import { Sparkles, Wrench, Target, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { usePromptInsights, type PromptInsightsCallout } from "@/hooks/useApi";

interface Props {
  orgId: string;
  userId: string;
  period: string;
}

const CALLOUT_ICONS: Record<PromptInsightsCallout["type"], LucideIcon> = {
  strength: Sparkles,
  tool: Wrench,
  opportunity: Target,
};

const DIMENSIONS = [
  { key: "structure" as const, label: "Structure" },
  { key: "context" as const, label: "Context" },
  { key: "specificity" as const, label: "Specificity" },
];

export function PromptInsightsSection({ orgId, userId, period }: Props) {
  const { data, isLoading, isError } = usePromptInsights(orgId, userId, period);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Prompt Insights</CardTitle>
        <CardDescription className="text-xs">AI prompt quality score</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Could not load insights.</p>
        ) : !data || data.callouts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Not enough data yet. Keep using your AI tools and check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Left: score + dimension bars */}
            <div className="space-y-4">
              <div className="flex items-baseline gap-1">
                <span className="font-mono-display text-4xl font-bold tracking-tight">
                  {data.score.toFixed(1)}
                </span>
                <span className="text-lg text-muted-foreground">/ 10</span>
              </div>

              <div className="space-y-3">
                {DIMENSIONS.map(({ key, label }) => {
                  const value = data.dimensions[key];
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{value.toFixed(1)}</span>
                      </div>
                      <Progress
                        value={value * 10}
                        aria-label={`${label} score ${value.toFixed(1)} out of 10`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: callout items */}
            <div className="space-y-4">
              {data.callouts.map((callout) => {
                const Icon = CALLOUT_ICONS[callout.type];
                return (
                  <div key={callout.type} className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {callout.label}
                      </p>
                      <p className="text-sm">{callout.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
