import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEvents,
  useEventsSummary,
  useExportEvents,
  useCurrentUser,
} from "@/hooks/useApi";
import { useEventsPageUpdates } from "@/hooks/useWebSocket";
import { showEventsUserColumn, type SortField, type SortDirection, riskLevelOrder } from "@/lib/eventAccess";
import { dbTypesForCategory } from "@/lib/eventTypes";
import { humanizeToolName, toEventRow } from "@/lib/utils";
import type { EventFiltersState, EventRow } from "@/components/events";
import type { EventsToolFilterOption } from "@/lib/eventsToolFilters";

export interface ProjectEventsTab {
  filters: EventFiltersState;
  sort: SortField;
  sortDir: SortDirection;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  drawerOpen: boolean;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  exportQueued: boolean;
  exportError: boolean;
  isLoading: boolean;
  isExporting: boolean;
  filteredAndSortedEvents: EventRow[];
  toolFilterOptions: EventsToolFilterOption[];
  totalPages: number;
  totalCount: number;
  selectedIndex: number;
  showUserCol: boolean;
  handleFiltersChange: (f: EventFiltersState) => void;
  handleSort: (field: SortField) => void;
  handleNavigate: (direction: "prev" | "next") => void;
  handleExport: () => Promise<void>;
}

export function useProjectEventsTab({
  projectId,
  orgId,
  currentRole,
}: {
  projectId: string;
  orgId: string;
  currentRole: string | null;
}): ProjectEventsTab {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();

  const [filters, setFilters] = useState<EventFiltersState>({});
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportQueued, setExportQueued] = useState(false);
  const [exportError, setExportError] = useState(false);

  const eventsParams = useMemo(
    () => ({
      page,
      per_page: 25,
      project_id: projectId,
      tool_name: filters.tool,
      risk_level: filters.riskLevels?.length === 1 ? filters.riskLevels[0] : undefined,
      event_type: filters.eventType ? dbTypesForCategory(filters.eventType) : undefined,
      start_date: filters.dateFrom,
      end_date: filters.dateTo,
    }),
    [projectId, page, filters]
  );

  const { data: eventsResponse, isLoading } = useEvents(orgId, eventsParams);
  const { data: eventsSummary } = useEventsSummary(orgId);
  const { exportEvents, isExporting } = useExportEvents(orgId);

  useEventsPageUpdates({
    onNewEvent: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "events"] }),
    onEventUpdated: () =>
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "events"] }),
  });

  const showUserCol =
    showEventsUserColumn(currentRole) || !!(me?.globalAdmin ?? me?.super_admin);

  const toolFilterOptions = useMemo<EventsToolFilterOption[]>(() => {
    const byTool = eventsSummary?.byTool;
    if (!byTool || Object.keys(byTool).length === 0) return [];
    return Object.keys(byTool)
      .sort()
      .map((slug) => ({ value: slug, label: humanizeToolName(slug) }));
  }, [eventsSummary]);

  const tabEvents: EventRow[] = useMemo(
    () => eventsResponse?.data?.map(toEventRow) ?? [],
    [eventsResponse]
  );

  const filteredAndSortedEvents = useMemo(() => {
    let result = [...tabEvents];

    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.tool_name || "").toLowerCase().includes(s) ||
          (e.project?.name || "").toLowerCase().includes(s)
      );
    }

    if (filters.riskLevels && filters.riskLevels.length > 0) {
      result = result.filter((e) =>
        filters.riskLevels!.includes(e.risk_level || "none")
      );
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (sort) {
        case "created_at":
          comparison =
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime();
          break;
        case "tool_name":
          comparison = (a.tool_name || "").localeCompare(b.tool_name || "");
          break;
        case "risk_level":
          comparison =
            (riskLevelOrder[a.risk_level as keyof typeof riskLevelOrder] || 0) -
            (riskLevelOrder[b.risk_level as keyof typeof riskLevelOrder] || 0);
          break;
        case "cost_usd":
          comparison = (a.cost_usd || 0) - (b.cost_usd || 0);
          break;
      }
      return sortDir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [tabEvents, filters.search, filters.riskLevels, sort, sortDir]);

  const totalPages = eventsResponse?.meta?.total_pages || 1;
  const totalCount = eventsResponse?.meta?.total_count || 0;
  const selectedIndex = selectedId
    ? filteredAndSortedEvents.findIndex((e) => e.id === selectedId)
    : -1;

  const handleFiltersChange = useCallback((f: EventFiltersState) => {
    setFilters(f);
    setPage(1);
  }, []);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sort === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSort(field);
        setSortDir("desc");
      }
    },
    [sort]
  );

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!selectedId) return;
      const current = filteredAndSortedEvents.findIndex((e) => e.id === selectedId);
      if (current === -1) return;
      const next = direction === "prev" ? current - 1 : current + 1;
      if (next >= 0 && next < filteredAndSortedEvents.length) {
        setSelectedId(filteredAndSortedEvents[next].id);
      }
    },
    [selectedId, filteredAndSortedEvents]
  );

  const handleExport = useCallback(async () => {
    setExportQueued(false);
    setExportError(false);
    const startStr = filters.dateFrom ?? "all";
    const endStr = filters.dateTo ?? new Date().toISOString().split("T")[0];
    try {
      const result = await exportEvents({
        tool_name: filters.tool,
        risk_level: filters.riskLevels?.[0],
        event_type: filters.eventType ? dbTypesForCategory(filters.eventType) : undefined,
        start_date: filters.dateFrom,
        end_date: filters.dateTo,
        project_id: projectId,
        filename: `aixle-insights-events-${startStr}-${endStr}.csv`,
      });
      if (result?.queued) setExportQueued(true);
    } catch {
      setExportError(true);
    }
  }, [filters, exportEvents, projectId]);

  return {
    filters,
    sort,
    sortDir,
    page,
    setPage,
    selectedId,
    setSelectedId,
    drawerOpen,
    setDrawerOpen,
    exportQueued,
    exportError,
    isLoading,
    isExporting,
    filteredAndSortedEvents,
    toolFilterOptions,
    totalPages,
    totalCount,
    selectedIndex,
    showUserCol,
    handleFiltersChange,
    handleSort,
    handleNavigate,
    handleExport,
  };
}
