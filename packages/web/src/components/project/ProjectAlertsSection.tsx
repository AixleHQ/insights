import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useProjectRetentionPolicy,
  useUpdateProjectRetentionPolicy,
  useRetentionPolicy,
} from "@/hooks/useApi";
import { formatCost, formatTokens } from "@/lib/formatters";

interface Props {
  projectId: string;
  orgId: string;
}

export function ProjectAlertsSection({ projectId, orgId }: Props) {
  const { data: projectPolicy, isLoading: isLoadingProject } = useProjectRetentionPolicy(projectId);
  const { data: orgPolicy, isLoading: isLoadingOrg } = useRetentionPolicy(orgId);
  const updateProjectPolicy = useUpdateProjectRetentionPolicy();

  const isLoading = isLoadingProject || isLoadingOrg;

  const [costDollars, setCostDollars] = useState("");
  const [tokenThreshold, setTokenThreshold] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (projectPolicy && !dirty) {
      setCostDollars(
        projectPolicy.costThresholdCents != null
          ? String(projectPolicy.costThresholdCents / 100)
          : ""
      );
      setTokenThreshold(
        projectPolicy.tokenThreshold != null
          ? String(projectPolicy.tokenThreshold)
          : ""
      );
      setAlertEnabled(projectPolicy.alertEnabled ?? true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPolicy]);

  const orgCostCeiling = orgPolicy?.costThresholdCents ?? null;
  const orgTokenCeiling = orgPolicy?.tokenThreshold ?? null;

  const costCentsInput = costDollars !== "" ? Math.round(parseFloat(costDollars) * 100) : null;
  const exceedsCostCeiling =
    orgCostCeiling != null && costCentsInput != null && costCentsInput > orgCostCeiling;

  const tokenInput = tokenThreshold !== "" ? parseInt(tokenThreshold, 10) : null;
  const exceedsTokenCeiling =
    orgTokenCeiling != null && tokenInput != null && tokenInput > orgTokenCeiling;

  const handleSave = () => {
    updateProjectPolicy.mutate({
      projectId,
      data: {
        cost_threshold_cents: costCentsInput,
        token_threshold: tokenInput,
        alert_enabled: alertEnabled,
      },
    });
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Alert Settings</h2>
        <p className="text-sm text-muted-foreground">
          Override org-level alert thresholds for this project. Leave a field empty to inherit
          the organisation default.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost &amp; Token Thresholds</CardTitle>
          <CardDescription>
            Get notified when this project&apos;s usage exceeds limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 space-y-1">
              <Label htmlFor="proj-cost-threshold">Cost Threshold (USD)</Label>
              {orgCostCeiling != null && (
                <p className="text-xs text-muted-foreground">
                  Org ceiling: {formatCost(orgCostCeiling / 100)}
                </p>
              )}
              <Input
                id="proj-cost-threshold"
                type="number"
                min={0}
                step={0.01}
                placeholder={
                  orgCostCeiling != null
                    ? `Org default: ${formatCost(orgCostCeiling / 100)}`
                    : "No org default"
                }
                value={costDollars}
                onChange={(e) => { setCostDollars(e.target.value); setDirty(true); }}
                className={exceedsCostCeiling ? "border-destructive" : ""}
              />
              {exceedsCostCeiling && (
                <p className="text-xs text-destructive">
                  Must not exceed org ceiling ({formatCost(orgCostCeiling! / 100)})
                </p>
              )}
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="proj-token-threshold">Token Threshold</Label>
              {orgTokenCeiling != null && (
                <p className="text-xs text-muted-foreground">
                  Org ceiling: {formatTokens(orgTokenCeiling)}
                </p>
              )}
              <Input
                id="proj-token-threshold"
                type="number"
                min={0}
                placeholder={
                  orgTokenCeiling != null
                    ? `Org default: ${formatTokens(orgTokenCeiling)}`
                    : "No org default"
                }
                value={tokenThreshold}
                onChange={(e) => { setTokenThreshold(e.target.value); setDirty(true); }}
                className={exceedsTokenCeiling ? "border-destructive" : ""}
              />
              {exceedsTokenCeiling && (
                <p className="text-xs text-destructive">
                  Must not exceed org ceiling ({formatTokens(orgTokenCeiling!)})
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="proj-alert-enabled"
              checked={alertEnabled}
              onCheckedChange={(checked) => { setAlertEnabled(checked); setDirty(true); }}
            />
            <Label htmlFor="proj-alert-enabled">Enable alerts</Label>
          </div>
          <Button
            onClick={handleSave}
            disabled={!dirty || exceedsCostCeiling || exceedsTokenCeiling || updateProjectPolicy.isPending}
          >
            {updateProjectPolicy.isPending ? "Saving…" : "Save thresholds"}
          </Button>
          {updateProjectPolicy.isError && (
            <p className="text-sm text-destructive">Failed to save. Please try again.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
