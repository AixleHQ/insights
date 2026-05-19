import type { MemberRole } from "@/contexts/OrgContext";
import { Badge } from "@/components/ui/badge";
import { roleIcons, roleColors } from "@/lib/role-display";
import { cn } from "@/lib/utils";

export function RoleBadge({ role, className }: { role: MemberRole; className?: string }) {
  const Icon = roleIcons[role];
  return (
    <Badge variant="outline" className={cn("gap-1 capitalize text-xs", className)}>
      <Icon className={cn("size-3", roleColors[role])} />
      {role}
    </Badge>
  );
}
