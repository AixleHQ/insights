import { useState } from 'react';
import { Settings, Shield } from 'lucide-react';
import { useProject, useUpdateProject } from '@/hooks/useApi';
import { ProjectForm, type ProjectFormData } from '@/components/projects';
import { ProjectSecurityTab } from './ProjectSecurityTab';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type SettingsPage = 'general' | 'security';

const navItems: { key: SettingsPage; title: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'general', title: 'General', icon: Settings },
  { key: 'security', title: 'Security & Audit', icon: Shield },
];

function ProjectSettingsNav({
  activePage,
  onPageChange,
}: {
  activePage: SettingsPage;
  onPageChange: (page: SettingsPage) => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = activePage === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onPageChange(item.key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors text-left',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="size-4" />
            {item.title}
          </button>
        );
      })}
    </nav>
  );
}

function GeneralSettings({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();

  const handleSubmit = async (data: ProjectFormData) => {
    await updateProject.mutateAsync({
      id: projectId,
      data: {
        name: data.name,
        description: data.description || null,
        repository_url: data.repository_url || null,
        is_active: data.is_active,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">General</h2>
        <p className="text-sm text-muted-foreground">
          Update your project settings
        </p>
      </div>
      <ProjectForm
        isEditing
        hideHeader
        hideCancel
        initialData={{
          name: project.name,
          description: project.description || '',
          repository_url: project.repositoryUrl || '',
          is_active: project.isActive ?? true,
        }}
        onSubmit={handleSubmit}
        onSuccess={() => {}}
      />
    </div>
  );
}

export function ProjectSettingsTab({ projectId }: { projectId: string }) {
  const [activePage, setActivePage] = useState<SettingsPage>('general');

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <aside className="w-full md:w-48 shrink-0">
        <ProjectSettingsNav activePage={activePage} onPageChange={setActivePage} />
      </aside>
      <div className="min-w-0 flex-1">
        {activePage === 'general' && <GeneralSettings projectId={projectId} />}
        {activePage === 'security' && <ProjectSecurityTab projectId={projectId} />}
      </div>
    </div>
  );
}
