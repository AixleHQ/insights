import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Layers, Bug, BookOpen, CheckSquare, Zap, Circle, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useProject, useProjectIssues, useSyncProjectIssues } from "@/hooks/useApi";
import type { ProjectWithStats } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConnectJiraSheet } from "./ConnectJiraSheet";
import { ConnectLinearSheet } from "./ConnectLinearSheet";
import { formatDistanceToNow } from "@/lib/utils";

const STATUS_CATEGORY_LABELS: Record<string, string> = {
  new: "To Do",
  indeterminate: "In Progress",
  done: "Done",
};

const STATUS_CATEGORY_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  new: "outline",
  indeterminate: "default",
  done: "secondary",
};

const ISSUE_TYPE_ICONS: Record<string, React.ElementType> = {
  Bug: Bug,
  Story: BookOpen,
  Task: CheckSquare,
  Epic: Zap,
};

function IssueTypeIcon({ type }: { type?: string }) {
  const Icon = type ? (ISSUE_TYPE_ICONS[type] ?? Circle) : Circle;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function AssigneeAvatar({ name }: { name?: string }) {
  if (!name) return null;
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground"
      title={name}
    >
      {initials}
    </span>
  );
}

interface ProjectIssuesTabProps {
  projectId: string;
  project: ProjectWithStats;
}

export function ProjectIssuesTab({ projectId, project }: ProjectIssuesTabProps) {
  const [connectJiraOpen, setConnectJiraOpen] = useState(false);
  const [connectLinearOpen, setConnectLinearOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const linkedProvider = project.linearProjectId ? "linear" : project.jiraProjectKey ? "jira" : null;
  const isLinked = !!linkedProvider;

  const { data: issuesResponse, isLoading } = useProjectIssues(
    projectId,
    isLinked
      ? {
          status_category: statusFilter || undefined,
          type: typeFilter || undefined,
          page,
        }
      : undefined
  );

  const allIssues = useMemo(() => issuesResponse?.data ?? [], [issuesResponse]);
  const meta = issuesResponse?.meta;
  // The assignee filter is client-side, so it can only see the current page.
  // On multi-page results it would filter/count inconsistently, so we hide it
  // and show the full page instead. Cross-page assignee filtering is tracked
  // as a separate backend follow-up.
  const isPaginated = !!meta && meta.total_pages > 1;

  // Projects linked before issues_synced_at existed have it as null even though issues
  // are already loaded — only treat as syncing when there's genuinely nothing loaded yet.
  // allIssues is server-filtered by statusFilter/typeFilter, so an active filter matching
  // zero issues must not be mistaken for "nothing synced yet".
  const isSyncing = isLinked && !project.issuesSyncedAt && !statusFilter && !typeFilter && allIssues.length === 0;

  // Poll project until issuesSyncedAt is set — deduped with the parent's useProject call.
  useProject(projectId, { refetchInterval: isSyncing ? 5000 : false });

  // The issues query is fetched (empty) while the sync job is still running, so once
  // isSyncing flips false the cached list is stale — refetch it to show the synced issues.
  const queryClient = useQueryClient();
  const wasSyncingRef = useRef(isSyncing);
  useEffect(() => {
    if (wasSyncingRef.current && !isSyncing) {
      queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
    }
    wasSyncingRef.current = isSyncing;
  }, [isSyncing, projectId, queryClient]);

  const syncIssues = useSyncProjectIssues(projectId);
  const linkedProjectLabel = project.linearProjectName || project.jiraProjectKey || undefined;

  const uniqueAssignees = useMemo(
    () =>
      Array.from(
        new Set(allIssues.map((i) => i.assigneeName).filter(Boolean) as string[])
      ).sort(),
    [allIssues]
  );

  const issues = assigneeFilter && !isPaginated
    ? allIssues.filter((i) => i.assigneeName === assigneeFilter)
    : allIssues;

  return (
    <>
      {!isLinked ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-muted-foreground" />
              <CardTitle className="text-base">Project Issues</CardTitle>
            </div>
            <CardDescription>
              Connect a Jira or Linear project to track issues alongside your AI tool usage.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => setConnectJiraOpen(true)}>Connect Jira Project</Button>
            <Button variant="outline" onClick={() => setConnectLinearOpen(true)}>Connect Linear Project</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="size-5 text-muted-foreground" />
                <CardTitle className="text-base">
                  {linkedProvider === "linear" ? "Linear Issues" : "Jira Issues"}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {linkedProjectLabel}
                  </span>
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={syncIssues.isPending}
                  onClick={() => syncIssues.mutate()}
                >
                  <RefreshCw className={`mr-1.5 size-3.5 ${syncIssues.isPending ? "animate-spin" : ""}`} />
                  Sync
                </Button>
                {linkedProvider === "linear" ? (
                  <Button variant="outline" size="sm" onClick={() => setConnectLinearOpen(true)}>
                    Change project
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setConnectJiraOpen(true)}>
                    Change project
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 px-6 pb-3">
            <Select
              value={statusFilter || "__all__"}
              onValueChange={(v) => {
                setStatusFilter(v === "__all__" ? "" : v);
                setAssigneeFilter("");
                setPage(1);
              }}
            >
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

            <Select
              value={typeFilter || "__all__"}
              onValueChange={(v) => {
                setTypeFilter(v === "__all__" ? "" : v);
                setAssigneeFilter("");
                setPage(1);
              }}
            >
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

            {!isPaginated && (
              <Select
                value={assigneeFilter || "__all__"}
                onValueChange={(v) => setAssigneeFilter(v === "__all__" ? "" : v)}
                disabled={uniqueAssignees.length === 0}
              >
                <SelectTrigger className="h-8 w-[160px] text-sm">
                  <SelectValue placeholder="All assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All assignees</SelectItem>
                  {uniqueAssignees.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            ) : isSyncing ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-6">
                Syncing issues… This may take a moment. The list will update automatically.
              </p>
            ) : issues.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-6">
                No issues found{statusFilter || typeFilter || assigneeFilter ? " matching the selected filters" : ""}.
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
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <AssigneeAvatar name={issue.assigneeName} />
                          <p className="text-xs text-muted-foreground">{issue.assigneeName}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {issue.issueType && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <IssueTypeIcon type={issue.issueType} />
                          {issue.issueType}
                        </span>
                      )}
                      {issue.statusCategory && (
                        <Badge
                          variant={STATUS_CATEGORY_VARIANTS[issue.statusCategory] ?? "outline"}
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

          {!isLoading && !isSyncing && meta && meta.total_pages > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-3">
              <p className="text-sm text-muted-foreground">
                Page {meta.current_page} of {meta.total_pages} ({meta.total_count} issues)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= meta.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <ConnectJiraSheet
        projectId={projectId}
        open={connectJiraOpen}
        onOpenChange={setConnectJiraOpen}
        onSuccess={() => setConnectJiraOpen(false)}
      />
      <ConnectLinearSheet
        projectId={projectId}
        open={connectLinearOpen}
        onOpenChange={setConnectLinearOpen}
        onSuccess={() => setConnectLinearOpen(false)}
      />
    </>
  );
}
