import { GitBranch, Github, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from '@/lib/utils';
import type { ProjectRepository } from '@/hooks/useApi';

interface ProjectReposSectionProps {
  repositories: ProjectRepository[] | undefined;
  isLoading?: boolean;
  className?: string;
}

function getProviderIcon(provider: string) {
  switch (provider.toLowerCase()) {
    case 'github':
      return Github;
    default:
      return GitBranch;
  }
}

export function ProjectReposSection({ repositories, isLoading, className }: ProjectReposSectionProps) {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Repositories</CardTitle>
          </div>
          <CardDescription>Loading repositories...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const repoCount = repositories?.length || 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Repositories</CardTitle>
        </div>
        <CardDescription>
          {repoCount} {repoCount === 1 ? 'repository' : 'repositories'} linked
        </CardDescription>
      </CardHeader>
      <CardContent>
        {repoCount > 0 ? (
          <div className="space-y-2">
            {repositories?.map((repo) => {
              const ProviderIcon = getProviderIcon(repo.provider);
              return (
                <a
                  key={repo.id}
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-8 items-center justify-center rounded bg-muted">
                      <ProviderIcon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:underline">
                        {repo.fullName || repo.name}
                      </p>
                      {repo.lastSyncAt && (
                        <p className="text-xs text-muted-foreground">
                          Synced {formatDistanceToNow(repo.lastSyncAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={repo.isActive ? 'default' : 'secondary'} className="text-xs">
                      {repo.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <ExternalLink className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No repositories linked to this project</p>
        )}
      </CardContent>
    </Card>
  );
}
