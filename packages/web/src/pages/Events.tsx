import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, RefreshCw, UserX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/contexts/OrgContext";
import { useEvents, useExportEvents, useProjects, queryKeys } from "@/hooks/useApi";
import { useEventsPageUpdates } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import {
  EventFilters,
  EventsTable,
  EventDrawer,
  type EventFiltersState,
  type EventRow,
} from "@/components/events";
import { EVENTS_TOOL_FILTER_OPTIONS } from "@/lib/eventsToolFilters";

type SortField = "created_at" | "tool_name" | "risk_level" | "cost_usd";
type SortDirection = "asc" | "desc";

const riskLevelOrder = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

export function Events() {
  const { currentOrg } = useOrg();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<EventFiltersState>({});
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportQueued, setExportQueued] = useState(false);
  const [exportError, setExportError] = useState(false);

  const { data: orgProjects } = useProjects(currentOrg?.id || "");

  // Build API params from filters (keep in sync with handleExport)
  const apiParams = useMemo(() => ({
    page,
    per_page: 25,
    tool_name: filters.tool,
    risk_level: filters.riskLevel,
    event_type: filters.eventType,
    start_date: filters.dateFrom,
    end_date: filters.dateTo,
    project_id: filters.projectId,
  }), [page, filters]);

  const { data: eventsResponse, isLoading, isFetching } = useEvents(
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

  // Transform API response to EventRow format
  const events: EventRow[] = useMemo(() => {
    return eventsResponse?.data?.map((e) => ({
      id: e.id,
      tool_name: e.toolName,
      event_type: e.eventType,
      attribution: e.attribution,
      risk_level: e.riskLevel,
      cost_usd: e.costUsd,
      token_count: (e.inputTokens || 0) + (e.outputTokens || 0),
      created_at: e.occurredAt || e.createdAt,
      user: e.user ? { email: e.user.email } : undefined,
      project: e.project ? { name: e.project.name } : undefined,
    })) || [];
  }, [eventsResponse]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Client-side sorting and filtering for search
  const filteredAndSortedEvents = useMemo(() => {
    let result = [...events];

    // Apply client-side search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.tool_name || "").toLowerCase().includes(search) ||
          (e.user?.email || "").toLowerCase().includes(search) ||
          (e.project?.name || "").toLowerCase().includes(search)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "created_at":
          comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
          break;
        case "tool_name":
          comparison = (a.tool_name || "").localeCompare(b.tool_name || "");
          break;
        case "risk_level":
          comparison = (riskLevelOrder[a.risk_level as keyof typeof riskLevelOrder] || 0) - (riskLevelOrder[b.risk_level as keyof typeof riskLevelOrder] || 0);
          break;
        case "cost_usd":
          comparison = (a.cost_usd || 0) - (b.cost_usd || 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [events, filters.search, sortField, sortDirection]);

  const handleExport = async () => {
    setExportQueued(false);
    setExportError(false);
    const startStr = filters.dateFrom ?? "all";
    const endStr = filters.dateTo ?? new Date().toISOString().split("T")[0];
    const filename = `db90-events-${startStr}-${endStr}.csv`;

    try {
      const result = await exportEvents({
        tool_name: filters.tool,
        risk_level: filters.riskLevel,
        event_type: filters.eventType,
        start_date: filters.dateFrom,
        end_date: filters.dateTo,
        project_id: filters.projectId,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-muted-foreground">
            All AI tool events across your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/events/unattributed">
              <UserX className="mr-2 size-4" />
              <span className="hidden sm:inline">Unattributed</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`mr-2 size-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            <span className="hidden sm:inline">{isExporting ? "Exporting…" : "Export"}</span>
          </Button>
        </div>
      </div>

      <EventFilters
        filters={filters}
        onFiltersChange={(newFilters) => {
          setFilters(newFilters);
          setPage(1); // Reset to first page on filter change
        }}
        tools={EVENTS_TOOL_FILTER_OPTIONS}
        projects={orgProjects}
      />

      <EventsTable
        events={filteredAndSortedEvents}
        isLoading={isLoading}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        onEventClick={handleEventClick}
        selectedEventId={selectedEventId}
      />

      <EventDrawer
        eventId={selectedEventId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onNavigate={handleNavigate}
        hasPrev={selectedEventIndex > 0}
        hasNext={selectedEventIndex < filteredAndSortedEvents.length - 1}
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
        <p>
          Showing {filteredAndSortedEvents.length} of {totalCount} events
        </p>
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
    </div>
  );
}
