import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { AppRoutes } from "@/lib/routes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMemberDisplayName } from "@/lib/utils";
import { formatCost, formatCount } from "@/lib/formatters";
import type { ProjectMember } from "@/hooks/useApi";

interface ProjectTeamSectionProps {
  members: ProjectMember[] | undefined;
  isLoading?: boolean;
  className?: string;
  projectId?: string;
  orgId?: string;
  canManage?: boolean;
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

export function ProjectTeamSection({
  members,
  isLoading,
  className,
  projectId,
}: ProjectTeamSectionProps) {
  const ranked = useMemo(
    () =>
      [...(members ?? [])]
        .sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
        .slice(0, 3),
    [members]
  );

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Leaderboard</CardTitle>
          </div>
          <CardDescription>Top contributors by spend</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">Leaderboard</CardTitle>
        </div>
        <CardDescription>Top contributors by spend</CardDescription>
      </CardHeader>
      <CardContent>
        {ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="space-y-1">
            {ranked.map((member, i) => (
                <Link
                  key={member.id}
                  to={
                    projectId
                      ? `${AppRoutes.members.detail(member.userId)}?projectId=${projectId}`
                      : AppRoutes.members.detail(member.userId)
                  }
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <span className="w-4 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <Avatar className="size-7 shrink-0">
                    {member.avatarUrl && (
                      <AvatarImage src={member.avatarUrl} alt={member.name ?? member.email} />
                    )}
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(member.name, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {getMemberDisplayName(member)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium tabular-nums">
                      {formatCost(member.totalCost ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCount(member.totalEvents ?? 0)} events
                    </p>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
