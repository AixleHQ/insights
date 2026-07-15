import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { RoleBadge } from "@/components/ui/role-badge";
import type { MemberRole } from "@/contexts/OrgContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useUpdateProjectMember,
  useOrganizationMembers,
  type ProjectMember,
} from "@/hooks/useApi";
import { formatCount, formatCost, formatTokens } from "@/lib/formatters";
import {
  formatDistanceToNow,
  getMemberDisplayName,
  organizationMemberUserId,
} from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { AppRoutes } from "@/lib/routes";
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
  const [addError, setAddError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const { data: members = [] } = useProjectMembers(projectId);
  const { data: stats } = useProjectMemberStats(projectId, 30, isProjectOwner);
  const { data: orgMembers = [] } = useOrganizationMembers(orgId, {
    enabled: canManageMembers,
  });
  const addMember = useAddProjectMember(projectId, orgId);
  const removeMember = useRemoveProjectMember(projectId, orgId);
  const updateMember = useUpdateProjectMember(projectId);

  const statsById = useMemo(
    () => new Map(stats?.map((s) => [s.userId, s]) ?? []),
    [stats]
  );

  const existingUserIds = useMemo(
    () => new Set(members.map((m: ProjectMember) => m.userId)),
    [members]
  );

  const availableToAdd = useMemo(
    () =>
      (orgMembers as OrganizationMember[]).filter((m) => {
        const uid = organizationMemberUserId(m);
        return uid && !existingUserIds.has(uid);
      }),
    [orgMembers, existingUserIds]
  );

  const filtered = useMemo(() => {
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter(
      (m: ProjectMember) =>
        m.name?.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    );
  }, [members, search]);

  const handleAddMember = () => {
    if (!addUserId) return;
    setAddError(null);
    addMember.mutate(
      { user_id: addUserId, role: addRole },
      {
        onSuccess: () => {
          setAddUserId("");
          setAddRole("member");
          setShowAddForm(false);
          setAddError(null);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.status === 422 && err.data) {
            const data = err.data as { errors?: Record<string, string[]>; message?: string };
            const messages = data.errors
              ? Object.values(data.errors).flat()
              : data.message
                ? [data.message]
                : [];
            setAddError(messages.join(" ") || "Could not add member.");
          } else {
            setAddError(err instanceof Error ? err.message : "Could not add member.");
          }
        },
      }
    );
  };

  const handleRemoveMember = (memberId: string) => {
    setRemoveError(null);
    removeMember.mutate(memberId, {
      onError: (err) => {
        if (err instanceof ApiError && err.status === 422 && err.data) {
          const data = err.data as { errors?: Record<string, string[]>; message?: string };
          const messages = data.errors
            ? Object.values(data.errors).flat()
            : data.message
              ? [data.message]
              : [];
          setRemoveError(messages.join(" ") || "Could not remove member.");
        } else {
          setRemoveError(err instanceof Error ? err.message : "Could not remove member.");
        }
      },
    });
  };

  if (!isProjectOwner) {
    return (
      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/50">
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Name</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Email</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Type</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center type-caption text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((m: ProjectMember) => (
            <TableRow
              key={m.id}
              className="group cursor-pointer border-b border-border/30 hover:bg-muted/30 transition-colors"
              onClick={() => navigate(`${AppRoutes.members.detail(m.userId)}?projectId=${projectId}`)}
            >
              <TableCell>
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-7 shrink-0">
                    <AvatarImage src={m.avatarUrl ?? undefined} />
                    <AvatarFallback className="type-caption">
                      {getMemberDisplayName(m).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="type-label font-medium text-foreground">
                    {getMemberDisplayName(m)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <span className="type-caption text-muted-foreground">{m.email}</span>
              </TableCell>
              <TableCell>
                <RoleBadge role={m.role as MemberRole} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => navigate(`${AppRoutes.members.detail(m.userId)}?projectId=${projectId}`)}
                    >
                      View profile
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Input
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 type-caption text-muted-foreground pointer-events-none hidden sm:inline">
            ⌘K
          </kbd>
        </div>
        {canManageMembers && (
          <Button
            size="sm"
            onClick={() => {
              setShowAddForm((v) => !v);
              setAddError(null);
            }}
          >
            <UserPlus className="mr-1.5 size-4" />
            Add Member
          </Button>
        )}
      </div>

      {showAddForm && canManageMembers && (
        <div className="space-y-2 rounded-lg border p-3">
          {availableToAdd.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All organization members are already on this project, or no org members are available.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={addUserId} onValueChange={setAddUserId}>
                <SelectTrigger className="h-8 w-52 text-sm">
                  <SelectValue placeholder="Select org member…" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((m) => {
                    const uid = organizationMemberUserId(m)!;
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
          {addError && (
            <p className="text-sm text-destructive" role="alert">
              {addError}
            </p>
          )}
        </div>
      )}

      {removeError && (
        <p className="text-sm text-destructive" role="alert">
          {removeError}
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow className="border-b border-border/50">
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Name</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Seat Type</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Tokens In / Out</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground text-right">Events</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground text-right">Cost</TableHead>
            <TableHead className="type-caption font-medium uppercase tracking-wider text-muted-foreground">Last Active</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center type-caption text-muted-foreground">
                No members found.
              </TableCell>
            </TableRow>
          )}
          {filtered.map((m: ProjectMember) => {
            const stat = statsById.get(m.userId);
            return (
              <TableRow
                key={m.id}
                className="group cursor-pointer border-b border-border/30 hover:bg-muted/30 transition-colors"
                onClick={() => navigate(`${AppRoutes.members.detail(m.userId)}?projectId=${projectId}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-7 shrink-0">
                      <AvatarImage src={m.avatarUrl ?? undefined} />
                      <AvatarFallback className="type-caption">
                        {getMemberDisplayName(m).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="type-label font-medium text-foreground">
                      {getMemberDisplayName(m)}
                    </span>
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {canManageMembers ? (
                    <Select
                      value={m.role}
                      onValueChange={(role) => updateMember.mutate({ id: m.id, role })}
                    >
                      <SelectTrigger className="h-7 w-24 type-caption">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="type-caption">{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="type-caption text-muted-foreground capitalize">{m.role}</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="font-mono-display type-caption tabular-nums text-muted-foreground">
                    {stat ? `${formatTokens(stat.inputTokens)} / ${formatTokens(stat.outputTokens)}` : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono-display type-caption tabular-nums">
                    {stat ? formatCount(stat.eventCount) : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-mono-display type-label font-semibold tabular-nums text-foreground">
                    {stat ? formatCost(stat.costUsd) : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="type-caption text-muted-foreground">
                    {stat?.lastEventAt ? formatDistanceToNow(stat.lastEventAt) : "—"}
                  </span>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canManageMembers && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleRemoveMember(m.id)}
                        >
                          Remove from project
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
