import React, { useMemo, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Activity,
  DollarSign,
  Calendar,
  GitBranch,
  Settings,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/contexts/OrgContext";
import {
  useProject,
  useEvents,
  useDeleteProject,
  useProjectDailyByTool,
  useProjectRepositories,
  useDisconnectRepo,
  useProjectMembers,
  useProjectStats,
  useCurrentUser,
  useEventsSummary,
  useExportEvents,
  type ProjectMember,
} from "@/hooks/useApi";
import { formatCost, formatCount } from "@/lib/formatters";
import { useEventsPageUpdates } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProviderLogo } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EventsTable, EventDrawer, EventFilters, type EventRow, type EventFiltersState } from "@/components/events";
import { ToolUsageByDayChart } from "@/components/dashboard";
import {
  ProjectReposSection,
  ProjectNotFound,
  ConnectRepoSheet,
  ProjectIssuesTab,
  ProjectConnectorsTab,
  ProjectMembersTab,
} from "@/components/project";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow, toEventRow, humanizeToolName } from "@/lib/utils";
import { showEventsUserColumn } from "@/lib/eventAccess";
import type { EventsToolFilterOption } from "@/lib/eventsToolFilters";

type SortField = "created_at" | "tool_name" | "risk_level" | "cost_usd";
type SortDirection = "asc" | "desc";

