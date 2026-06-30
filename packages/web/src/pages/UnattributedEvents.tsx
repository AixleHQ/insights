import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckSquare,
  ChevronDown,
  HelpCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User,
  UserX,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/contexts/OrgContext";
import {
  useUnattributedEvents,
  useOrganizationMembers,
  useAttributeEvent,
  useBulkAttributeEvents,
  useCurrentUser,
  queryKeys,
  type UnattributedEventsParams,
} from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EventTypeBadge } from "@/components/ui/event-type-badge";
import { CircleProgress } from "@/components/ui/circle-progress";
import { Checkbox } from "@/components/ui/checkbox";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { RiskBadge } from "@/components/dashboard";
import { normalizeRiskLevel } from "@/lib/riskLevel";
import { formatCost } from "@/lib/formatters";
import { AppRoutes } from "@/lib/routes";
import { humanizeToolName } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UnattributedEventsIllustration } from "@/components/ui/illustrations";
import { UserAvatar } from "@/components/ui/user-avatar";

type UnattributedSortField = "tool_name" | "risk_level" | "cost_usd" | "created_at" | "suggested_user" | "confidence";

const riskLevelOrder: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

const CORRELATION_METHOD_LABELS: Record<string, string> = {
  direct_user_id: "Direct ID",
  email: "Email",
  tool_account: "Tool Account",
  git_email: "Git Email",
  machine_id: "Machine ID",
  ip_address: "IP Address",
  manual: "Manual",
};

const TOOL_OPTIONS = [
  "claude_code",
  "cursor",
  "windsurf",
  "github_copilot",
  "aider",
  "continue",
  "cody",
  "tabnine",
  "amazon_q",
  "openrouter_api",
  "anthropic_api",
  "openai_api",
  "gemini_api",
];

const MIN_CONFIDENCE_OPTIONS = [
  { label: "Any", value: "" },
  { label: "≥ 50%", value: "0.5" },
  { label: "≥ 70%", value: "0.7" },
  { label: "≥ 85%", value: "0.85" },
  { label: "≥ 90%", value: "0.9" },
];

const ALLOWED_CONFIDENCE_VALUES = new Set(MIN_CONFIDENCE_OPTIONS.map((o) => o.value || "any"));


