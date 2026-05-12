import { Link } from "react-router-dom";
import { Users, GitCommitHorizontal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDistanceToNow, getMemberDisplayName } from "@/lib/utils";
import type { ProjectMember, MemberCommitStat } from "@/hooks/useApi";

interface ProjectTeamSectionProps {
  members: ProjectMember[] | undefined;
  isLoading?: boolean;
  className?: string;
  commitStats?: MemberCommitStat[];
  projectId?: string;
}

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.slice(0, 2).toUpperCase() || "U";
}

const roleColors: Record<string, string> = {
  owner: "bg-violet-500/10 text-violet-400",
  member: "bg-blue-500/10 text-blue-400",
  viewer: "bg-slate-500/10 text-slate-400",
};

export function ProjectTeamSection({ members, isLoading, className, commitStats, projectId }: ProjectTeamSectionProps) {
  const commitsByUserId = new Map(commitStats?.map((s) => [s.userId, s]) ?? []);
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Team</CardTitle>
          </div>
          <CardDescription>Loading team members...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="size-10 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const memberCount = members?.length || 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Team</CardTitle>
        </div>
        <CardDescription>
          {memberCount} {memberCount === 1 ? "member" : "members"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {memberCount > 0 ? (
          <div className="flex flex-wrap gap-3">
            {members?.map((member) => {
              const stats = commitsByUserId.get(member.userId);
              return (
                <Link
                  key={member.id}
                  to={projectId ? `/team/${member.userId}?projectId=${projectId}` : `/team/${member.userId}`}
                  className="group flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                >
                  <Avatar className="size-8">
                    {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={member.name || member.email} />}
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(member.name, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:underline">
                      {getMemberDisplayName(member)}
                    </p>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", roleColors[member.role])}>
                      {member.role}
                    </Badge>
                  </div>
                  {stats && (
                    <div className="flex flex-col items-end shrink-0 text-muted-foreground">
                      <span className="flex items-center gap-1 text-xs font-medium">
                        <GitCommitHorizontal className="size-3" />
                        {stats.commitCount}
                      </span>
                      {stats.lastCommitAt && (
                        <span className="text-[10px]">{formatDistanceToNow(stats.lastCommitAt)}</span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No team members assigned to this project</p>
        )}
      </CardContent>
    </Card>
  );
}
