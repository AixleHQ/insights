import { useState } from 'react';
import { Layers } from 'lucide-react';
import { useProjectIssues } from '@/hooks/useApi';
import type { ProjectWithStats } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConnectJiraSheet } from './ConnectJiraSheet';
import { formatDistanceToNow } from '@/lib/utils';

const STATUS_CATEGORY_LABELS: Record<string, string> = {
  new: 'To Do',
  indeterminate: 'In Progress',
  done: 'Done',
};

const STATUS_CATEGORY_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  new: 'outline',
  indeterminate: 'default',
  done: 'secondary',
};

interface ProjectIssuesTabProps {
  projectId: string;
  project: ProjectWithStats;
}

export function ProjectIssuesTab({ projectId, project }: ProjectIssuesTabProps) {
  const [connectJiraOpen, setConnectJiraOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const isLinked = !!project.jiraProjectKey;

  const { data: issuesResponse, isLoading } = useProjectIssues(
    projectId,
    isLinked
      ? {
          status_category: statusFilter || undefined,
          type: typeFilter || undefined,
        }
      : undefined
  );

  const issues = issuesResponse?.data ?? [];

  if (!isLinked) {
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Jira Issues</CardTitle>
            </div>
            <CardDescription>
              Connect a Jira project to track issues alongside your AI tool usage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setConnectJiraOpen(true)}>Connect Jira Project</Button>
          </CardContent>
        </Card>

        <ConnectJiraSheet
          projectId={projectId}
          open={connectJiraOpen}
          onOpenChange={setConnectJiraOpen}
          onSuccess={() => setConnectJiraOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">
                Issues
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {project.jiraProjectKey}
                </span>
              </CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => setConnectJiraOpen(true)}>
              Change project
            </Button>
          </div>
        </CardHeader>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 px-6 pb-3">
          <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="new">To Do</SelectItem>
              <SelectItem value="indeterminate">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter || '__all__'} onValueChange={(v) => setTypeFilter(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              <SelectItem value="Bug">Bug</SelectItem>
              <SelectItem value="Story">Story</SelectItem>
              <SelectItem value="Task">Task</SelectItem>
              <SelectItem value="Epic">Epic</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-t px-6 py-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-6">
              No issues found{statusFilter || typeFilter ? ' matching the selected filters' : ''}.
            </p>
          ) : (
            <div className="divide-y">
              {issues.map((issue) => (
                <div key={issue.id} className="flex items-start gap-4 px-6 py-3 hover:bg-muted/30">
                  <span className="text-xs text-muted-foreground font-mono pt-0.5 shrink-0 w-16">
                    {issue.key}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{issue.summary}</p>
                    {issue.assigneeName && (
                      <p className="text-xs text-muted-foreground mt-0.5">{issue.assigneeName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {issue.issueType && (
                      <span className="text-xs text-muted-foreground">{issue.issueType}</span>
                    )}
                    {issue.statusCategory && (
                      <Badge
                        variant={STATUS_CATEGORY_VARIANTS[issue.statusCategory] ?? 'outline'}
                        className="text-xs"
                      >
                        {STATUS_CATEGORY_LABELS[issue.statusCategory] ?? issue.status}
                      </Badge>
                    )}
                    {issue.externalUpdatedAt && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(issue.externalUpdatedAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConnectJiraSheet
        projectId={projectId}
        open={connectJiraOpen}
        onOpenChange={setConnectJiraOpen}
        onSuccess={() => setConnectJiraOpen(false)}
      />
    </>
  );
}
