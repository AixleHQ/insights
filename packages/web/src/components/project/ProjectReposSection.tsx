import { GitBranch, Github, ExternalLink, Plus, Unlink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from '@/lib/utils';
import type { ProjectRepository } from '@/hooks/useApi';

interface ProjectReposSectionProps {
  repositories: ProjectRepository[] | undefined;
  isLoading?: boolean;
  className?: string;
  onConnectRepo?: () => void;
  onDisconnect?: (repoId: string) => Promise<unknown>;
}

function getProviderIcon(provider: string) {
  switch (provider.toLowerCase()) {
    case 'github':
      return Github;
    default:
      return GitBranch;
  }
}

export function ProjectReposSection({ repositories, isLoading, className, onConnectRepo, onDisconnect }: ProjectReposSectionProps) {
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Repositories</CardTitle>
          </div>
          {onConnectRepo && (
            <Button size="sm" variant="outline" onClick={onConnectRepo} className="gap-1">
              <Plus className="size-3" /> Connect Repository
            </Button>
          )}
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
                <div
                  key={repo.id}
                  className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 min-w-0 flex-1"
                  >
                    <div className="flex size-8 items-center justify-center rounded bg-muted shrink-0">
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
                  </a>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge variant={repo.isActive ? 'default' : 'secondary'} className="text-xs">
                      {repo.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <ExternalLink className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    {onDisconnect && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        aria-label={`Disconnect ${repo.fullName || repo.name}`}
                        onClick={() => {
                          if (window.confirm(`Disconnect "${repo.fullName || repo.name}" from this project?`)) {
                            onDisconnect(repo.id);
                          }
                        }}
                      >
                        <Unlink className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
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
