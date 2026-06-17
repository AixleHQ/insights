import { useState, useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  UserX,
  User,
  RefreshCw,
  HelpCircle,
  CheckSquare,
  SlidersHorizontal,
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
import { RiskBadge } from "@/components/dashboard";
import { formatCost } from "@/lib/formatters";
import { labelForEventType } from "@/lib/eventTypes";
import { formatDistanceToNow } from "@/lib/utils";

type UnattributedSortField = "tool_name" | "risk_level" | "cost_usd" | "created_at";

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
        <Skeleton className="h-4 w-24" />
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

export function UnattributedEvents() {
  const { currentOrg, hasRole } = useOrg();
  const { data: currentUser, isLoading: isLoadingMe } = useCurrentUser();
  const isOrgOwner = hasRole(["owner"]);
  const isPlatformAdmin = Boolean(
    currentUser?.globalAdmin ?? currentUser?.super_admin
  );
  const canManageAttribution = isOrgOwner || (!isLoadingMe && isPlatformAdmin);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<UnattributedSortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignError, setAssignError] = useState<string | null>(null);

  // Server-side filters
  const [toolFilter, setToolFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [minConfidence, setMinConfidence] = useState("");

  const apiParams: UnattributedEventsParams = {
    toolName: toolFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
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
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [events, search, sortField, sortDirection]);

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

  const openAssignDialog = (eventId: string | null) => {
    setSelectedEventId(eventId);
    setSelectedUserId("");
    setAssignError(null);
    setAssignDialogOpen(true);
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

  const tableColumnCount = canManageAttribution ? 8 : 6;

  const toolSelectValue =
    toolFilter && TOOL_OPTIONS.includes(toolFilter) ? toolFilter : "all";

  const confidenceSelectValue =
    minConfidence && ALLOWED_CONFIDENCE_VALUES.has(minConfidence)
      ? minConfidence
      : "any";

  if (permissionLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link to="/events">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">Unattributed Events</h1>
        </div>
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

  if (accessDenied) {
    return <Navigate to="/events" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 flex-1">
          <Button asChild variant="ghost" size="icon">
            <Link to="/events">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Unattributed Events</h1>
            <p className="text-sm text-muted-foreground">
              Events that couldn't be automatically attributed to a user
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
              Why are events unattributed?
            </p>
            <p className="text-muted-foreground">
              Events become unattributed when they can't be matched to a user account.
              This usually happens when the user hasn't linked their tool account in Aixle Insights.
              Ask team members to link their accounts in Settings → Tool Accounts.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Server-side filters */}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by tool or model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="gap-1 self-start sm:self-auto">
          <UserX className="size-3" />
          {events?.length || 0} unattributed
        </Badge>
        {canManageAttribution && selectedIds.size > 0 && (
          <Button
            size="sm"
            onClick={() => openAssignDialog(null)}
            className="self-start sm:self-auto"
          >
            <CheckSquare className="mr-2 size-4" />
            Assign {selectedIds.size} selected
          </Button>
        )}
      </div>

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
              <TableHead>
                <SortButton
                  field="tool_name"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Tool
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Event Type</TableHead>
              <TableHead>
                <SortButton
                  field="risk_level"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Risk
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                <SortButton
                  field="cost_usd"
                  currentField={sortField}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                >
                  Cost
                </SortButton>
              </TableHead>
              <TableHead className="hidden md:table-cell">Attribution Attempt</TableHead>
              <TableHead>
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
                <TableHead className="w-[120px] sm:w-[150px]">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <EventSkeleton key={i} showAdminColumns={canManageAttribution} />
              ))
            ) : filteredEvents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tableColumnCount} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <User className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search ? "No matching events found" : "All events are attributed"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredEvents.map((event) => (
                <TableRow
                  key={event.id}
                  data-state={selectedIds.has(event.id) ? "selected" : undefined}
                >
                  {canManageAttribution && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(event.id)}
                        onCheckedChange={() => handleToggleSelect(event.id)}
                        aria-label={`Select event ${event.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div>
                      <p className="font-medium">{event.toolName || "Unknown"}</p>
                      {event.model && (
                        <p className="text-xs text-muted-foreground">{event.model}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="secondary" className="text-xs">
                      {labelForEventType(event.eventType || "unknown")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <RiskBadge level={event.riskLevel || "none"} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-sm">
                    {formatCost(event.costUsd ?? 0)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {event.correlationMethod ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="text-xs w-fit">
                          {CORRELATION_METHOD_LABELS[event.correlationMethod] ??
                            event.correlationMethod}
                        </Badge>
                        {event.correlationConfidence != null && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(Number(event.correlationConfidence) * 100)}% confidence
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(event.occurredAt || event.createdAt)}
                  </TableCell>
                  {canManageAttribution && (
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAssignDialog(event.id)}
                      >
                        <User className="mr-2 size-3" />
                        Assign to…
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
          <div className="py-4">
            <Select
              value={selectedUserId || undefined}
              onValueChange={setSelectedUserId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a team member" />
              </SelectTrigger>
              <SelectContent>
                {members?.flatMap((member) => {
                  const uid = memberAssigneeId(member);
                  if (!uid) return [];
                  const label = member.user?.name
                    ? `${member.user.name} (${member.user.email ?? uid})`
                    : (member.user?.email ?? uid);
                  return [
                    <SelectItem key={member.id} value={uid}>
                      {label}
                    </SelectItem>,
                  ];
                })}
              </SelectContent>
            </Select>
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