const riskLevelOrder = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function StatCard({
  icon: Icon,
  label,
  subtitle,
  value,
  delta,
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  value: React.ReactNode;
  delta?: string;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          {isLoading ? (
            <Skeleton className="h-6 w-20 mt-1" />
          ) : (
            <>
              <p className="font-mono-display text-lg font-semibold">{value}</p>
              {delta && <p className="text-xs text-muted-foreground mt-0.5">{delta}</p>}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg, currentRole, hasRole } = useOrg();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [connectRepoOpen, setConnectRepoOpen] = useState(false);

  // Events tab state
  const [eventsFilters, setEventsFilters] = useState<EventFiltersState>({});
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsSort, setEventsSort] = useState<SortField>("created_at");
  const [eventsSortDir, setEventsSortDir] = useState<SortDirection>("desc");
  const [eventsSelectedId, setEventsSelectedId] = useState<string | null>(null);
  const [eventsDrawerOpen, setEventsDrawerOpen] = useState(false);
  const [exportQueued, setExportQueued] = useState(false);
  const [exportError, setExportError] = useState(false);


  const { data: project, isLoading: isLoadingProject } = useProject(id || "");
  const { data: projectMembers } = useProjectMembers(id || "");
  const { data: me } = useCurrentUser();
  const { data: projectStats } = useProjectStats(id || "");
  const { data: dailyByToolData, isLoading: isLoadingDailyByTool } = useProjectDailyByTool(id || "");
  const { data: projectRepositories, isLoading: isLoadingRepositories } = useProjectRepositories(id || "");
  const disconnectRepo = useDisconnectRepo(id || "");
  const deleteProject = useDeleteProject();

  // Events tab hooks
  const eventsApiParams = useMemo(() => ({
    page: eventsPage,
    per_page: 25,
    project_id: id,
    tool_name: eventsFilters.tool,
    risk_level: eventsFilters.riskLevels?.length === 1 ? eventsFilters.riskLevels[0] : undefined,
    event_type: eventsFilters.eventType,
    start_date: eventsFilters.dateFrom,
    end_date: eventsFilters.dateTo,
  }), [id, eventsPage, eventsFilters]);

  const { data: eventsResponse, isLoading: isLoadingTabEvents } = useEvents(currentOrg?.id || "", eventsApiParams);
  const { data: eventsSummary } = useEventsSummary(currentOrg?.id || "");
  const { exportEvents, isExporting } = useExportEvents(currentOrg?.id || "");

  const toolFilterOptions = useMemo<EventsToolFilterOption[]>(() => {
    const byTool = eventsSummary?.byTool;
    if (!byTool || Object.keys(byTool).length === 0) return [];
    return Object.keys(byTool).sort().map((slug) => ({ value: slug, label: humanizeToolName(slug) }));
  }, [eventsSummary]);

  const showUserCol = showEventsUserColumn(currentRole) || !!(me?.globalAdmin ?? me?.super_admin);

  useEventsPageUpdates({
    onNewEvent: () => queryClient.invalidateQueries({ queryKey: ["organizations", currentOrg?.id, "events"] }),
    onEventUpdated: () => queryClient.invalidateQueries({ queryKey: ["organizations", currentOrg?.id, "events"] }),
  });

  const tabEvents: EventRow[] = useMemo(
    () => eventsResponse?.data?.map(toEventRow) ?? [],
    [eventsResponse]
  );

  const filteredAndSortedEvents = useMemo(() => {
    let result = [...tabEvents];

    if (eventsFilters.search) {
      const s = eventsFilters.search.toLowerCase();
      result = result.filter(
        (e) =>
          (e.tool_name || "").toLowerCase().includes(s) ||
          (e.project?.name || "").toLowerCase().includes(s)
      );
    }

    if (eventsFilters.riskLevels && eventsFilters.riskLevels.length > 0) {
      result = result.filter((e) => eventsFilters.riskLevels!.includes(e.risk_level || "none"));
    }

    result.sort((a, b) => {
      let comparison = 0;
      switch (eventsSort) {
        case "created_at":
          comparison = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
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
      return eventsSortDir === "asc" ? comparison : -comparison;
    });

    return result;
  }, [tabEvents, eventsFilters.search, eventsFilters.riskLevels, eventsSort, eventsSortDir]);

  const totalPages = eventsResponse?.meta?.total_pages || 1;
  const totalCount = eventsResponse?.meta?.total_count || 0;

  const eventsSelectedIndex = eventsSelectedId
    ? filteredAndSortedEvents.findIndex((e) => e.id === eventsSelectedId)
    : -1;

  const handleEventsSort = useCallback((field: SortField) => {
    if (eventsSort === field) {
      setEventsSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setEventsSort(field);
      setEventsSortDir("desc");
    }
  }, [eventsSort]);

  const handleEventsNavigate = useCallback((direction: "prev" | "next") => {
    if (!eventsSelectedId) return;
    const currentIndex = filteredAndSortedEvents.findIndex((e) => e.id === eventsSelectedId);
    if (currentIndex === -1) return;
    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < filteredAndSortedEvents.length) {
      setEventsSelectedId(filteredAndSortedEvents[newIndex].id);
    }
  }, [eventsSelectedId, filteredAndSortedEvents]);

  const handleExport = async () => {
    setExportQueued(false);
    setExportError(false);
    const startStr = eventsFilters.dateFrom ?? "all";
    const endStr = eventsFilters.dateTo ?? new Date().toISOString().split("T")[0];
    const filename = `db90-events-${startStr}-${endStr}.csv`;
    try {
      const result = await exportEvents({
        tool_name: eventsFilters.tool,
        risk_level: eventsFilters.riskLevels?.[0],
        event_type: eventsFilters.eventType,
        start_date: eventsFilters.dateFrom,
        end_date: eventsFilters.dateTo,
        project_id: id,
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

  // Permission flags (reused by tab gates)
  const myProjectMembership = projectMembers?.find((m: ProjectMember) => m.userId === me?.id);
  const isProjectOwner = hasRole(["owner"]) || myProjectMembership?.role === "owner";
  const canManageMembers = hasRole(["owner"]);
  const isMemberOfProject = isProjectOwner || !!myProjectMembership;

  const eventsDelta = useMemo(() => {
    const prev = projectStats?.previousPeriod?.totalEvents;
    const curr = projectStats?.totalEvents;
    if (curr == null || prev == null) return undefined;
    if (prev === 0) return curr > 0 ? "New activity" : undefined;
    const pct = (((curr - prev) / prev) * 100).toFixed(1);
    return `${curr >= prev ? "+" : ""}${pct}% vs prior 30d`;
  }, [projectStats]);

  const costDelta = useMemo(() => {
    const prev = projectStats?.previousPeriod?.totalCost;
    const curr = projectStats?.totalCost;
    if (curr == null || prev == null) return undefined;
    const diff = curr - prev;
    return `${diff >= 0 ? "+" : "-"}${formatCost(Math.abs(diff))} vs prior 30d`;
  }, [projectStats]);

  const handleDelete = async () => {
    if (!id) return;
    if (window.confirm("Are you sure you want to delete this project?")) {
      try {
        await deleteProject.mutateAsync(id);
        navigate("/projects");
      } catch (error) {
        console.error("Failed to delete project:", error);
      }
    }
  };

  if (isLoadingProject) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!project) {
    return <ProjectNotFound />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link to="/projects">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{project.name}</h1>
              <Badge variant={(project.is_active ?? project.isActive) ? "default" : "secondary"}>
                {(project.is_active ?? project.isActive) ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{project.description}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Project actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/projects/${id}/settings`)}>
              <Settings className="mr-2 size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem>
              <RefreshCw className="mr-2 size-4" />
              Sync connectors
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 size-4" />
              Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          {isMemberOfProject && <TabsTrigger value="members">Members</TabsTrigger>}
          {isProjectOwner && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
          <TabsTrigger value="issues">Issues</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {dailyByToolData && dailyByToolData.data && dailyByToolData.data.length > 0 && (
            <ToolUsageByDayChart
              data={dailyByToolData.data}
              tools={dailyByToolData.tools}
              isLoading={isLoadingDailyByTool}
            />
          )}

          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatCard
              icon={Activity}
              label="Total Events"
              subtitle="Last 30 days"
              value={projectStats ? formatCount(projectStats.totalEvents) : "—"}
              delta={eventsDelta}
              isLoading={!projectStats}
            />
            <StatCard
              icon={DollarSign}
              label="Total Cost"
              subtitle="Last 30 days"
              value={projectStats ? formatCost(projectStats.totalCost) : "—"}
              delta={costDelta}
              isLoading={!projectStats}
            />
            <StatCard
              icon={Calendar}
              label="Created"
              value={new Date(project.createdAt || project.created_at).toLocaleDateString()}
            />
            <StatCard
              icon={GitBranch}
              label="Last Activity"
              value={project.last_event_at || project.lastEventAt ? formatDistanceToNow(project.last_event_at || project.lastEventAt!) : "Never"}
            />
          </div>

          <ProjectReposSection
            repositories={projectRepositories}
            isLoading={isLoadingRepositories}
            onConnectRepo={() => setConnectRepoOpen(true)}
            onDisconnect={(repoId) => disconnectRepo.mutateAsync(repoId)}
          />

          {(project.sourceControlSummary?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Source Control Activity</CardTitle>
                <CardDescription>
                  Recent synced repository activity across linked providers
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {project.sourceControlSummary?.map((summary) => (
                  <div key={summary.provider} className="rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <ProviderLogo provider={summary.provider} size="sm" showBackground />
                      <div>
                        <p className="text-sm font-medium capitalize">{summary.provider}</p>
                        <p className="text-xs text-muted-foreground">
                          {summary.repositoryCount} linked repos
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Commits</p>
                        <p className="font-medium">{summary.commitCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reviews</p>
                        <p className="font-medium">{summary.reviewCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Pipelines</p>
                        <p className="font-medium">{summary.pipelineCount}</p>
                      </div>
                    </div>
                    {(summary.lastActivityAt || summary.lastSyncAt) && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {summary.lastActivityAt ? `Latest activity ${formatDistanceToNow(summary.lastActivityAt)}` : null}
                        {summary.lastActivityAt && summary.lastSyncAt ? " · " : ""}
                        {summary.lastSyncAt ? `Synced ${formatDistanceToNow(summary.lastSyncAt)}` : null}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {(project.issueThroughputSummary?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Issue Throughput</CardTitle>
                <CardDescription>
                  Recent synced issue lifecycle activity for project members
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {project.issueThroughputSummary?.map((summary) => (
                  <div key={summary.provider} className="rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <ProviderLogo provider={summary.provider} size="sm" showBackground />
                      <div>
                        <p className="text-sm font-medium capitalize">{summary.provider}</p>
                        <p className="text-xs text-muted-foreground">
                          Synced issue throughput
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Issues</p>
                        <p className="font-medium">{summary.issueCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Completed</p>
                        <p className="font-medium">{summary.completedCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">State Changes</p>
                        <p className="font-medium">{summary.stateChangeCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Cycles</p>
                        <p className="font-medium">{summary.cycleCount}</p>
                      </div>
                    </div>
                    {(summary.lastActivityAt || summary.lastSyncAt) && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {summary.lastActivityAt ? `Latest activity ${formatDistanceToNow(summary.lastActivityAt)}` : null}
                        {summary.lastActivityAt && summary.lastSyncAt ? " · " : ""}
                        {summary.lastSyncAt ? `Synced ${formatDistanceToNow(summary.lastSyncAt)}` : null}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {project.repositoryUrl && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <GitBranch className="size-4 text-muted-foreground" />
                <a
                  href={project.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {project.repositoryUrl}
                </a>
              </CardContent>
            </Card>
          )}

          <ConnectRepoSheet
            projectId={id || ""}
            open={connectRepoOpen}
            onOpenChange={setConnectRepoOpen}
            onSuccess={() => setConnectRepoOpen(false)}
          />
        </TabsContent>

        {/* ── Events ── */}
        <TabsContent value="events" className="space-y-4 mt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <EventFilters
              filters={eventsFilters}
              onFiltersChange={(f) => { setEventsFilters(f); setEventsPage(1); }}
              tools={toolFilterOptions}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="shrink-0"
            >
              {isExporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              <span className="hidden sm:inline">{isExporting ? "Exporting…" : "Export"}</span>
            </Button>
          </div>

          {exportQueued && (
            <p className="text-sm text-muted-foreground">
              Your export is too large to download immediately. It has been queued — check back shortly.
            </p>
          )}
          {exportError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>Export failed. Please try again.</AlertDescription>
            </Alert>
          )}

          <EventsTable
            events={filteredAndSortedEvents}
            isLoading={isLoadingTabEvents}
            sortField={eventsSort}
            sortDirection={eventsSortDir}
            onSort={handleEventsSort}
            onEventClick={(eid) => {
              setEventsSelectedId(eid);
              setEventsDrawerOpen(true);
            }}
            selectedEventId={eventsSelectedId}
            showUserColumn={showUserCol}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
            <p>Showing {filteredAndSortedEvents.length} of {totalCount} events</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                  disabled={eventsPage === 1}
                >
                  Previous
                </Button>
                <span className="text-xs sm:text-sm">Page {eventsPage} of {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEventsPage((p) => Math.min(totalPages, p + 1))}
                  disabled={eventsPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          <EventDrawer
            eventId={eventsSelectedId}
            open={eventsDrawerOpen}
            onOpenChange={setEventsDrawerOpen}
            onNavigate={handleEventsNavigate}
            hasPrev={eventsSelectedIndex > 0}
            hasNext={eventsSelectedIndex < filteredAndSortedEvents.length - 1}
          />
        </TabsContent>

        {/* ── Members ── */}
        {isMemberOfProject && (
          <TabsContent value="members" className="mt-4">
            <ProjectMembersTab
              projectId={id || ""}
              orgId={currentOrg?.id || ""}
              isProjectOwner={isProjectOwner}
              canManageMembers={canManageMembers}
            />
          </TabsContent>
        )}

        {/* ── Integrations (lead-only) ── */}
        {isProjectOwner && (
          <TabsContent value="integrations" className="mt-4">
            <ProjectConnectorsTab projectId={id || ""} />
          </TabsContent>
        )}

        {/* ── Issues ── */}
        <TabsContent value="issues" className="mt-4">
          <ProjectIssuesTab projectId={id || ""} project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
