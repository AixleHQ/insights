import { useMemo, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
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
  useProjectMembers,
  useProjectRepositories,
} from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { EventsTable, EventDrawer, type EventRow } from '@/components/events';
import { ToolUsageByDayChart } from '@/components/dashboard';
import { ProjectTeamSection, ProjectReposSection, ProjectConnectorsTab } from '@/components/project';
import { formatDistanceToNow } from '@/lib/utils';

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

  const { data: project, isLoading: isLoadingProject } = useProject(id || '');
  const { data: eventsResponse, isLoading: isLoadingEvents } = useEvents(
    currentOrg?.id || '',
    { project_id: id, per_page: 10 }
  );
  const { data: dailyByToolData, isLoading: isLoadingDailyByTool } = useProjectDailyByTool(id || '');
  const { data: projectMembers, isLoading: isLoadingMembers } = useProjectMembers(id || '');
  const { data: projectRepositories, isLoading: isLoadingRepositories } = useProjectRepositories(id || '');
  const deleteProject = useDeleteProject();

  // Transform events for the table
  const events: EventRow[] = useMemo(() => {
    return eventsResponse?.data?.map((e) => ({
      id: e.id,
      tool_name: e.toolName,
      event_type: e.eventType,
      risk_level: e.riskLevel,
      cost_usd: e.costUsd,
      token_count: (e.inputTokens || 0) + (e.outputTokens || 0),
      created_at: e.occurredAt || e.createdAt,
      user: e.user ? { email: e.user.email } : undefined,
      project: e.project ? { name: e.project.name } : undefined,
    })) || [];
  }, [eventsResponse]);

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
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Project not found</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/projects">
            <ArrowLeft className="mr-2 size-4" />
            Back to projects
          </Link>
        </Button>
      </div>
    );
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
            <Button variant="outline" size="icon">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/projects/${id}/edit`)}>
              <Settings className="mr-2 size-4" />
              Edit project
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

      {/* Team and Repositories */}
      <div className="grid gap-4 md:grid-cols-2">
        <ProjectTeamSection
          members={projectMembers}
          isLoading={isLoadingMembers}
        />
        <ProjectReposSection
          repositories={projectRepositories}
          isLoading={isLoadingRepositories}
        />
      </div>

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

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Events</CardTitle>
              <CardDescription>
                Latest AI tool activity for this project
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <EventsTable
                events={events}
                isLoading={isLoadingEvents}
                onEventClick={handleEventClick}
                selectedEventId={selectedEventId}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="integrations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Provider Connectors</CardTitle>
              <CardDescription>
                Connect AI providers to track usage and costs for this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectConnectorsTab projectId={id!} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Settings</CardTitle>
              <CardDescription>
                Configure project-specific options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Project settings coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EventDrawer
        eventId={selectedEventId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onNavigate={handleNavigate}
        hasPrev={selectedEventIndex > 0}
        hasNext={selectedEventIndex < events.length - 1}
      />
    </div>
  );
}