function getUserInitials(user: { name: string | null; email: string }): string {
  if (user.name) {
    return user.name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

function memberAssigneeId(m: {
  userId?: string;
  user_id?: string;
  user?: { id?: string };
}): string | undefined {
  return m.userId ?? m.user_id ?? m.user?.id;
}

function EventSkeleton({ showAdminColumns }: { showAdminColumns: boolean }) {
  return (
    <TableRow>
      {showAdminColumns && (
        <TableCell>
          <Skeleton className="h-4 w-4" />
        </TableCell>
      )}
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      {showAdminColumns && (
        <TableCell>
          <Skeleton className="h-8 w-32" />
        </TableCell>
      )}
    </TableRow>
  );
}

interface UnattributedEventsProps {
  embedded?: boolean;
  toolFilter?: string;
  startDate?: string;
  endDate?: string;
  minConfidence?: number;
  search?: string;
  /** Called when bulk-selection changes; parent can render the assign button elsewhere. */
  onBulkAssignChange?: (assign: (() => void) | null, count: number) => void;
  /** Called when a row is clicked to open event detail. */
  onEventClick?: (eventId: string) => void;
  /** Called to expose the assign-dialog opener to the parent. */
  onAssignReady?: (fn: (eventId: string) => void) => void;
}

export function UnattributedEvents({
  embedded = false,
  toolFilter: externalToolFilter,
  startDate: externalStartDate,
  endDate: externalEndDate,
  minConfidence: externalMinConfidence,
  search: externalSearch,
  onBulkAssignChange,
  onEventClick,
  onAssignReady,
}: UnattributedEventsProps) {
  const { currentOrg, hasRole } = useOrg();
  const { data: currentUser, isLoading: isLoadingMe } = useCurrentUser();
  const isOrgOwner = hasRole(["owner"]);
  const isPlatformAdmin = Boolean(
    currentUser?.globalAdmin ?? currentUser?.super_admin
  );
  const canManageAttribution = isOrgOwner || (!isLoadingMe && isPlatformAdmin);
  const queryClient = useQueryClient();
  const [internalSearch, setInternalSearch] = useState("");
  const search = embedded ? (externalSearch ?? "") : internalSearch;
  const [sortField, setSortField] = useState<UnattributedSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignError, setAssignError] = useState<string | null>(null);

  // Server-side filters — internal state used only in standalone mode
  const [toolFilter, setToolFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [minConfidence, setMinConfidence] = useState("");

  const resolvedToolFilter = embedded ? (externalToolFilter ?? "") : toolFilter;
  const resolvedStartDate = embedded ? (externalStartDate ?? "") : startDate;
  const resolvedEndDate = embedded ? (externalEndDate ?? "") : endDate;
  const resolvedMinConfidence = embedded
    ? (externalMinConfidence != null ? String(externalMinConfidence) : "")
    : minConfidence;

  const apiParams: UnattributedEventsParams = {
    toolName: resolvedToolFilter || undefined,
    startDate: resolvedStartDate || undefined,
    endDate: resolvedEndDate || undefined,
    minConfidence: resolvedMinConfidence ? parseFloat(resolvedMinConfidence) : undefined,
  };

  const canFetchUnattributed =
    !!currentOrg?.id &&
    (isOrgOwner || (!isLoadingMe && isPlatformAdmin));

  const { data: events, isLoading, isFetching } = useUnattributedEvents(
    currentOrg?.id || "",
    apiParams,
    { enabled: canFetchUnattributed }
  );
  const { data: members } = useOrganizationMembers(currentOrg?.id || "", {
    enabled: canManageAttribution && !!currentOrg?.id,
  });
  const attributeEvent = useAttributeEvent(currentOrg?.id || "");
  const bulkAttributeEvents = useBulkAttributeEvents(currentOrg?.id || "");

  const handleSort = (field: UnattributedSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const filteredEvents = useMemo(() => {
    if (!events || !Array.isArray(events)) return [];

    let result = [...events];

    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.toolName || "").toLowerCase().includes(searchLower) ||
          (e.model || "").toLowerCase().includes(searchLower)
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "tool_name":
          comparison = (a.toolName || "").localeCompare(b.toolName || "");
          break;
        case "risk_level":
          comparison =
            (riskLevelOrder[a.riskLevel || "none"] || 0) -
            (riskLevelOrder[b.riskLevel || "none"] || 0);
          break;
        case "cost_usd":
          comparison = (Number(a.costUsd) || 0) - (Number(b.costUsd) || 0);
          break;
        case "created_at":
          comparison =
            new Date(a.occurredAt || a.createdAt || 0).getTime() -
            new Date(b.occurredAt || b.createdAt || 0).getTime();
          break;
        case "suggested_user": {
          const aName = a.suggestedUser?.name || a.suggestedUser?.email || "";
          const bName = b.suggestedUser?.name || b.suggestedUser?.email || "";
          if (!aName && !bName) { comparison = 0; break; }
          if (!aName) { comparison = 1; break; }
          if (!bName) { comparison = -1; break; }
          comparison = aName.localeCompare(bName);
          break;
        }
        case "confidence":
          comparison = (Number(a.correlationConfidence) || 0) - (Number(b.correlationConfidence) || 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [events, search, sortField, sortDirection]);

  const hasActiveFilters = !!(search || resolvedToolFilter || resolvedStartDate || resolvedEndDate || resolvedMinConfidence);

  const allFilteredSelected =
    filteredEvents.length > 0 && filteredEvents.every((e) => selectedIds.has(e.id));

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEvents.map((e) => e.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.events.unattributed(currentOrg?.id || ""),
    });
    setSelectedIds(new Set());
  };

  const openAssignDialog = useCallback((eventId: string | null, preselectedUserId?: string) => {
    setSelectedEventId(eventId);
    setSelectedUserId(preselectedUserId || "");
    setAssignError(null);
    setAssignDialogOpen(true);
  }, []);

  useEffect(() => {
    onAssignReady?.(openAssignDialog);
  }, [onAssignReady, openAssignDialog]);

  useEffect(() => {
    if (!onBulkAssignChange) return;
    if (selectedIds.size > 0) {
      onBulkAssignChange(() => openAssignDialog(null), selectedIds.size);
    } else {
      onBulkAssignChange(null, 0);
    }
  }, [selectedIds.size, onBulkAssignChange, openAssignDialog]);

  const handleQuickAssign = async (eventId: string, userId: string, userName: string) => {
    if (!currentOrg) return;
    try {
      await attributeEvent.mutateAsync({ eventId, userId });
      queryClient.invalidateQueries({ queryKey: queryKeys.events.unattributed(currentOrg.id) });
      toast.success(`Assigned to ${userName}`);
    } catch {
      toast.error("Attribution failed. Please try again.");
    }
  };

  const handleAssign = async () => {
    if (!currentOrg || !selectedUserId) return;
    setAssignError(null);

    try {
      if (selectedEventId) {
        await attributeEvent.mutateAsync({ eventId: selectedEventId, userId: selectedUserId });
      } else {
        await bulkAttributeEvents.mutateAsync({
          eventIds: Array.from(selectedIds),
          userId: selectedUserId,
        });
        setSelectedIds(new Set());
      }

      setAssignDialogOpen(false);
      setSelectedEventId(null);
      setSelectedUserId("");
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Attribution failed");
    }
  };

  const isAssigning = attributeEvent.isPending || bulkAttributeEvents.isPending;
  const isBulkMode = selectedEventId === null;

  const permissionLoading = Boolean(currentOrg && !isOrgOwner && isLoadingMe);
  const accessDenied = Boolean(
    currentOrg && !isOrgOwner && !isLoadingMe && !isPlatformAdmin
  );


  const toolSelectValue =
    toolFilter && TOOL_OPTIONS.includes(toolFilter) ? toolFilter : "all";

  const confidenceSelectValue =
    minConfidence && ALLOWED_CONFIDENCE_VALUES.has(minConfidence)
      ? minConfidence
      : "any";

  if (permissionLoading) {
    return (
      <div className="space-y-6">
        {!embedded && (
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link to={AppRoutes.events.root}>
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="type-h3">Not Assigned</h1>
          </div>
        )}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <EventSkeleton key={i} showAdminColumns={false} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (accessDenied && !embedded) {
    return <Navigate to={AppRoutes.events.root} replace />;
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4 flex-1">
              <Button asChild variant="ghost" size="icon">
                <Link to={AppRoutes.events.root}>
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>
              <div className="flex-1">
                <h1 className="type-h3">Not Assigned</h1>
                <p className="text-sm text-muted-foreground">
                  Events that couldn&apos;t be automatically attributed to a user
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="self-start sm:self-auto"
            >
              <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Card className="border-warning/20 bg-warning/5">
            <CardContent className="flex items-start gap-4 p-4">
              <HelpCircle className="size-5 mt-0.5 text-warning shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-warning">
                  Why are events not assigned?
                </p>
                <p className="text-muted-foreground">
                  Events become unassigned when they can&apos;t be matched to a user account.
                  This usually happens when the user hasn&apos;t linked their tool account in Aixle Insights.
                  Ask team members to link their accounts in Settings → Tool Accounts.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Server-side filters — only shown in standalone mode */}
      {!embedded && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
            <SlidersHorizontal className="size-4" />
            Filters
          </div>
          <Select
            value={toolSelectValue}
            onValueChange={(v) => {
              setToolFilter(v === "all" ? "" : v);
              setSelectedIds(new Set());
            }}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="All tools" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tools</SelectItem>
              {TOOL_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setSelectedIds(new Set()); }}
            className="w-36 h-8 text-sm"
            aria-label="Start date"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setSelectedIds(new Set()); }}
            className="w-36 h-8 text-sm"
            aria-label="End date"
          />
          <Select
            value={confidenceSelectValue}
            onValueChange={(v) => {
              setMinConfidence(v === "any" ? "" : v);
              setSelectedIds(new Set());
            }}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Any confidence" />
            </SelectTrigger>
            <SelectContent>
              {MIN_CONFIDENCE_OPTIONS.map((o) => (
                <SelectItem key={o.value || "any"} value={o.value || "any"}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by tool or model..."
              value={search}
              onChange={(e) => setInternalSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="outline" className="gap-1 self-start sm:self-auto">
            <UserX className="size-3" />
            {events?.length || 0} not assigned
          </Badge>
        </div>
      )}
      {/* Bulk assign button rendered in the EventFilters trailing slot when embedded, inline otherwise */}
      {canManageAttribution && selectedIds.size > 0 && !embedded && (
        <Button
          size="sm"
          onClick={() => openAssignDialog(null)}
          className="self-start sm:self-auto"
        >
          <CheckSquare className="mr-2 size-4" />
          Assign {selectedIds.size} selected
        </Button>
      )}

      {/* Empty state: all events attributed, no active filters */}
      {!isLoading && filteredEvents.length === 0 && !hasActiveFilters && (
        <EmptyState
          illustration={<UnattributedEventsIllustration />}
          title="All events are attributed"
          description="Every event has been assigned to a team member — great job!"
        />
      )}

      {/* Empty state: filters active but no results */}
      {!isLoading && filteredEvents.length === 0 && hasActiveFilters && (
        <EmptyState
          icon={<Search className="size-8 text-muted-foreground" />}
          title="No matching events"
          description="Try adjusting your filters or search term."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setInternalSearch("");
                setToolFilter("");
                setStartDate("");
                setEndDate("");
                setMinConfidence("");
                setSelectedIds(new Set());
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}

      {(isLoading || filteredEvents.length > 0) && (
        <div className="rounded-md border overflow-x-auto">
          <Table className="min-w-[750px]">
            <TableHeader>
              <TableRow>
                {canManageAttribution && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                      disabled={filteredEvents.length === 0}
                    />
                  </TableHead>
                )}
                <TableHead className="w-[180px]">
                  <SortButton
                    field="tool_name"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Tool
                  </SortButton>
                </TableHead>
                <TableHead className="hidden sm:table-cell w-[120px]">Event Type</TableHead>
                <TableHead className="w-[90px]">
                  <SortButton
                    field="risk_level"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Risk
                  </SortButton>
                </TableHead>
                <TableHead className="hidden sm:table-cell w-[100px]">
                  <SortButton
                    field="cost_usd"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Cost
                  </SortButton>
                </TableHead>
                <TableHead className="hidden md:table-cell w-[160px]">
                  <SortButton
                    field="suggested_user"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Suggested User
                  </SortButton>
                </TableHead>
                <TableHead className="hidden md:table-cell w-[120px]">
                  <SortButton
                    field="confidence"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Confidence
                  </SortButton>
                </TableHead>
                <TableHead className="w-[120px]">
                  <SortButton
                    field="created_at"
                    currentField={sortField}
                    currentDirection={sortDirection}
                    onSort={handleSort}
                  >
                    Time
                  </SortButton>
                </TableHead>
                {canManageAttribution && (
                  <TableHead className="w-[160px] text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <EventSkeleton key={i} showAdminColumns={canManageAttribution} />
                ))
              ) : (
                filteredEvents.map((event) => {
                  const suggested = event.suggestedUser;

                  return (
                    <TableRow
                      key={event.id}
                      data-state={selectedIds.has(event.id) ? "selected" : undefined}
                      className={onEventClick ? "hover:bg-muted/50 transition-colors cursor-pointer" : "hover:bg-muted/50 transition-colors"}
                      onClick={() => onEventClick?.(event.id)}
                    >
                      {canManageAttribution && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(event.id)}
                            onCheckedChange={() => handleToggleSelect(event.id)}
                            aria-label={`Select event ${event.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{humanizeToolName(event.toolName)}</p>
                          {event.model && (
                            <p className="text-xs text-muted-foreground">{event.model}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <EventTypeBadge type={event.eventType} />
                      </TableCell>
                      <TableCell>
                        <RiskBadge level={normalizeRiskLevel(event.riskLevel)} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm">{formatCost(event.costUsd ?? 0)}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {suggested ? (
                          <UserAvatar name={suggested.name} email={suggested.email} avatarUrl={suggested.avatarUrl} suggested />
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {event.correlationConfidence != null ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 w-fit cursor-default">
                                <CircleProgress value={Number(event.correlationConfidence)} size={14} className="text-foreground" />
                                <span className="text-sm">
                                  {Math.round(Number(event.correlationConfidence) * 100)}%
                                </span>
                              </div>
                            </TooltipTrigger>
                            {event.correlationMethod && (
                              <TooltipContent>
                                via {CORRELATION_METHOD_LABELS[event.correlationMethod] ?? event.correlationMethod}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(event.occurredAt || event.createdAt)}
                      </TableCell>
                      {canManageAttribution && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {suggested ? (
                            <div className="flex items-center rounded-md border bg-background shadow-xs dark:bg-input/30 dark:border-input overflow-hidden w-fit ml-auto">
                              <button
                                className="flex items-center gap-2 px-3 h-8 text-sm font-medium hover:bg-accent dark:hover:bg-input/50 transition-colors disabled:opacity-50"
                                onClick={() => handleQuickAssign(event.id, suggested.id, suggested.name || suggested.email)}
                                disabled={attributeEvent.isPending}
                              >
                                <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary shrink-0">
                                  {getUserInitials(suggested)}
                                </div>
                                Assign
                              </button>
                              <div className="w-px h-8 bg-border dark:bg-input" />
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="flex items-center justify-center w-8 h-8 hover:bg-accent dark:hover:bg-input/50 transition-colors">
                                    <ChevronDown className="size-3.5 text-muted-foreground" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={() => openAssignDialog(event.id)}>
                                    <User className="size-3.5 mr-2" />
                                    Choose member…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : (
                            <div className="flex items-center rounded-md border bg-background shadow-xs dark:bg-input/30 dark:border-input overflow-hidden w-fit ml-auto">
                              <button
                                className="flex items-center gap-2 px-3 h-8 text-sm font-medium hover:bg-accent dark:hover:bg-input/50 transition-colors"
                                onClick={() => openAssignDialog(event.id)}
                              >
                                <User className="size-3.5 text-muted-foreground" />
                                Assign to…
                              </button>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isBulkMode
                ? `Assign ${selectedIds.size} Events to User`
                : "Assign Event to User"}
            </DialogTitle>
            <DialogDescription>
              {isBulkMode
                ? `Select a team member to attribute ${selectedIds.size} selected events to.`
                : "Select a team member to attribute this event to."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Command className="rounded-md border">
              <CommandInput placeholder="Search members..." />
              <CommandList>
                <CommandEmpty>No members found.</CommandEmpty>
                <CommandGroup>
                  {members?.flatMap((member) => {
                    const uid = memberAssigneeId(member);
                    if (!uid) return [];
                    const name = member.user?.name ?? null;
                    const email = member.user?.email ?? uid;
                    return [
                      <CommandItem
                        key={member.id}
                        value={name ? `${name} ${email}` : email}
                        onSelect={() => setSelectedUserId(uid)}
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="size-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                            {getUserInitials({ name, email })}
                          </div>
                          <div className="flex flex-col min-w-0">
                            {name && <span className="text-sm font-medium truncate">{name}</span>}
                            <span className="text-xs text-muted-foreground truncate">{email}</span>
                          </div>
                        </div>
                        {selectedUserId === uid && <Check className="size-4 shrink-0 text-primary" />}
                      </CommandItem>,
                    ];
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
          {assignError && (
            <p className="text-sm text-destructive px-1">{assignError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedUserId || isAssigning}>
              {isAssigning
                ? "Assigning..."
                : isBulkMode
                  ? `Assign ${selectedIds.size} Events`
                  : "Assign to…"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
