import { useState, useMemo } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  UserPlus,
  Search,
  Users,
  LogOut,
  AlertTriangle,
  Mail,
  Clock,
  X,
  ChevronDown,
} from "lucide-react";
import { useOrg, type MemberRole } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useOrganizationMembers,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
  useInvitations,
  useRevokeInvitation,
  useNotificationRoutes,
  useCreateNotificationRoute,
  useUpdateNotificationRoute,
  useDeleteNotificationRoute,
} from "@/hooks/useApi";
import type { Invitation, NotificationRoute, OrganizationMember } from "@/lib/types";
import { formatCost, formatCount } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SortButton, type SortDirection } from "@/components/ui/sort-button";
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
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MemberRowSkeleton } from "@/components/ui/skeletons";
import { RoleBadge } from "@/components/ui/role-badge";
import { CliStatusBadge } from "@/components/ui/CliStatusBadge";
import { OrgPolicyPanel } from "@/components/org/OrgPolicyPanel";

type MemberSortField = "name" | "role" | "last_active_at" | "total_events" | "total_cost";

type MemberData = {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role: MemberRole;
  joined_at?: string;
  last_active_at?: string;
  total_tokens?: number;
  total_events?: number;
  total_cost?: number;
  cli_connected?: boolean;
};

const roleOrder: Record<MemberRole, number> = {
  owner: 3,
  member: 2,
  viewer: 1,
};

function getInitials(name?: string | null, email?: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email?.slice(0, 2).toUpperCase() || "U";
}

