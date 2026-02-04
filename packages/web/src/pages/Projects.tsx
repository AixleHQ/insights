import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Grid, List, Search } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useProjects, useDeleteProject } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ProjectCard, type ProjectData } from '@/components/projects';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';

function ProjectSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export function Projects() {
  const { currentOrg } = useOrg();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { data: projectsData, isLoading } = useProjects(currentOrg?.id || '');
  const deleteProject = useDeleteProject();

  // Transform API response to component format
  const projects: ProjectData[] = useMemo(() => {
    return projectsData?.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      repository_url: p.repository_url || undefined,
      is_active: p.is_active,
      event_count: p.event_count,
      total_cost_usd: p.total_cost_usd,
      last_event_at: p.last_event_at || undefined,
      created_at: p.created_at,
      connectors: p.connectors,
    })) || [];
  }, [projectsData]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) =>
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.description?.toLowerCase().includes(search.toLowerCase())
    );
  }, [projects, search]);

  const handleEdit = (id: string) => {
    // Navigate to project detail or open edit modal
    console.log('Edit project:', id);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject.mutateAsync(id);
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage your projects and track AI tool usage
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/projects/new">
            <Plus className="mr-2 size-4" />
            New Project
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center rounded-md border self-start">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-none rounded-l-md"
            onClick={() => setViewMode('grid')}
          >
            <Grid className="size-4" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8 rounded-none rounded-r-md"
            onClick={() => setViewMode('list')}
          >
            <List className="size-4" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div
          className={cn(
            'gap-4',
            viewMode === 'grid'
              ? 'grid md:grid-cols-2 lg:grid-cols-3'
              : 'flex flex-col'
          )}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectSkeleton key={i} />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <p className="text-muted-foreground">
            {search ? 'No projects found' : 'No projects yet'}
          </p>
          {search ? (
            <Button
              variant="link"
              className="mt-2"
              onClick={() => setSearch('')}
            >
              Clear search
            </Button>
          ) : (
            <Button asChild variant="link" className="mt-2">
              <Link to="/projects/new">Create your first project</Link>
            </Button>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'gap-4',
            viewMode === 'grid'
              ? 'grid md:grid-cols-2 lg:grid-cols-3'
              : 'flex flex-col'
          )}
        >
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
