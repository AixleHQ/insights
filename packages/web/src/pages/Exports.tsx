import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download, Loader2, Plus, Trash2, Pencil, AlertCircle, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import {
  useExportRecords,
  useCreateExportRecord,
  useScheduledExports,
  useCreateScheduledExport,
  useUpdateScheduledExport,
  useDeleteScheduledExport,
} from "@/hooks/useApi";
import { getApiErrorMessage } from "@/lib/api";
import type {
  ExportRecord,
  ExportReportType,
  ExportFormat,
  ExportFrequency,
  ScheduledExport,
} from "@/lib/types";
import { formatFileSize, formatDateTime } from "@/lib/formatters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Helpers ──────────────────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<ExportReportType, string> = {
  cost_by_user:    "Cost by User",
  cost_by_project: "Cost by Project",
  cost_by_tool:    "Cost by Tool",
  token_by_user:   "Tokens by User",
  token_by_tool:   "Tokens by Tool",
};

const FREQUENCY_LABELS: Record<ExportFrequency, string> = {
  daily:   "Daily",
  weekly:  "Weekly",
  monthly: "Monthly",
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isExpired(record: ExportRecord): boolean {
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt) < new Date();
}

// ── Pagination Footer ────────────────────────────────────────────────────────

type PaginationFooterProps = {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  noun: string;
  onPageChange: (page: number) => void;
};

function PaginationFooter({ currentPage, totalPages, totalCount, noun, onPageChange }: PaginationFooterProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t px-2 py-3 mt-2">
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages} ({totalCount} {noun})
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────────────────────

type StatusBadgeProps = { status: ExportRecord["status"]; expired?: boolean };

