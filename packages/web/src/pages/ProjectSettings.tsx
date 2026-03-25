import { useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  Users,
  Plug,
  FileSearch,
  Shield,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectMembers,
} from '@/hooks/useApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ProjectTeamSection, ProjectConnectorsTab, ProjectSecurityTab, ProjectSettingsSection, ProjectNotFound, ProjectRetentionPolicySection } from '@/components/project';
import { cn } from '@/lib/utils';

const getNavItems = (id: string) => [
  { title: 'General', href: `/projects/${id}/settings`, icon: Building2 },
  { title: 'Members', href: `/projects/${id}/settings/members`, icon: Users },
  { title: 'Integrations', href: `/projects/${id}/settings/integrations`, icon: Plug },
  { title: 'Security & Audit', href: `/projects/${id}/settings/security`, icon: FileSearch },
  { title: 'Policies', href: `/projects/${id}/settings/policies`, icon: Shield },
];

function ProjectSettingsNav({ projectId }: { projectId: string }) {
  const location = useLocation();
  const navItems = getNavItems(projectId);

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = item.href === `/projects/${projectId}/settings`
          ? location.pathname === item.href
          : location.pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="size-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

interface GeneralFormData {
  name: string;
  description: string;
  repository_url: string;
  is_active: boolean;
}

function ProjectGeneralSettingsForm({
  projectId,
  defaultValues,
}: {
  projectId: string;
  defaultValues: GeneralFormData;
}) {
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  const [formData, setFormData] = useState(defaultValues);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleChange = (field: keyof GeneralFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      await updateProject.mutateAsync({ id: projectId, data: formData });
      setHasChanges(false);
    } catch {
      setSaveError('Failed to save changes. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      setDeleteError(null);
      try {
        await deleteProject.mutateAsync(projectId);
        navigate('/projects');
      } catch {
        setDeleteError('Failed to delete project. Please try again.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">General</h2>
        <p className="text-sm text-muted-foreground">
          Manage your project's basic information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-name">Name</Label>
            <Input
              id="proj-name"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-description">Description</Label>
            <Input
              id="proj-description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="A brief description of this project"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-repo">Repository URL</Label>
            <Input
              id="proj-repo"
              value={formData.repository_url}
              onChange={(e) => handleChange('repository_url', e.target.value)}
              placeholder="https://github.com/org/repo"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="proj-active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleChange('is_active', checked)}
            />
            <Label htmlFor="proj-active">Active</Label>
          </div>
        </CardContent>
      </Card>

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProject.isPending || !hasChanges}>
          {updateProject.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Save className="mr-2 size-4" />
          Save Changes
        </Button>
      </div>

      <ProjectSettingsSection projectId={projectId} />

      <Separator />

      <div>
        <h2 className="text-lg font-medium text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible and destructive actions
        </p>
      </div>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base">Delete Project</CardTitle>
          <CardDescription>
            Once you delete a project, there is no going back. All data associated with this
            project will be permanently deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <Button variant="destructive" onClick={handleDelete} disabled={deleteProject.isPending}>
            {deleteProject.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            <Trash2 className="mr-2 size-4" />
            Delete Project
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectGeneralSettings({
  projectId,
  project,
  isLoading,
}: {
  projectId: string;
  project: ReturnType<typeof useProject>['data'];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (!project) {
    return <ProjectNotFound />;
  }

  const defaultValues: GeneralFormData = {
    name: project.name || '',
    description: project.description || '',
    repository_url: project.repositoryUrl ?? project.repository_url ?? '',
    is_active: project.isActive ?? project.is_active,
  };

  return <ProjectGeneralSettingsForm key={project.id} projectId={projectId} defaultValues={defaultValues} />;
}

function ProjectMembersSettings({ projectId }: { projectId: string }) {
  const { data: members, isLoading } = useProjectMembers(projectId);

  return <ProjectTeamSection members={members} isLoading={isLoading} />;
}

function ProjectIntegrationsSettings({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Integrations</h2>
        <p className="text-sm text-muted-foreground">
          Connect AI providers to track usage and costs for this project
        </p>
      </div>
      <ProjectConnectorsTab projectId={projectId} />
    </div>
  );
}

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading: isLoadingProject } = useProject(id || '');

  if (!id) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to={`/projects/${id}`}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          {isLoadingProject ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">
              {project ? `${project.name} — Settings` : 'Settings'}
            </h1>
          )}
          <p className="text-sm text-muted-foreground">
            Manage settings and preferences for this project
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full md:w-48 shrink-0">
          <ProjectSettingsNav projectId={id} />
        </aside>
        <div className="flex-1 min-w-0">
          <Routes>
            <Route index element={<ProjectGeneralSettings projectId={id} project={project} isLoading={isLoadingProject} />} />
            <Route path="members" element={<ProjectMembersSettings projectId={id} />} />
            <Route path="integrations" element={<ProjectIntegrationsSettings projectId={id} />} />
            <Route path="security" element={<ProjectSecurityTab projectId={id} />} />
            <Route path="policies" element={<ProjectRetentionPolicySection projectId={id} />} />
            <Route path="*" element={<Navigate to={`/projects/${id}/settings`} replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
