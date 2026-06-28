import { useState, useEffect } from "react";
import { useRetentionPolicy, useUpdateRetentionPolicy } from "@/hooks/useApi";
import { formatCost, formatTokens } from "@/lib/formatters";
import { formatRetentionLabel } from "@/lib/retention-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const TOOL_EVENTS_RETENTION_OPTIONS = [
  "30_days",
  "60_days",
  "90_days",
  "180_days",
  "365_days",
  "730_days",
] as const;

interface OrgPolicyPanelProps {
  orgId: string;
}

export function OrgPolicyPanel({ orgId }: OrgPolicyPanelProps) {
  const { data: policy, isLoading } = useRetentionPolicy(orgId);
  const updatePolicy = useUpdateRetentionPolicy();

  const [costDollars, setCostDollars] = useState("");
  const [tokenThreshold, setTokenThreshold] = useState("");
  const [toolEventsRetention, setToolEventsRetention] = useState<string>("90_days");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (policy && !dirty) {
      setCostDollars(
        policy.costThresholdCents != null ? String(policy.costThresholdCents / 100) : ""
      );
      setTokenThreshold(
        policy.tokenThreshold != null ? String(policy.tokenThreshold) : ""
      );
      setToolEventsRetention(policy.toolEventsRetention || "90_days");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy]);

  const costCentsInput = costDollars !== "" ? Math.round(parseFloat(costDollars) * 100) : null;
  const tokenInput = tokenThreshold !== "" ? parseInt(tokenThreshold, 10) : null;
  const costInvalid = costCentsInput != null && (isNaN(costCentsInput) || costCentsInput < 0);
  const tokenInvalid = tokenInput != null && (isNaN(tokenInput) || tokenInput < 0);

  const handleSave = () => {
    if (costInvalid || tokenInvalid) return;
    updatePolicy.mutate({
      orgId,
      data: {
        cost_threshold_cents: costCentsInput,
        token_threshold: tokenInput,
        tool_events_retention: toolEventsRetention,
        alert_enabled: true,
      },
    });
    setDirty(false);
  };

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Organization Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Organization Policy</CardTitle>
        <CardDescription>
          Org-wide ceilings for retention and alerts. Project and personal settings cannot exceed
          these values.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-max-retention">Max data retention (tool events)</Label>
          <Select
            value={toolEventsRetention}
            onValueChange={(v) => {
              setToolEventsRetention(v);
              setDirty(true);
            }}
          >
            <SelectTrigger id="org-max-retention" className="w-full sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOOL_EVENTS_RETENTION_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {formatRetentionLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="org-cost-threshold">Cost alert threshold (USD)</Label>
            <Input
              id="org-cost-threshold"
              type="number"
              min={0}
              step={0.01}
              placeholder="e.g. 500"
              value={costDollars}
              onChange={(e) => {
                setCostDollars(e.target.value);
                setDirty(true);
              }}
              className={costInvalid ? "border-destructive" : ""}
            />
            {costInvalid && (
              <p className="text-xs text-destructive">Enter a valid non-negative amount.</p>
            )}
          </div>
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="org-token-threshold">Token alert threshold</Label>
            <Input
              id="org-token-threshold"
              type="number"
              min={0}
              placeholder="e.g. 1000000"
              value={tokenThreshold}
              onChange={(e) => {
                setTokenThreshold(e.target.value);
                setDirty(true);
              }}
              className={tokenInvalid ? "border-destructive" : ""}
            />
            {tokenInvalid && (
              <p className="text-xs text-destructive">Enter a valid non-negative integer.</p>
            )}
            {policy?.tokenThreshold != null && !dirty && (
              <p className="text-xs text-muted-foreground">
                Current: {formatTokens(policy.tokenThreshold)}
              </p>
            )}
          </div>
        </div>

        {policy?.costThresholdCents != null && !dirty && (
          <p className="text-sm text-muted-foreground">
            Current cost ceiling: {formatCost(policy.costThresholdCents / 100)}
          </p>
        )}

        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || costInvalid || tokenInvalid || updatePolicy.isPending}
        >
          {updatePolicy.isPending ? "Saving…" : "Save policy"}
        </Button>
        {updatePolicy.isError && (
          <p className="text-sm text-destructive">Failed to save. Please try again.</p>
        )}
      </CardContent>
    </Card>
  );
}