function StatusBadge({ status, expired = false }: StatusBadgeProps) {
  const config: Record<ExportRecord["status"], { label: string; variant: "secondary" | "outline" | "default" | "destructive" }> = {
    pending:    { label: "Pending",    variant: "secondary" },
    generating: { label: "Generating", variant: "outline" },
    ready:      { label: "Ready",      variant: "default" },
    failed:     { label: "Failed",     variant: "destructive" },
  };

  if (expired && status === "ready") {
    return <Badge variant="outline" className="text-muted-foreground">Expired</Badge>;
  }

  const { label, variant } = config[status];
  return (
    <Badge variant={variant} className="gap-1">
      {status === "generating" && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </Badge>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useExportRecords(orgId, page);
  const records = data?.data;
  const meta = data?.meta;

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!records?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Download className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">No exports yet. Use the On-Demand tab to generate your first report.</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Report Type</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Date Range</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Download</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const expired = isExpired(record);
            const isDownloadable = record.status === "ready" && !expired && !!record.downloadUrl;
            return (
              <TableRow key={record.id}>
                <TableCell className="font-medium">
                  {REPORT_TYPE_LABELS[record.reportType]}
                </TableCell>
                <TableCell className="uppercase text-xs">{record.format}</TableCell>
                <TableCell className="text-sm text-muted-foreground">All time</TableCell>
                <TableCell><StatusBadge status={record.status} expired={expired} /></TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {record.rowCount ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatFileSize(record.fileSizeBytes)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {record.createdBy?.name || record.createdBy?.email || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {record.expiresAt ? formatDateTime(record.expiresAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isDownloadable}
                    asChild={isDownloadable}
                  >
                    {isDownloadable ? (
                      <a href={record.downloadUrl!} download>
                        <Download className="h-4 w-4" />
                      </a>
                    ) : (
                      <span><Download className="h-4 w-4" /></span>
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {meta && (
        <PaginationFooter
          currentPage={meta.current_page}
          totalPages={meta.total_pages}
          totalCount={meta.total_count}
          noun="exports"
          onPageChange={setPage}
        />
      )}
    </>
  );
}

// ── Schedule Form Sheet ──────────────────────────────────────────────────────

type ScheduleFormProps = {
  open: boolean;
  onClose: () => void;
  orgId: string;
  existing?: ScheduledExport;
};

function ScheduleFormSheet({ open, onClose, orgId, existing }: ScheduleFormProps) {
  const createMutation  = useCreateScheduledExport(orgId);
  const updateMutation  = useUpdateScheduledExport(orgId);
  const isEditing = !!existing;

  const [reportType, setReportType] = useState<ExportReportType>(existing?.reportType ?? "cost_by_tool");
  const [format, setFormat]         = useState<ExportFormat>(existing?.format ?? "csv");
  const [frequency, setFrequency]   = useState<ExportFrequency>(existing?.frequency ?? "daily");
  const [dayOfWeek, setDayOfWeek]   = useState<string>(String(existing?.dayOfWeek ?? 1));
  const [dayOfMonth, setDayOfMonth] = useState<string>(String(existing?.dayOfMonth ?? 1));
  const [recipients, setRecipients] = useState<string[]>(existing?.recipients ?? []);
  const [recipientInput, setRecipientInput] = useState<string>("");
  const [recipientError, setRecipientError] = useState<string | null>(null);

  const isPending = createMutation.isPending || updateMutation.isPending;

  function addRecipient(raw: string): boolean {
    const email = raw.trim().replace(/,$/, "").trim();
    if (!email) return false;
    if (!isValidEmail(email)) {
      setRecipientError(`"${email}" is not a valid email address`);
      return false;
    }
    if (recipients.some((r) => r.toLowerCase() === email.toLowerCase())) {
      setRecipientError(`"${email}" is already added`);
      return false;
    }
    setRecipients((prev) => [...prev, email]);
    setRecipientInput("");
    setRecipientError(null);
    return true;
  }

  function handleRecipientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addRecipient(recipientInput);
    } else if (e.key === "Backspace" && !recipientInput && recipients.length) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Fold any half-typed address in the input into the list before submitting.
    let finalRecipients = recipients;
    if (recipientInput.trim()) {
      const pending = recipientInput.trim();
      if (!isValidEmail(pending)) {
        setRecipientError(`"${pending}" is not a valid email address`);
        return;
      }
      finalRecipients = [...recipients, pending];
    }

    if (finalRecipients.length === 0) {
      setRecipientError("At least one recipient is required");
      return;
    }

    const payload = {
      report_type: reportType,
      format,
      frequency,
      recipients: finalRecipients,
      day_of_week:  frequency === "weekly"  ? parseInt(dayOfWeek)  : null,
      day_of_month: frequency === "monthly" ? parseInt(dayOfMonth) : null,
    };

    const onError = (error: unknown) =>
      toast.error(getApiErrorMessage(error, "Failed to save schedule. Please try again."));

    if (isEditing) {
      updateMutation.mutate({ id: existing!.id, ...payload }, { onSuccess: onClose, onError });
    } else {
      createMutation.mutate(payload, { onSuccess: onClose, onError });
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Schedule" : "Add Schedule"}</SheetTitle>
          <SheetDescription>Configure a recurring report delivery.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="space-y-1">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ExportReportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(REPORT_TYPE_LABELS) as [ExportReportType, string][]).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as ExportFrequency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frequency === "weekly" && (
            <div className="space-y-1">
              <Label>Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                    (d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === "monthly" && (
            <div className="space-y-1">
              <Label>Day of Month</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1">
            <Label>Recipients</Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
              {recipients.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                    aria-label={`Remove ${email}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                type="text"
                className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder={recipients.length ? "" : "alice@example.com"}
                value={recipientInput}
                onChange={(e) => { setRecipientInput(e.target.value); setRecipientError(null); }}
                onKeyDown={handleRecipientKeyDown}
                onBlur={() => recipientInput.trim() && addRecipient(recipientInput)}
              />
            </div>
            {recipientError ? (
              <p className="text-xs text-destructive">{recipientError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Type an email and press Enter or comma to add it.
              </p>
            )}
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Schedule"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Scheduled Tab ────────────────────────────────────────────────────────────

function ScheduledTab({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useScheduledExports(orgId, page);
  const schedules = data?.data;
  const meta = data?.meta;
  const updateMutation = useUpdateScheduledExport(orgId);
  const deleteMutation = useDeleteScheduledExport(orgId);

  const [sheetOpen, setSheetOpen]               = useState(false);
  const [editTarget, setEditTarget]             = useState<ScheduledExport | undefined>();
  const [deleteTarget, setDeleteTarget]         = useState<ScheduledExport | undefined>();

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => { setEditTarget(undefined); setSheetOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Schedule
        </Button>
      </div>

      {!schedules?.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <AlertCircle className="mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm">No scheduled exports configured.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-4 px-5">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{REPORT_TYPE_LABELS[s.reportType]}</p>
                  <p className="text-xs text-muted-foreground">
                    {FREQUENCY_LABELS[s.frequency]} · {s.format.toUpperCase()} · {s.recipients.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Next run: {formatDateTime(s.nextRunAt)}
                    {s.lastRunAt && ` · Last run: ${formatDateTime(s.lastRunAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={s.active}
                    onCheckedChange={(checked) =>
                      updateMutation.mutate(
                        { id: s.id, active: checked },
                        { onError: (error) => toast.error(getApiErrorMessage(error, "Failed to update schedule.")) }
                      )
                    }
                  />
                  <Button variant="ghost" size="icon" onClick={() => { setEditTarget(s); setSheetOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(s)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {meta && (
        <PaginationFooter
          currentPage={meta.current_page}
          totalPages={meta.total_pages}
          totalCount={meta.total_count}
          noun="schedules"
          onPageChange={setPage}
        />
      )}

      {sheetOpen && (
        <ScheduleFormSheet
          key={editTarget?.id ?? "new"}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          orgId={orgId}
          existing={editTarget}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled export?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the schedule. Already-generated exports in the History tab are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id, {
                    onSuccess: () => setDeleteTarget(undefined),
                    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to delete schedule.")),
                  });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── On-Demand Tab ────────────────────────────────────────────────────────────

function OnDemandTab({ orgId, onExportCreated }: { orgId: string; onExportCreated: () => void }) {
  const createMutation = useCreateExportRecord(orgId);
  const [reportType, setReportType] = useState<ExportReportType>("cost_by_tool");
  const [format, setFormat]         = useState<ExportFormat>("csv");

  function handleGenerate() {
    createMutation.mutate(
      { report_type: reportType, format },
      {
        onSuccess: () => {
          onExportCreated();
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Failed to queue export. Please try again.")),
      }
    );
  }

  return (
    <div className="flex justify-center pt-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-base">Generate On-Demand Export</CardTitle>
          <CardDescription>
            The report will be generated in the background. Switch to the History tab to monitor
            progress and download when ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={(v) => setReportType(v as ExportReportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(REPORT_TYPE_LABELS) as [ExportReportType, string][]).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Queuing…</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Generate Export</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function Exports() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? "";

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = ["history", "scheduled", "on-demand"].includes(tabParam ?? "")
    ? tabParam!
    : "history";

  function handleTabChange(value: string) {
    setSearchParams({ tab: value }, { replace: true });
  }

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Exports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate on-demand reports, manage scheduled deliveries, and download past exports.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="on-demand">On-Demand</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          <HistoryTab orgId={orgId} />
        </TabsContent>

        <TabsContent value="scheduled" className="mt-4">
          <ScheduledTab orgId={orgId} />
        </TabsContent>

        <TabsContent value="on-demand" className="mt-4">
          <OnDemandTab
            orgId={orgId}
            onExportCreated={() => handleTabChange("history")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
