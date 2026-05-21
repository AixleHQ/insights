import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleBadge } from "@/components/ui/role-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useProjectMembers,
  useProjectMemberStats,
  useAddProjectMember,
  useRemoveProjectMember,
  useOrganizationMembers,
} from "@/hooks/useApi";
import { formatCount, formatCost, formatTokens } from "@/lib/formatters";
import { formatDistanceToNow, getMemberDisplayName, humanizeToolName } from "@/lib/utils";
import type { OrganizationMember } from "@/lib/types";

const ROLES = ["member", "owner", "viewer"];

interface ProjectMembersTabProps {
  projectId: string;
  orgId: string;
  isProjectOwner: boolean;
  canManageMembers: boolean;
}

export function ProjectMembersTab({
  projectId,
  orgId,
  isProjectOwner,
  canManageMembers,
}: ProjectMembersTabProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState("member");

  const { data: members = [] } = useProjectMembers(projectId);
  const { data: stats } = useProjectMemberStats(projectId, 30, isProjectOwner);
  const { data: orgMembers = [] } = useOrganizationMembers(orgId, {
    enabled: canManageMembers,
  });
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);

  const statsById = useMemo(
    () => new Map(stats?.map((s) => [s.userId, s]) ?? []),
    [stats]
  );

  const existingUserIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members]
  );

  const availableToAdd = useMemo(
    () =>
      (orgMembers as OrganizationMember[]).filter((m) => {
        const uid = m.userId ?? m.user_id;
        return uid && !existingUserIds.has(uid);
      }),
    [orgMembers, existingUserIds]
  );

  const filtered = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [members, search]);

  const handleAddMember = () => {
    if (!addUserId) return;
    addMember.mutate(
      { user_id: addUserId, role: addRole },
      {
        onSuccess: () => {
          setAddUserId("");
          setAddRole("member");
          setShowAddForm(false);
        },
      }
    );
  };

  if (!isProjectOwner) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No members found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((m) => (
              <TableRow
                key={m.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate(`/members/${m.userId}?projectId=${projectId}`)
                }
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarImage src={m.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {getMemberDisplayName(m).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {getMemberDisplayName(m)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {m.email}
                </TableCell>
                <TableCell>
                  <RoleBadge role={m.role as "owner" | "member" | "viewer"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search members…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {canManageMembers && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <UserPlus className="mr-1.5 size-4" />
            Add Member
          </Button>
        )}
      </div>

      {showAddForm && availableToAdd.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <Select value={addUserId} onValueChange={setAddUserId}>
            <SelectTrigger className="h-8 w-52 text-sm">
              <SelectValue placeholder="Select org member…" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((m) => {
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
          <Select value={addRole} onValueChange={setAddRole}>
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
            disabled={!addUserId || addMember.isPending}
            onClick={handleAddMember}
          >
            Add
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Seat Type</TableHead>
              <TableHead className="text-right">Tokens In</TableHead>
              <TableHead className="text-right">Tokens Out</TableHead>
              <TableHead className="text-right">Events</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Last Active</TableHead>
              {canManageMembers && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canManageMembers ? 8 : 7}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No members found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((m) => {
              const stat = statsById.get(m.userId);
              return (
                <TableRow
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/members/${m.userId}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarImage src={m.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {getMemberDisplayName(m).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {getMemberDisplayName(m)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {stat?.primaryTool
                      ? humanizeToolName(stat.primaryTool)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {stat ? formatTokens(stat.inputTokens) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {stat ? formatTokens(stat.outputTokens) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {stat ? formatCount(stat.eventCount) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {stat ? formatCost(stat.costUsd) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {stat?.lastEventAt
                      ? formatDistanceToNow(stat.lastEventAt)
                      : "Never"}
                  </TableCell>
                  {canManageMembers && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeMember.mutate(m.id);
                            }}
                          >
                            Remove from project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
