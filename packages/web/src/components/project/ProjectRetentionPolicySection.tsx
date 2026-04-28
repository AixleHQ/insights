import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectRetentionPolicy, useUpdateProjectRetentionPolicy } from "@/hooks/useApi";
import { retentionOrder, formatRetentionLabel } from "@/lib/retention-utils";

interface Props {
  projectId: string;
}

export function ProjectRetentionPolicySection({ projectId }: Props) {
  const { data: retentionPolicy, isLoading } = useProjectRetentionPolicy(projectId);
  const updateRetention = useUpdateProjectRetentionPolicy();

  const [pendingChange, setPendingChange] = useState<{
    field: string;
    value: string;
    currentLabel: string;
    newLabel: string;
  } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const applyRetentionChange = async (field: string, value: string) => {
    setSaveError(null);
    try {
      await updateRetention.mutateAsync({ projectId, data: { [field]: value } });
    } catch (error) {
      console.error("Failed to update retention:", error);
      setSaveError("Failed to save. Please try again.");
    }
  };

  const handleRetentionChange = (field: string, currentValue: string, newValue: string) => {
    if (retentionOrder(newValue) < retentionOrder(currentValue)) {
      setPendingChange({
        field,
        value: newValue,
        currentLabel: formatRetentionLabel(currentValue),
        newLabel: formatRetentionLabel(newValue),
      });
    } else {
      applyRetentionChange(field, newValue);
    }
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
        <h2 className="text-lg font-medium">Data Retention</h2>
        <p className="text-sm text-muted-foreground">
          Configure how long data is retained for this project
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retention Periods</CardTitle>
          <CardDescription>
            Configure how long each type of data is kept
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Raw Event TTL</Label>
              <Select
                value={retentionPolicy?.rawEventTtl || "24_hours"}
                onValueChange={(value) =>
                  handleRetentionChange("raw_event_ttl", retentionPolicy?.rawEventTtl || "24_hours", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6_hours">6 hours</SelectItem>
                  <SelectItem value="12_hours">12 hours</SelectItem>
                  <SelectItem value="24_hours">24 hours</SelectItem>
                  <SelectItem value="48_hours">48 hours</SelectItem>
                  <SelectItem value="72_hours">72 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tool Events</Label>
              <Select
                value={retentionPolicy?.toolEventsRetention || "90_days"}
                onValueChange={(value) =>
                  handleRetentionChange("tool_events_retention", retentionPolicy?.toolEventsRetention || "90_days", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30_days">30 days</SelectItem>
                  <SelectItem value="60_days">60 days</SelectItem>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="180_days">6 months</SelectItem>
                  <SelectItem value="365_days">1 year</SelectItem>
                  <SelectItem value="730_days">2 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hourly Aggregates</Label>
              <Select
                value={retentionPolicy?.hourlyAggregateRetention || "365_days"}
                onValueChange={(value) =>
                  handleRetentionChange("hourly_aggregate_retention", retentionPolicy?.hourlyAggregateRetention || "365_days", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="180_days">6 months</SelectItem>
                  <SelectItem value="365_days">1 year</SelectItem>
                  <SelectItem value="730_days">2 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Daily Aggregates</Label>
              <Select
                value={retentionPolicy?.dailyAggregateRetention || "forever"}
                onValueChange={(value) =>
                  handleRetentionChange("daily_aggregate_retention", retentionPolicy?.dailyAggregateRetention || "forever", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="365_days">1 year</SelectItem>
                  <SelectItem value="730_days">2 years</SelectItem>
                  <SelectItem value="1095_days">3 years</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {saveError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingChange} onOpenChange={(open) => !open && setPendingChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reduce retention period?</AlertDialogTitle>
            <AlertDialogDescription>
              You are reducing the retention from{" "}
              <strong>{pendingChange?.currentLabel}</strong> to{" "}
              <strong>{pendingChange?.newLabel}</strong>. Data older than the
              new limit may be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingChange) {
                  applyRetentionChange(pendingChange.field, pendingChange.value);
                  setPendingChange(null);
                }
              }}
            >
              Reduce retention
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
