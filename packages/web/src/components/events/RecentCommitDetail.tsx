import type { ComponentType, ReactNode } from "react";
import { GitBranch, GitCommit, Percent, FolderGit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAiPercentage,
  formatCommitHashShort,
  type RecentCommitFields,
} from "@/lib/recentCommitEvent";

interface RecentCommitDetailProps {
  commit: RecentCommitFields;
  className?: string;
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-sm font-medium break-all">{value}</div>
      </div>
    </div>
  );
}

export function RecentCommitDetail({ commit, className }: RecentCommitDetailProps) {
  return (
    <div
      className={cn("rounded-lg border border-border bg-muted/30 p-4 space-y-4", className)}
      data-testid="recent-commit-detail"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">Commit attribution</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          From Cursor local recentCommit snapshot
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          icon={GitCommit}
          label="Commit"
          value={
            <span className="font-mono-display text-xs" title={commit.commitHash}>
              {formatCommitHashShort(commit.commitHash)}
            </span>
          }
        />
        {commit.branchName && (
          <Field icon={GitBranch} label="Branch" value={commit.branchName} />
        )}
        {commit.aiPercentage !== undefined && (
          <Field
            icon={Percent}
            label="AI contribution"
            value={formatAiPercentage(commit.aiPercentage)}
          />
        )}
        {commit.repoName && (
          <Field icon={FolderGit2} label="Repository" value={commit.repoName} />
        )}
      </div>
      {commit.commitMessage && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3 line-clamp-2">
          {commit.commitMessage}
        </p>
      )}
    </div>
  );
}
