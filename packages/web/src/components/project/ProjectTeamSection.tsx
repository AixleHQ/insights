import { useState } from "react";
import { Link } from "react-router-dom";
import { Users, GitCommitHorizontal, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDistanceToNow, getMemberDisplayName } from "@/lib/utils";
import type { ProjectMember, MemberCommitStat } from "@/hooks/useApi";
import {
  useAddProjectMember as useAddMember,
  useUpdateProjectMember as useUpdateMember,
  useRemoveProjectMember as useRemoveMember,
  useOrganizationMembers,
} from "@/hooks/useApi";
import type { OrganizationMember } from "@/lib/types";

interface ProjectTeamSectionProps {
  members: ProjectMember[] | undefined;
  isLoading?: boolean;
  className?: string;
  commitStats?: MemberCommitStat[];
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

const roleColors: Record<string, string> = {
  owner: "bg-violet-500/10 text-violet-400",
  member: "bg-blue-500/10 text-blue-400",
  viewer: "bg-slate-500/10 text-slate-400",
};

const ROLES = ["owner", "member", "viewer"] as const;

function AddProjectMemberForm({
  projectId,
  orgId,
  existingUserIds,
}: {
  projectId: string;
  orgId: string;
  existingUserIds: Set<string>;
}) {
  const { data: orgMembers = [] } = useOrganizationMembers(orgId);
  const addMember = useAddMember(projectId);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("member");

  const available = orgMembers.filter((m: OrganizationMember) => {
    const uid = m.userId ?? m.user_id;
    return uid && !existingUserIds.has(uid);
  });

  const handleAdd = () => {
    if (!selectedUserId) return;
    addMember.mutate(
      { user_id: selectedUserId, role: selectedRole },
      {
        onSuccess: () => {
          setSelectedUserId("");
          setSelectedRole("member");
        },
      }
    );
  };

  if (available.length === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
      <Select value={selectedUserId} onValueChange={setSelectedUserId}>
        <SelectTrigger className="h-8 w-48 text-sm">
          <SelectValue placeholder="Add org member…" />
        </SelectTrigger>
        <SelectContent>
          {available.map((m: OrganizationMember) => {
            const uid = (m.userId ?? m.user_id)!;
            const label = m.user?.name || m.user?.email || uid;
            return (
              <SelectItem key={uid} value={uid}>
                {label}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Select value={selectedRole} onValueChange={setSelectedRole}>
        <SelectTrigger className="h-8 w-28 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="secondary"
        disabled={!selectedUserId || addMember.isPending}
        onClick={handleAdd}
        className="h-8"
      >
        <UserPlus className="mr-1.5 size-3.5" />
        Add
      </Button>
    </div>
  );
}

export function ProjectTeamSection({
  members,
  isLoading,
  className,
  commitStats,
  projectId,
  orgId,
  canManage,
}: ProjectTeamSectionProps) {
  const commitsByUserId = new Map(commitStats?.map((s) => [s.userId, s]) ?? []);
  const updateMember = useUpdateMember(projectId ?? "");
  const removeMember = useRemoveMember(projectId ?? "");

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Team</CardTitle>
          </div>
          <CardDescription>Loading team members…</CardDescription>
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
  const existingUserIds = new Set(members?.map((m) => m.userId) ?? []);

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
          canManage ? (
            <div className="space-y-2">
              {members?.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <Avatar className="size-8 shrink-0">
                    {member.avatarUrl && (
                      <AvatarImage src={member.avatarUrl} alt={member.name || member.email} />
                    )}
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(member.name, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {getMemberDisplayName(member)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <Select
                    value={member.role}
                    onValueChange={(role) =>
                      updateMember.mutate({ id: member.id, role })
                    }
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMember.mutate(member.id)}
                    disabled={removeMember.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              {projectId && orgId && (
                <AddProjectMemberForm
                  projectId={projectId}
                  orgId={orgId}
                  existingUserIds={existingUserIds}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {members?.map((member) => {
                const stats = commitsByUserId.get(member.userId);
                return (
                  <Link
                    key={member.id}
                    to={projectId ? `/members/${member.userId}?projectId=${projectId}` : `/members/${member.userId}`}
                    className="group flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-muted/50"
                  >
                    <Avatar className="size-8">
                      {member.avatarUrl && (
                        <AvatarImage src={member.avatarUrl} alt={member.name || member.email} />
                      )}
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
          )
        ) : canManage && projectId && orgId ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">No team members assigned to this project</p>
            <AddProjectMemberForm
              projectId={projectId}
              orgId={orgId}
              existingUserIds={existingUserIds}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No team members assigned to this project</p>
        )}
      </CardContent>
    </Card>
  );
}
