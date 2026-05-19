import { Crown, Eye, User, type LucideIcon } from "lucide-react";
import type { MemberRole } from "@/contexts/OrgContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const roleIcons: Record<MemberRole, LucideIcon> = {
  owner: Crown,
  member: User,
  viewer: Eye,
};

export const roleColors: Record<MemberRole, string> = {
  owner: "text-amber-500",
  member: "text-emerald-500",
  viewer: "text-muted-foreground",
};

export function RoleBadge({ role, className }: { role: MemberRole; className?: string }) {
  const Icon = roleIcons[role];
  return (
    <Badge variant="outline" className={cn("gap-1 capitalize text-xs", className)}>
      <Icon className={cn("size-3", roleColors[role])} />
      {role}
    </Badge>
  );
}
