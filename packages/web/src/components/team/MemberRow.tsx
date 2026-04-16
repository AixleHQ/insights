import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Shield, ShieldCheck, User, Eye, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/utils";

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface MemberData {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string | null;
  role: MemberRole;
  status: "active" | "pending" | "inactive";
  joined_at?: string;
  last_active_at?: string;
  total_tokens?: number;
}

interface MemberRowProps {
  member: MemberData;
  currentUserRole?: MemberRole;
  onRoleChange?: (id: string, role: MemberRole) => void;
  onRemove?: (id: string) => void;
  className?: string;
}

const roleConfig: Record<
  MemberRole,
  { label: string; icon: typeof Shield; color: string }
> = {
  owner: { label: "Owner", icon: ShieldCheck, color: "text-primary" },
  admin: { label: "Admin", icon: Shield, color: "text-warning" },
  member: { label: "Member", icon: User, color: "text-muted-foreground" },
  viewer: { label: "Viewer", icon: Eye, color: "text-muted-foreground" },
};

function getInitials(name?: string, email?: string): string {
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

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
}

export function MemberRow({
  member,
  currentUserRole,
  onRoleChange,
  onRemove,
  className,
}: MemberRowProps) {
  const [isChangingRole, setIsChangingRole] = useState(false);
  const role = roleConfig[member.role];
  const RoleIcon = role.icon;

  const canManageMembers =
    currentUserRole === "owner" || currentUserRole === "admin";
  const canEditRole =
    canManageMembers &&
    member.role !== "owner" &&
    (currentUserRole === "owner" || member.role !== "admin");
  const canRemove = canEditRole;

  const handleRoleChange = (newRole: MemberRole) => {
    setIsChangingRole(true);
    onRoleChange?.(member.id, newRole);
    setTimeout(() => setIsChangingRole(false), 500);
  };

  return (
    <TableRow className={cn("group", className)}>
      <TableCell>
        <Link
          to={`/team/${member.id}`}
          className="flex items-center gap-3 rounded-md transition-colors hover:bg-muted/50 -m-2 p-2"
        >
          <Avatar className="size-8">
            {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name || member.email} />}
            <AvatarFallback className="text-xs bg-muted">
              {getInitials(member.name, member.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium hover:underline">
              {member.name || member.email.split("@")[0]}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {member.email}
            </p>
          </div>
        </Link>
      </TableCell>
      <TableCell>
        {canEditRole ? (
          <Select
            value={member.role}
            onValueChange={handleRoleChange}
            disabled={isChangingRole}
          >
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-1.5">
            <RoleIcon className={cn("size-4", role.color)} />
            <span className="text-sm">{role.label}</span>
          </div>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <Badge
          variant={member.status === "active" ? "default" : "secondary"}
          className="text-xs"
        >
          {member.status === "pending" ? "Pending" : member.status}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
        {member.joined_at ? formatDistanceToNow(member.joined_at) : "-"}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
        {member.last_active_at
          ? formatDistanceToNow(member.last_active_at)
          : "-"}
      </TableCell>
      <TableCell className="hidden sm:table-cell font-mono-display text-sm">
        {member.total_tokens !== undefined && member.total_tokens > 0
          ? formatTokens(member.total_tokens)
          : "-"}
      </TableCell>
      <TableCell>
        {canRemove && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onRemove?.(member.id)}
              >
                <Trash2 className="mr-2 size-4" />
                Remove from team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}
