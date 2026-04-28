import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useProjectSettings,
  useUpdateProjectSetting,
  useDeleteProjectSetting,
  useOrganizationSettings,
} from "@/hooks/useApi";
import { cn, formatCurrency } from "@/lib/utils";
import { validateCostInput } from "@/lib/validation";

interface Props {
  projectId: string;
  orgId: string;
}

export function ProjectAlertsSection({ projectId, orgId }: Props) {
  const { data: projectSettings, isLoading: isLoadingProject } = useProjectSettings(projectId);
  const { data: orgSettings, isLoading: isLoadingOrg } = useOrganizationSettings(orgId);
  const updateSetting = useUpdateProjectSetting();
  const deleteSetting = useDeleteProjectSetting();

  const isLoading = isLoadingProject || isLoadingOrg;

  const getProjSetting = (key: string) =>
    projectSettings?.data?.find((s) => s.key === key)?.value;

  const getOrgSetting = (key: string) =>
    (orgSettings as { data?: { key: string; value: string }[] } | undefined)?.data?.find(
      (s) => s.key === key
    )?.value;

  const orgCostDaily = getOrgSetting("alert_cost_daily");
  const orgCostMonthly = getOrgSetting("alert_cost_monthly");
  const orgEmailAlerts = getOrgSetting("alert_email");

  const projectCostDaily = getProjSetting("alert_cost_daily");
  const projectCostMonthly = getProjSetting("alert_cost_monthly");
  const projectEmailAlerts = getProjSetting("alert_email");

  const [costDaily, setCostDaily] = useState("");
  const [costMonthly, setCostMonthly] = useState("");
  const [costDailyError, setCostDailyError] = useState("");
  const [costMonthlyError, setCostMonthlyError] = useState("");

  useEffect(() => {
    const daily = getProjSetting("alert_cost_daily");
    if (daily !== undefined) setCostDaily(daily);
    else setCostDaily("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSettings]);

  useEffect(() => {
    const monthly = getProjSetting("alert_cost_monthly");
    if (monthly !== undefined) setCostMonthly(monthly);
    else setCostMonthly("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSettings]);

  const handleCostBlur = (
    value: string,
    projectValue: string | undefined,
    key: "alert_cost_daily" | "alert_cost_monthly",
    setError: (e: string) => void,
    setValue: (v: string) => void
  ) => {
    const error = validateCostInput(value);
    setError(error);
    if (error) return;
    if (value === "") {
      if (projectValue !== undefined) {
        deleteSetting.mutate(
          { projectId, key },
          { onError: () => setValue(projectValue) }
        );
      }
    } else if (value !== projectValue) {
      updateSetting.mutate(
        { projectId, key, value },
        { onError: () => setValue(projectValue ?? "") }
      );
    }
  };

  const handleEmailAlertsChange = (value: string) => {
    if (value === "inherit") {
      if (projectEmailAlerts !== undefined) {
        deleteSetting.mutate({ projectId, key: "alert_email" });
      }
    } else {
      updateSetting.mutate({ projectId, key: "alert_email", value });
    }
  };

  const emailAlertsValue = projectEmailAlerts === undefined ? "inherit" : projectEmailAlerts;
  const orgEmailLabel = orgEmailAlerts === "false" ? "Disabled" : "Enabled";

  const formatOrgDefault = (value: string | undefined, period: string) => {
    if (!value) return "No organisation default set";
    return `Inheriting org default: ${formatCurrency(parseFloat(value))}/${period}`;
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
          Configure cost alert thresholds for this project. Leave a field empty to inherit the
          organisation default.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Thresholds</CardTitle>
          <CardDescription>
            Get notified when this project's costs exceed limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-costDaily">Daily Cost Limit (USD)</Label>
            <Input
              id="proj-costDaily"
              type="number"
              min={0}
              value={costDaily}
              placeholder={
                orgCostDaily
                  ? `Org default: ${formatCurrency(parseFloat(orgCostDaily))}/day`
                  : "Inherit from organisation"
              }
              onChange={(e) => {
                setCostDaily(e.target.value);
                setCostDailyError(validateCostInput(e.target.value));
              }}
              onBlur={() =>
                handleCostBlur(costDaily, projectCostDaily, "alert_cost_daily", setCostDailyError, setCostDaily)
              }
              className={cn(costDailyError && "border-destructive focus-visible:ring-destructive")}
            />
            {costDailyError ? (
              <p className="text-xs text-destructive">{costDailyError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {costDaily !== "" ? "Overriding organisation default" : formatOrgDefault(orgCostDaily, "day")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="proj-costMonthly">Monthly Cost Limit (USD)</Label>
            <Input
              id="proj-costMonthly"
              type="number"
              min={0}
              value={costMonthly}
              placeholder={
                orgCostMonthly
                  ? `Org default: ${formatCurrency(parseFloat(orgCostMonthly))}/month`
                  : "Inherit from organisation"
              }
              onChange={(e) => {
                setCostMonthly(e.target.value);
                setCostMonthlyError(validateCostInput(e.target.value));
              }}
              onBlur={() =>
                handleCostBlur(costMonthly, projectCostMonthly, "alert_cost_monthly", setCostMonthlyError, setCostMonthly)
              }
              className={cn(costMonthlyError && "border-destructive focus-visible:ring-destructive")}
            />
            {costMonthlyError ? (
              <p className="text-xs text-destructive">{costMonthlyError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {costMonthly !== "" ? "Overriding organisation default" : formatOrgDefault(orgCostMonthly, "month")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Channels</CardTitle>
          <CardDescription>Where to send alert notifications for this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-emailAlerts">Email Alerts</Label>
            <Select value={emailAlertsValue} onValueChange={handleEmailAlertsChange}>
              <SelectTrigger id="proj-emailAlerts">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit">
                  Inherit from organisation ({orgEmailLabel})
                </SelectItem>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {emailAlertsValue === "inherit"
                ? `Using organisation default: ${orgEmailLabel}`
                : emailAlertsValue === "true"
                  ? "Overriding: email alerts enabled for this project"
                  : "Overriding: email alerts disabled for this project"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
