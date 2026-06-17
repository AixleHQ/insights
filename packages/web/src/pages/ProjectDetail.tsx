import React, { useMemo, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { useOrg } from "@/contexts/OrgContext";

import {
  useProject,
  useDeleteProject,
  useProjectDailyByTool,
  useProjectRepositories,
  useDisconnectRepo,
  useProjectMembers,
  useCurrentUser,
  type ProjectMember,
} from "@/hooks/useApi";

import { useProjectEventsTab } from "@/hooks/useProjectEventsTab";
import { formatCost, formatCount } from "@/lib/formatters";
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
import { EventsTable, EventDrawer, EventFilters } from "@/components/events";
import { ToolUsageByDayChart, TOOL_USAGE_DEFAULT_DAYS } from "@/components/dashboard";
import {
  ProjectReposSection,
  ProjectNotFound,
  ConnectRepoSheet,
  ProjectIssuesTab,
  ProjectConnectorsTab,
  ProjectMembersTab,
  ProjectTeamSection,
} from "@/components/project";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "@/lib/utils";
import { isGitRemoteMissing } from "@/lib/project-git-remote";

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
          <p className="type-caption text-muted-foreground">{label}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          {isLoading ? (
            <Skeleton className="h-6 w-20 mt-1" />
          ) : (
            <>
              <p className="font-mono-display type-h4">{value}</p>
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
  const [connectRepoOpen, setConnectRepoOpen] = useState(false);

  const { data: project, isLoading: isLoadingProject } = useProject(id || "");
  const { data: projectMembers, isLoading: isLoadingMembers } = useProjectMembers(id || "");
  const { data: me } = useCurrentUser();
  const [dailyByToolDays, setDailyByToolDays] = useState(TOOL_USAGE_DEFAULT_DAYS);
  const { data: dailyByToolData, isLoading: isLoadingDailyByTool } = useProjectDailyByTool(id || "", dailyByToolDays);
  const { data: projectRepositories, isLoading: isLoadingRepositories } = useProjectRepositories(id || "");
  const disconnectRepo = useDisconnectRepo(id || "");
  const deleteProject = useDeleteProject();

  const eventsTab = useProjectEventsTab({
    projectId: id || "",
    orgId: currentOrg?.id || "",
    currentRole,
  });

  // Permission flags (reused by tab gates)
  const myProjectMembership = projectMembers?.find((m: ProjectMember) => m.userId === me?.id);
  const isProjectOwner = hasRole(["owner"]) || myProjectMembership?.role === "owner";
  const canManageMembers = hasRole(["owner"]);
  const isMemberOfProject = isProjectOwner || !!myProjectMembership;

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = useMemo(() => {
    const allowed = new Set(["overview", "events", "issues"]);
    if (isMemberOfProject) allowed.add("members");
    if (isProjectOwner) allowed.add("integrations");
    if (tabParam && allowed.has(tabParam)) return tabParam;
    return "overview";
  }, [tabParam, isMemberOfProject, isProjectOwner]);

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

  const hasAttributedEventCount = Object.prototype.hasOwnProperty.call(project, "eventCount");
  const hasAttributedCostUsd = Object.prototype.hasOwnProperty.call(project, "totalCostUsd");
  const hasLastAttributedAt = Object.prototype.hasOwnProperty.call(project, "lastEventAt");

  const attributedEventCount = project.eventCount;
  const attributedCostUsd = project.totalCostUsd;
  const lastAttributedAt = project.lastEventAt;

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
              <h1 className="type-h3">{project.name}</h1>
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

      {isGitRemoteMissing(project) && (
        <Alert
          className="border-warning/30 bg-warning/10 text-warning-foreground dark:border-warning/25 dark:bg-warning/10 dark:text-warning-foreground [&>svg]:text-warning dark:[&>svg]:text-warning"
        >
          <AlertCircle className="size-4 shrink-0" />
          <AlertDescription className="text-warning-foreground dark:text-warning/80">
            <p className="font-medium text-warning-foreground dark:text-warning/70">
              No git remote configured for CLI attribution
            </p>
            <p className="mt-1 text-sm text-warning-foreground/90 dark:text-warning/80">
              Events from the Aixle Insights CLI will not be automatically matched to this project until you set the
              repository&apos;s{" "}
              <code className="rounded bg-warning/15 px-1 py-0.5 font-mono text-xs">git remote get-url origin</code>{" "}
              value in project settings.
            </p>
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-warning-foreground underline dark:text-warning/70">
              <Link to={`/projects/${id}/settings`}>Open project settings</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
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
              onDaysChange={setDailyByToolDays}
            />
          )}

          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <StatCard
              icon={Activity}
              label="Total Events"
              subtitle="All-time attributed"
              value={hasAttributedEventCount ? formatCount(attributedEventCount ?? 0) : "—"}
            />
            <StatCard
              icon={DollarSign}
              label="Total Cost"
              subtitle="All-time attributed"
              value={hasAttributedCostUsd ? formatCost(attributedCostUsd ?? 0) : "—"}
            />
            <StatCard
              icon={Calendar}
              label="Created"
              value={new Date(project.createdAt || project.created_at).toLocaleDateString()}
            />
            <StatCard
              icon={GitBranch}
              label="Last Activity"
              subtitle="All-time attributed"
              value={hasLastAttributedAt ? (lastAttributedAt ? formatDistanceToNow(lastAttributedAt) : "Never") : "—"}
            />
          </div>

          <ProjectReposSection
            repositories={projectRepositories}
            isLoading={isLoadingRepositories}
            onConnectRepo={() => setConnectRepoOpen(true)}
            onDisconnect={(repoId) => disconnectRepo.mutateAsync(repoId)}
          />

          <ProjectTeamSection
            members={projectMembers}
            isLoading={isLoadingMembers}
            projectId={id}
            orgId={currentOrg?.id}
            canManage={canManageMembers}
          />

          {(project.sourceControlSummary?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="type-body-lg">Source Control Activity</CardTitle>
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
                        <p className="type-caption text-muted-foreground">
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
                <CardTitle className="type-body-lg">Issue Throughput</CardTitle>
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
                        <p className="type-caption text-muted-foreground">
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
              filters={eventsTab.filters}
              onFiltersChange={eventsTab.handleFiltersChange}
              tools={eventsTab.toolFilterOptions}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={eventsTab.handleExport}
              disabled={eventsTab.isExporting}
              className="shrink-0"
            >
              {eventsTab.isExporting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Download className="mr-2 size-4" />
              )}
              <span className="hidden sm:inline">{eventsTab.isExporting ? "Exporting…" : "Export"}</span>
            </Button>
          </div>

          {eventsTab.exportQueued && (
            <p className="text-sm text-muted-foreground">
              Your export is too large to download immediately. It has been queued — check back shortly.
            </p>
          )}
          {eventsTab.exportError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>Export failed. Please try again.</AlertDescription>
            </Alert>
          )}

          <EventsTable
            events={eventsTab.filteredAndSortedEvents}
            isLoading={eventsTab.isLoading}
            sortField={eventsTab.sort}
            sortDirection={eventsTab.sortDir}
            onSort={eventsTab.handleSort}
            onEventClick={(eid) => {
              eventsTab.setSelectedId(eid);
              eventsTab.setDrawerOpen(true);
            }}
            selectedEventId={eventsTab.selectedId}
            showUserColumn={eventsTab.showUserCol}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground">
            <p>Showing {eventsTab.filteredAndSortedEvents.length} of {eventsTab.totalCount} events</p>
            {eventsTab.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => eventsTab.setPage((p) => Math.max(1, p - 1))}
                  disabled={eventsTab.page === 1}
                >
                  Previous
                </Button>
                <span className="text-xs sm:text-sm">Page {eventsTab.page} of {eventsTab.totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => eventsTab.setPage((p) => Math.min(eventsTab.totalPages, p + 1))}
                  disabled={eventsTab.page >= eventsTab.totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>

          <EventDrawer
            eventId={eventsTab.selectedId}
            open={eventsTab.drawerOpen}
            onOpenChange={eventsTab.setDrawerOpen}
            onNavigate={eventsTab.handleNavigate}
            hasPrev={eventsTab.selectedIndex > 0}
            hasNext={eventsTab.selectedIndex < eventsTab.filteredAndSortedEvents.length - 1}
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
            <ProjectConnectorsTab projectId={id || ""} orgId={currentOrg?.id || ""} />
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