function formatLastActive(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function Members() {
  const navigate = useNavigate();
  const { currentOrg, currentMembership, currentRole, organizations, setCurrentOrg, refreshOrganizations } = useOrg();
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<MemberRole | "all">("all");
  const [sortField, setSortField] = useState<MemberSortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { data: membersData, isLoading } = useOrganizationMembers(currentOrg?.id || "");
  const { data: invitationsData } = useInvitations(currentOrg?.id || "", "pending");
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrganization = useLeaveOrganization();
  const revokeInvitation = useRevokeInvitation();

  const members: MemberData[] = useMemo(() => {
    return membersData?.map((m) => ({
      id: m.id,
      email: m.user.email,
      name: m.user.name || undefined,
      avatar_url: m.user.avatarUrl ?? undefined,
      role: m.role as MemberRole,
      joined_at: m.createdAt,
      last_active_at: m.last_active_at || undefined,
      total_tokens: m.total_tokens,
      total_events: m.total_events,
      total_cost: m.total_cost,
      cli_connected: m.cli_connected,
    })) ?? [];
  }, [membersData]);

  const filteredMembers = useMemo(() => {
    const result = members.filter((m) => {
      const matchesSearch =
        m.email.toLowerCase().includes(search.toLowerCase()) ||
        m.name?.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || m.role === roleFilter;
      return matchesSearch && matchesRole;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = (a.name || a.email).localeCompare(b.name || b.email);
          break;
        case "role":
          comparison = (roleOrder[a.role] || 0) - (roleOrder[b.role] || 0);
          break;
        case "last_active_at":
          comparison =
            new Date(a.last_active_at || 0).getTime() -
            new Date(b.last_active_at || 0).getTime();
          break;
        case "total_events":
          comparison = (a.total_events || 0) - (b.total_events || 0);
          break;
        case "total_cost":
          comparison = (a.total_cost || 0) - (b.total_cost || 0);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [members, search, roleFilter, sortField, sortDirection]);

  const activeCount = members.length;
  const ownerCount = useMemo(() => members.filter((m) => m.role === "owner").length, [members]);
  const pendingInvitations = invitationsData || [];
  const pendingCount = pendingInvitations.length;

  // Owner-only guard — after all hooks
  if (currentRole !== "owner") {
    return <Navigate to="/profile" replace />;
  }

  const handleRoleChange = async (id: string, newRole: MemberRole) => {
    if (!currentOrg) return;
    try {
      await updateMemberRole.mutateAsync({ orgId: currentOrg.id, memberId: id, role: newRole });
    } catch (error) {
      console.error("Failed to change role:", error);
    }
  };

  const handleRemove = async (id: string) => {
    if (!currentOrg) return;
    try {
      await removeMember.mutateAsync({ orgId: currentOrg.id, memberId: id });
    } catch (error) {
      console.error("Failed to remove member:", error);
    }
  };

  const handleSort = (field: MemberSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!currentOrg) return;
    try {
      await revokeInvitation.mutateAsync({ orgId: currentOrg.id, invitationId });
    } catch (error) {
      console.error("Failed to revoke invitation:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="type-h2">Members</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} active member{activeCount !== 1 && "s"}
            {pendingCount > 0 && `, ${pendingCount} pending`}
          </p>
        </div>
        <Button asChild>
          <Link to="/members/invite">
            <UserPlus className="mr-2 size-4" />
            Add Member
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as MemberRole | "all")}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Seat Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Seat Types</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Pending Invitations */}
      {pendingCount > 0 && (
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="size-4 text-warning" />
            <h3 className="type-label">
              Pending Invitations ({pendingCount})
            </h3>
          </div>
          <div className="grid gap-2">
            {pendingInvitations.map((invitation) => (
              <PendingInvitationRow
                key={invitation.id}
                invitation={invitation}
                onRevoke={handleRevokeInvitation}
                isRevoking={revokeInvitation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px] sm:w-[280px]">
                <SortButton field="name" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Name
                </SortButton>
              </TableHead>
              <TableHead className="w-[110px]">
                <SortButton field="role" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Seat Type
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[120px]">CLI</TableHead>
              <TableHead className="hidden md:table-cell w-[120px]">
                <SortButton field="last_active_at" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Last Active
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[90px]">
                <SortButton field="total_events" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Events
                </SortButton>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[100px]">
                <SortButton field="total_cost" currentField={sortField} currentDirection={sortDirection} onSort={handleSort}>
                  Cost
                </SortButton>
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <MemberRowSkeleton key={i} />)
            ) : filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {search || roleFilter !== "all" ? "No members found" : "No team members yet"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <MemberTableRow
                  key={member.id}
                  member={member}
                  currentUserEmail={profile?.email}
                  currentUserRole={currentMembership?.role}
                  ownerCount={ownerCount}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemove}
                  isRemoving={removeMember.isPending}
                  onRowClick={() => navigate(`/members/${member.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {currentOrg && <OrgPolicyPanel orgId={currentOrg.id} />}

      {currentOrg && <NotificationRoutesPanel orgId={currentOrg.id} members={membersData ?? []} />}

      <LeaveOrganizationSection
        currentOrg={currentOrg}
        currentMembership={currentMembership}
        members={members}
        organizations={organizations}
        currentUserEmail={profile?.email}
        onLeave={async (membershipId: string) => {
          if (!currentOrg) return;
          await leaveOrganization.mutateAsync({ orgId: currentOrg.id, memberId: membershipId });
          await refreshOrganizations();
          const remaining = organizations.filter((o) => o.id !== currentOrg.id);
          if (remaining.length > 0) {
            setCurrentOrg(remaining[0]);
          } else {
            navigate("/");
          }
        }}
        isLeaving={leaveOrganization.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MemberTableRow
// ---------------------------------------------------------------------------

interface MemberTableRowProps {
  member: MemberData;
  currentUserEmail?: string;
  currentUserRole?: MemberRole;
  ownerCount: number;
  onRoleChange: (id: string, role: MemberRole) => void;
  onRemove: (id: string) => void;
  isRemoving: boolean;
  onRowClick: () => void;
}

function MemberTableRow({
  member,
  currentUserEmail,
  currentUserRole,
  ownerCount,
  onRoleChange,
  onRemove,
  isRemoving,
  onRowClick,
}: MemberTableRowProps) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const isCurrentUserOwner = currentUserRole === "owner";
  const isSelf = !!currentUserEmail && member.email === currentUserEmail;
  const isLastOwner = member.role === "owner" && ownerCount === 1;
  const canManage = isCurrentUserOwner && !isSelf && !isLastOwner;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={onRowClick}
      >
        <TableCell className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-8 shrink-0">
              {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name || member.email} />}
              <AvatarFallback className="text-xs bg-muted">
                {getInitials(member.name, member.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate type-label">{member.name || member.email.split("@")[0]}</p>
              <p className="truncate type-caption text-muted-foreground">{member.email}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="p-4">
          <RoleBadge role={member.role} />
        </TableCell>
        <TableCell className="hidden sm:table-cell p-4">
          <CliStatusBadge connected={member.cli_connected} />
        </TableCell>
        <TableCell className="hidden md:table-cell p-4 text-sm text-muted-foreground">
          {formatLastActive(member.last_active_at)}
        </TableCell>
        <TableCell className="hidden sm:table-cell p-4 text-sm">
          {formatCount(member.total_events ?? 0)}
        </TableCell>
        <TableCell className="hidden sm:table-cell p-4 text-sm">
          {formatCost(member.total_cost ?? 0)}
        </TableCell>
        <TableCell className="p-4" onClick={(e) => e.stopPropagation()}>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <ChevronDown className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {member.role === "owner" && (
                  <>
                    <DropdownMenuItem onClick={() => onRoleChange(member.id, "member")}>
                      Change to Member
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRoleChange(member.id, "viewer")}>
                      Change to Viewer
                    </DropdownMenuItem>
                  </>
                )}
                {member.role === "member" && (
                  <>
                    <DropdownMenuItem onClick={() => onRoleChange(member.id, "owner")}>
                      Promote to Owner
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRoleChange(member.id, "viewer")}>
                      Change to Viewer
                    </DropdownMenuItem>
                  </>
                )}
                {member.role === "viewer" && (
                  <>
                    <DropdownMenuItem onClick={() => onRoleChange(member.id, "member")}>
                      Change to Member
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRoleChange(member.id, "owner")}>
                      Promote to Owner
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setRemoveOpen(true)}
                >
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      </TableRow>

      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.name || member.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove them from the organization. They will lose access to all
              projects, events, and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onRemove(member.id)}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// PendingInvitationRow
// ---------------------------------------------------------------------------

interface PendingInvitationRowProps {
  invitation: Invitation;
  onRevoke: (id: string) => void;
  isRevoking: boolean;
}

function PendingInvitationRow({ invitation, onRevoke, isRevoking }: PendingInvitationRowProps) {
  const now = new Date();
  const expiresAt = new Date(invitation.expiresAt);
  const isExpired = expiresAt < now;
  const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="flex items-center justify-between gap-4 rounded-md bg-background p-3 border">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
          <Mail className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate type-label">{invitation.email}</p>
          <div className="flex items-center gap-2 type-caption text-muted-foreground">
            <span className="capitalize">{invitation.role}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {isExpired ? (
                <span className="text-destructive">Expired</span>
              ) : (
                <span>Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? "s" : ""}</span>
              )}
            </span>
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRevoke(invitation.id)}
        disabled={isRevoking}
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="size-4" />
        <span className="sr-only">Revoke invitation</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeaveOrganizationSection
// ---------------------------------------------------------------------------

interface LeaveOrganizationSectionProps {
  currentOrg: { id: string; name: string } | null;
  currentMembership: { role: MemberRole; organization: { id: string } } | null;
  members: MemberData[];
  organizations: { id: string }[];
  currentUserEmail?: string;
  onLeave: (membershipId: string) => Promise<void>;
  isLeaving: boolean;
}

function LeaveOrganizationSection({
  currentOrg,
  currentMembership,
  members,
  organizations,
  currentUserEmail,
  onLeave,
  isLeaving,
}: LeaveOrganizationSectionProps) {
  if (!currentOrg || !currentMembership) return null;

  const currentUserMember = members.find((m) => m.email === currentUserEmail);
  const owners = members.filter((m) => m.role === "owner");
  const isSoleOwner = currentMembership.role === "owner" && owners.length === 1;

  if (isSoleOwner) {
    return (
      <Alert variant="default" className="mt-8">
        <AlertTriangle className="size-4" />
        <AlertTitle>You are the sole owner</AlertTitle>
        <AlertDescription>
          You cannot leave this organization because you are the only owner.
          Transfer ownership to another member first, or delete the organization in Settings.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mt-8 rounded-lg border border-destructive/20 bg-destructive/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-destructive">Leave Organization</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Remove yourself from <span className="font-medium">{currentOrg.name}</span>.
            {organizations.length > 1
              ? " You will be switched to another organization."
              : " You will need to create or join another organization."}
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isLeaving || !currentUserMember}>
              <LogOut className="mr-2 size-4" />
              {isLeaving ? "Leaving..." : "Leave"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {currentOrg.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                You will lose access to all projects, events, and data in this organization.
                This action cannot be undone. You will need to be invited again to rejoin.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => currentUserMember && onLeave(currentUserMember.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Leave Organization
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

const NOTIFICATION_TYPE_LABELS: Record<NotificationRoute["notificationType"], string> = {
  cost_alert: "Cost Alert",
  token_alert: "Token Alert",
  retention_warning: "Retention Warning",
  risk_alert: "Risk Alert",
};

function NotificationRoutesPanel({
  orgId,
  members,
}: {
  orgId: string;
  members: OrganizationMember[];
}) {
  const { data: routes = [] } = useNotificationRoutes(orgId);
  const createRoute = useCreateNotificationRoute(orgId);
  const updateRoute = useUpdateNotificationRoute(orgId);
  const deleteRoute = useDeleteNotificationRoute(orgId);

  const [newType, setNewType] = useState<NotificationRoute["notificationType"]>("cost_alert");
  const [newRecipientType, setNewRecipientType] = useState<"role" | "user">("role");
  const [newRole, setNewRole] = useState<MemberRole>("owner");
  const [newUserId, setNewUserId] = useState<string>("");

  function handleAdd() {
    createRoute.mutate({
      notification_type: newType,
      recipient_type: newRecipientType,
      recipient_role: newRecipientType === "role" ? newRole : null,
      recipient_user_id: newRecipientType === "user" ? newUserId || null : null,
      enabled: true,
    });
    setNewUserId("");
  }

  const recipientLabel = (route: NotificationRoute) => {
    if (route.recipientType === "role") return `All ${route.recipientRole}s`;
    const member = members.find((m) => (m.userId ?? m.user_id) === route.recipientUserId);
    return member?.user.email ?? route.recipientUserId ?? "Unknown user";
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Notification Routes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {routes.length === 0 && (
          <p className="text-sm text-muted-foreground">No routes configured. Add one below.</p>
        )}
        {routes.map((route) => (
          <div
            key={route.id}
            className="flex items-center justify-between gap-2 py-2 border-b last:border-0"
          >
            <div className="text-sm">
              <span className="font-medium">{NOTIFICATION_TYPE_LABELS[route.notificationType]}</span>
              <span className="text-muted-foreground"> → {recipientLabel(route)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={route.enabled}
                onCheckedChange={(enabled) => updateRoute.mutate({ id: route.id, enabled })}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteRoute.mutate(route.id)}
                disabled={deleteRoute.isPending}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}

        <div className="border-t pt-4 space-y-3">
          <p className="type-label">Add route</p>
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <Label className="text-xs">Alert type</Label>
              <Select
                value={newType}
                onValueChange={(v) => setNewType(v as NotificationRoute["notificationType"])}
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NOTIFICATION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recipient</Label>
              <Select
                value={newRecipientType}
                onValueChange={(v) => setNewRecipientType(v as "role" | "user")}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">By role</SelectItem>
                  <SelectItem value="user">Specific user</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newRecipientType === "role" ? (
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as MemberRole)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Member</Label>
                <Select value={newUserId} onValueChange={setNewUserId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.userId ?? m.user_id} value={(m.userId ?? m.user_id)!}>
                        {m.user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={createRoute.isPending || (newRecipientType === "user" && !newUserId)}
            >
              Add
            </Button>
          </div>
          {createRoute.isError && (
            <p className="text-sm text-destructive">Failed to add route. Try again.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
