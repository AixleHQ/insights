import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare, Download, Loader2, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/contexts/OrgContext";
import { useEvents, useExportEvents, useProjects, useCurrentUser, useEventsSummary, queryKeys } from "@/hooks/useApi";
import { useEventsPageUpdates } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EventFilters,
  EventsTable,
  EventDrawer,
  type EventFiltersState,
  type EventRow,
} from "@/components/events";
import type { EventsToolFilterOption } from "@/lib/eventsToolFilters";
import { formatLocalDate, humanizeToolName, toEventRow } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { showEventsUserColumn, type SortField, type SortDirection } from "@/lib/eventAccess";
import { UnattributedEvents } from "./UnattributedEvents";
import type { EventSortBy } from "@/hooks/useApi";

// tokens_in is intentionally absent: the table shows a combined in+out token
// count, so sorting by tokens_in alone would not match what the user sees.
const SORT_FIELD_API_MAP: Record<SortField, EventSortBy> = {
  created_at: "occurred_at",
  tool_name: "tool_name",
  risk_level: "risk_level",
  cost_usd: "cost_usd",
};

const clientTimezone =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";

type EventsTab = "all" | "not_assigned";

export function Events() {
  const { currentOrg, hasRole, currentRole } = useOrg();
  const { data: me, isLoading: isLoadingMe } = useCurrentUser();
  const showNotAssignedTab =
    Boolean(currentOrg) &&
    (hasRole(["owner"]) ||
      (!isLoadingMe && Boolean(me?.globalAdmin ?? me?.super_admin)));
  const [activeTab, setActiveTab] = useState<EventsTab>("all");
  const [bulkAssign, setBulkAssign] = useState<{ fn: () => void; count: number } | null>(null);
  const [assignEventFn, setAssignEventFn] = useState<((eventId: string) => void) | null>(null);

  const handleBulkAssignChange = useCallback(
    (fn: (() => void) | null, count: number) => {
      setBulkAssign(fn ? { fn, count } : null);
    },
    []
  );

  const handleAssignReady = useCallback((fn: (eventId: string) => void) => {
    setAssignEventFn(() => fn);
  }, []);
  const queryClient = useQueryClient();
  const [urlParams] = useSearchParams();
  const [filters, setFilters] = useState<EventFiltersState>(() => ({
    tools: urlParams.get("tool_name") ? [urlParams.get("tool_name")!] : undefined,
    riskLevels: urlParams.get("risk_level")
      ? [urlParams.get("risk_level")!]
      : undefined,
  }));
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportQueued, setExportQueued] = useState(false);
  const [exportError, setExportError] = useState(false);

  const { data: orgProjects } = useProjects(currentOrg?.id || "");
  const { data: eventsSummary } = useEventsSummary(currentOrg?.id || "");

  const toolFilterOptions = useMemo<EventsToolFilterOption[]>(() => {
    const byTool = eventsSummary?.byTool;
    if (!byTool || Object.keys(byTool).length === 0) return [];
    return Object.keys(byTool)
      .sort()
      .map((slug) => ({ value: slug, label: humanizeToolName(slug) }));
  }, [eventsSummary]);

  const apiParams = useMemo(() => ({
    page,
    per_page: pageSize,
    tool_name: filters.tools,
    risk_level: filters.riskLevels,
    event_type: filters.eventTypes,
    project_id: filters.projectIds,
    start_date: filters.dateFrom,
    end_date: filters.dateTo,
    sort_by: SORT_FIELD_API_MAP[sortField],
    direction: sortDirection,
    tz: clientTimezone,
  }), [page, pageSize, filters.tools, filters.riskLevels, filters.eventTypes, filters.projectIds, filters.dateFrom, filters.dateTo, sortField, sortDirection]);

  const { data: eventsResponse, isLoading, isFetching, isError, refetch } = useEvents(
    currentOrg?.id || "",
    apiParams
  );

  const { exportEvents, isExporting } = useExportEvents(currentOrg?.id || "");

  const invalidateOrgEvents = useCallback(() => {
    if (!currentOrg?.id) return;
    void queryClient.invalidateQueries({
      queryKey: ["organizations", currentOrg.id, "events"],
    });
  }, [queryClient, currentOrg]);

  useEventsPageUpdates({
    onNewEvent: invalidateOrgEvents,
    onEventUpdated: invalidateOrgEvents,
  });

  const events: EventRow[] = useMemo(
    () => eventsResponse?.data?.map(toEventRow) || [],
    [eventsResponse]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    setPage(1);
  };

  // Client-side: text search only. Risk/tool/type/project filters (including the
  // not_none sentinel from Risk Alerts drill-down) are server-side — do not
  // re-filter risk levels here; staging previously compared against "not_none"
  // literally and hid every row.
  const filteredAndSortedEvents = useMemo(() => {
    let result = [...events];

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.tool_name || "").toLowerCase().includes(search) ||
          (e.project?.name || "").toLowerCase().includes(search)
      );
    }

    return result;
  }, [events, filters.search]);

  const handleExport = async () => {
    setExportQueued(false);
    setExportError(false);
    const startStr = filters.dateFrom ?? "all";
    const endStr = filters.dateTo ?? formatLocalDate(new Date());
    const filename = `aixle-insights-events-${startStr}-${endStr}.csv`;

    try {
      const result = await exportEvents({
        tool_name: filters.tools,
        risk_level: filters.riskLevels,
        event_type: filters.eventTypes,
        start_date: filters.dateFrom,
        end_date: filters.dateTo,
        project_id: filters.projectIds,
        sort_by: SORT_FIELD_API_MAP[sortField],
        direction: sortDirection,
        tz: clientTimezone,
        filename,
      });

      if (result?.queued) {
        setExportQueued(true);
      }
    } catch (err) {
      console.error("Export failed:", err);
      setExportError(true);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.events.all(currentOrg?.id || "", apiParams) });
  };

  const handleEventClick = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setDrawerOpen(true);
  }, []);

  const handleNavigate = useCallback((direction: "prev" | "next") => {
    if (!selectedEventId) return;
    const currentIndex = filteredAndSortedEvents.findIndex((e) => e.id === selectedEventId);
    if (currentIndex === -1) return;

    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < filteredAndSortedEvents.length) {
      setSelectedEventId(filteredAndSortedEvents[newIndex].id);
    }
  }, [selectedEventId, filteredAndSortedEvents]);

  const selectedEventIndex = selectedEventId
    ? filteredAndSortedEvents.findIndex((e) => e.id === selectedEventId)
    : -1;

  const totalPages = eventsResponse?.meta?.total_pages || 1;
  const totalCount = eventsResponse?.meta?.total_count || 0;
  const hasClientSideFilters = !!filters.search;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-h2">Events</h1>
        <p className="text-sm text-muted-foreground">
          All AI tool events across your organization
        </p>
      </div>

      {showNotAssignedTab && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EventsTab)}>
          <TabsList>
            <TabsTrigger value="all" onClick={() => setBulkAssign(null)}>All</TabsTrigger>
            <TabsTrigger value="not_assigned">Not Assigned</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <EventFilters
        filters={filters}
        onFiltersChange={(newFilters) => {
          setFilters(newFilters);
          setPage(1);
        }}
        tools={toolFilterOptions}
        projects={orgProjects}
        showConfidence={activeTab === "not_assigned"}
        hideAdvancedFilters={activeTab === "not_assigned"}
        trailing={
          <div className="flex items-center gap-2">
            {activeTab === "not_assigned" && bulkAssign && (
              <Button size="sm" onClick={bulkAssign.fn}>
                <CheckSquare className="mr-2 size-4" />
                Assign {bulkAssign.count} selected
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              {isExporting ? "Exporting…" : "Export"}
            </Button>
          </div>
        }
      />

      {activeTab === "not_assigned" && (
        <UnattributedEvents
          embedded
          toolFilter={filters.tools?.[0]}
          startDate={filters.dateFrom}
          endDate={filters.dateTo}
          minConfidence={filters.minConfidence}
          search={filters.search}
          onBulkAssignChange={handleBulkAssignChange}
          onEventClick={handleEventClick}
          onAssignReady={handleAssignReady}
        />
      )}

      <EventDrawer
        eventId={selectedEventId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onNavigate={activeTab === "all" ? handleNavigate : undefined}
        hasPrev={activeTab === "all" && selectedEventIndex > 0}
        hasNext={activeTab === "all" && selectedEventIndex < filteredAndSortedEvents.length - 1}
        onAssign={activeTab === "not_assigned" && assignEventFn ? assignEventFn : undefined}
      />

      {activeTab === "all" && (
        <>
          <EventsTable
            events={filteredAndSortedEvents}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            onEventClick={handleEventClick}
            selectedEventId={selectedEventId}
            showUserColumn={showEventsUserColumn(currentRole) || (!isLoadingMe && Boolean(me?.globalAdmin ?? me?.super_admin))}
          />

          {exportQueued && (
            <p className="text-sm text-muted-foreground">
              Your export is too large to download immediately. It has been queued — check back shortly.
            </p>
          )}
          {exportError && (
            <p className="text-sm text-destructive">
              Export failed. Please try again.
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <p>
                {hasClientSideFilters
                  ? `Showing ${filteredAndSortedEvents.length} filtered events`
                  : `Showing ${filteredAndSortedEvents.length} of ${totalCount} events`}
              </p>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-xs sm:text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
