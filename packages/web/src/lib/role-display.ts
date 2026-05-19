import { Crown, Eye, User, type LucideIcon } from "lucide-react";
import type { MemberRole } from "@/contexts/OrgContext";

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
