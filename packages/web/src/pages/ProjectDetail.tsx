import { useMemo, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import {
  useProject,
  useEvents,
  useDeleteProject,
  useProjectDailyByTool,
  useProjectRepositories,
  useDisconnectRepo,
  useProjectMembers,
  type ProjectMember,
} from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EventsTable, EventDrawer, FilterChip, type EventRow } from '@/components/events';
import { ToolUsageByDayChart } from '@/components/dashboard';
import { ProjectReposSection, ProjectNotFound, ConnectRepoSheet, ProjectIssuesTab } from '@/components/project';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDistanceToNow, toEventRow, getMemberDisplayName } from '@/lib/utils';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function StatCard({
  icon: Icon,
  label,
  value,
  isLoading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
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
          {isLoading ? (
            <Skeleton className="h-6 w-20 mt-1" />
          ) : (
            <p className="font-mono-display text-lg font-semibold">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connectRepoOpen, setConnectRepoOpen] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);

  const { data: project, isLoading: isLoadingProject } = useProject(id || '');
  const { data: projectMembers } = useProjectMembers(id || '');
  const { data: eventsResponse, isLoading: isLoadingEvents, isError: isEventsError } = useEvents(
    currentOrg?.id || '',
    { project_id: id, per_page: 10, user_id: selectedUserId }
  );
  const { data: dailyByToolData, isLoading: isLoadingDailyByTool } = useProjectDailyByTool(id || '');
  const { data: projectRepositories, isLoading: isLoadingRepositories } = useProjectRepositories(id || '');
  const disconnectRepo = useDisconnectRepo(id || '');
  const deleteProject = useDeleteProject();

  const events: EventRow[] = useMemo(
    () => eventsResponse?.data?.map(toEventRow) ?? [],
    [eventsResponse]
  );

  const selectedMember = selectedUserId
    ? projectMembers?.find((m) => m.userId === selectedUserId)
    : undefined;

  const handleEventClick = useCallback((eventId: string) => {
    setSelectedEventId(eventId);
    setDrawerOpen(true);
  }, []);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!selectedEventId) return;
    const currentIndex = events.findIndex((e) => e.id === selectedEventId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < events.length) {
      setSelectedEventId(events[newIndex].id);
    }
  }, [selectedEventId, events]);

  const selectedEventIndex = selectedEventId
    ? events.findIndex((e) => e.id === selectedEventId)
    : -1;

  const handleDelete = async () => {
    if (!id) return;
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject.mutateAsync(id);
        navigate('/projects');
      } catch (error) {
        console.error('Failed to delete project:', error);
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
              <Badge variant={(project.is_active ?? project.isActive) ? 'default' : 'secondary'}>
                {(project.is_active ?? project.isActive) ? 'Active' : 'Inactive'}
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
          <TabsTrigger value="issues">Issues</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* Tool Usage Chart */}
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
              value={(project.event_count ?? project.eventCount ?? 0).toLocaleString()}
            />
            <StatCard
              icon={DollarSign}
              label="Total Cost"
              value={formatCurrency(project.total_cost_usd ?? project.totalCostUsd ?? 0)}
            />
            <StatCard
              icon={Calendar}
              label="Created"
              value={new Date(project.createdAt || project.created_at).toLocaleDateString()}
            />
            <StatCard
              icon={GitBranch}
              label="Last Activity"
              value={project.last_event_at || project.lastEventAt ? formatDistanceToNow(project.last_event_at || project.lastEventAt!) : 'Never'}
            />
          </div>

          <ProjectReposSection
            repositories={projectRepositories}
            isLoading={isLoadingRepositories}
            onConnectRepo={() => setConnectRepoOpen(true)}
            onDisconnect={(repoId) => disconnectRepo.mutateAsync(repoId)}
          />

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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Events</CardTitle>
              <CardDescription>
                Latest AI tool activity for this project
              </CardDescription>
            </CardHeader>
            {projectMembers && projectMembers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
                <Select
                  value={selectedUserId ?? '__all__'}
                  onValueChange={(val) => setSelectedUserId(val === '__all__' ? undefined : val)}
                >
                  <SelectTrigger className="h-8 w-[180px] text-sm">
                    <SelectValue placeholder="All members" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All members</SelectItem>
                    {projectMembers.map((member: ProjectMember) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {getMemberDisplayName(member)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedUserId && selectedMember && (
                  <FilterChip
                    label="Member"
                    value={getMemberDisplayName(selectedMember)}
                    onRemove={() => setSelectedUserId(undefined)}
                  />
                )}
              </div>
            )}
            <CardContent className="p-0">
              {isEventsError ? (
                <Alert variant="destructive" className="m-4">
                  <AlertCircle className="size-4" />
                  <AlertDescription>Failed to load events. Please try again.</AlertDescription>
                </Alert>
              ) : (
                <EventsTable
                  events={events}
                  isLoading={isLoadingEvents}
                  onEventClick={handleEventClick}
                  selectedEventId={selectedEventId}
                />
              )}
            </CardContent>
          </Card>

          <EventDrawer
            eventId={selectedEventId}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            onNavigate={handleNavigate}
            hasPrev={selectedEventIndex > 0}
            hasNext={selectedEventIndex < events.length - 1}
          />

          <ConnectRepoSheet
            projectId={id || ''}
            open={connectRepoOpen}
            onOpenChange={setConnectRepoOpen}
            onSuccess={() => setConnectRepoOpen(false)}
          />
        </TabsContent>

        <TabsContent value="issues" className="mt-4">
          <ProjectIssuesTab projectId={id || ''} project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
