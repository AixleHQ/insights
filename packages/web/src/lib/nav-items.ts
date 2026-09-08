import {
  LayoutDashboard,
  DollarSign,
  Activity,
  FolderKanban,
  Users,
  Plug,
  OctagonAlert,
  Settings,
  Download,
  type LucideIcon,
} from "lucide-react";
import type { MemberRole } from "@/contexts/OrgContext";
import { AppRoutes } from "@/lib/routes";

export type NavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  roles: MemberRole[];
  /** When false, shown in the command palette only — not the sidebar. */
  sidebar?: boolean;
};

/**
 * Canonical app destinations. Order matches the Figma sidebar / Global Search.
 * Billing is palette-only until a dedicated page ships; it deep-links to model pricing.
 */
export const navItems: NavItem[] = [
  { title: "Dashboard",    icon: LayoutDashboard, href: AppRoutes.dashboard,           roles: ["owner", "member", "viewer"] },
  { title: "Billing",      icon: DollarSign,      href: AppRoutes.settings.pricing,    roles: ["owner"], sidebar: false },
  { title: "Events",       icon: Activity,        href: AppRoutes.events.root,         roles: ["owner", "member", "viewer"] },
  { title: "Projects",     icon: FolderKanban,    href: AppRoutes.projects.root,       roles: ["owner", "member", "viewer"] },
  { title: "Members",      icon: Users,           href: AppRoutes.members.root,        roles: ["owner"] },
  { title: "Integrations", icon: Plug,            href: AppRoutes.integrations.root,   roles: ["owner"] },
  { title: "Alerts",       icon: OctagonAlert,    href: AppRoutes.alerts,              roles: ["owner"] },
  { title: "Settings",     icon: Settings,        href: AppRoutes.settings.root,       roles: ["owner"] },
  { title: "Exports",      icon: Download,        href: AppRoutes.exports,             roles: ["owner"] },
];

export function visibleSidebarNavItems(role: MemberRole | null | undefined): NavItem[] {
  if (!role) return [];
  return navItems.filter((item) => item.sidebar !== false && item.roles.includes(role));
}

export function visibleCommandPaletteNavItems(role: MemberRole | null | undefined): NavItem[] {
  if (!role) return [];
  return navItems.filter((item) => item.roles.includes(role));
}
