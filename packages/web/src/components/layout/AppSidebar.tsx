import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  Plug,
  OctagonAlert,
  Settings,
  ChevronDown,
  LogOut,
  ChevronsUpDown,
  Plus,
  Check,
  User,
  Users,
  BookOpen,
  MessageSquare,
  Star,
  FileText,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg, type MemberRole } from "@/contexts/OrgContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useCreateOrganization, useCurrentUser } from "@/hooks/useApi";
import { useFavorites } from "@/hooks/useFavorites";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { roleIcons, roleColors } from "@/lib/role-display";

type NavItem = {
  title: string;
  icon: LucideIcon;
  href: string;
  roles: MemberRole[];
};

const navItems: NavItem[] = [
  { title: "Dashboard",    icon: LayoutDashboard, href: "/",                 roles: ["owner", "member", "viewer"] },
  { title: "Events",       icon: Activity,        href: "/events",           roles: ["owner", "member", "viewer"] },
  { title: "Projects",     icon: FolderKanban,    href: "/projects",         roles: ["owner", "member", "viewer"] },
  { title: "Members",      icon: Users,           href: "/members",          roles: ["owner"] },
  { title: "Integrations", icon: Plug,            href: "/integrations",     roles: ["owner"] },
  { title: "Alerts",       icon: OctagonAlert,    href: "/alerts",           roles: ["owner"] },
  { title: "Settings",     icon: Settings,        href: "/settings",         roles: ["owner"] },
  { title: "Library",      icon: BookOpen,        href: "/library",          roles: ["owner", "member", "viewer"] },
  { title: "Feedback",     icon: MessageSquare,   href: "/feedback",         roles: ["owner", "member", "viewer"] },
];

function getOrgInitials(name: string | undefined | null) {
  if (!name) return "??";
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function CreateOrgDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createOrg = useCreateOrganization();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createOrg.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("Failed to create organization:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Create a new organization to manage AI tool usage and team members.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-description">Description (optional)</Label>
              <Input
                id="org-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Our engineering team"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createOrg.isPending}
            >
              {createOrg.isPending ? "Creating..." : "Create Organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrgSwitcher() {
  const { currentOrg, memberships, setCurrentOrg, refreshOrganizations } =
    useOrg();
  const { state } = useSidebar();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (!currentOrg) return null;

  const currentMembership = memberships.find(
    (m) => m.organization.id === currentOrg.id,
  );
  const currentRole = currentMembership?.role || "member";
  const RoleIcon = roleIcons[currentRole];
  const isCollapsed = state === "collapsed";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`
              group relative flex w-full items-center gap-3 rounded-lg border border-sidebar-border
              bg-sidebar-accent/50 p-2 text-left transition-all duration-200
              hover:bg-sidebar-accent hover:border-sidebar-primary/50
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring
              data-[state=open]:bg-sidebar-accent data-[state=open]:border-sidebar-primary/50
              ${isCollapsed ? "justify-center" : ""}
            `}
          >
            {/* Org Avatar/Icon */}
            <div className="relative flex size-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 text-sidebar-primary-foreground shadow-sm">
              <span className="font-mono-display text-xs font-bold tracking-tight">
                {getOrgInitials(currentOrg.name)}
              </span>
              {/* Active indicator dot */}
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success ring-2 ring-sidebar" />
            </div>

            {/* Org Details - hidden when collapsed */}
            {!isCollapsed && (
              <div className="grid flex-1 gap-0.5 overflow-hidden">
                <span className="text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                  Organization
                </span>
                <span className="truncate text-sm font-semibold text-sidebar-foreground">
                  {currentOrg.name}
                </span>
                <span className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
                  <RoleIcon className={`size-3 ${roleColors[currentRole]}`} />
                  <span className="capitalize">{currentRole}</span>
                </span>
              </div>
            )}

            {/* Switch indicator */}
            {!isCollapsed && (
              <div className="flex flex-col items-center justify-center rounded bg-sidebar-accent px-1.5 py-1 transition-colors group-hover:bg-sidebar-primary/20">
                <ChevronsUpDown className="size-4 text-sidebar-foreground/60 transition-colors group-hover:text-sidebar-foreground" />
              </div>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-72"
          align="start"
          side={isCollapsed ? "right" : "bottom"}
          sideOffset={4}
        >
          <DropdownMenuLabel className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Switch Organization
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {memberships.length} total
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {memberships.map((membership) => {
            const org = membership.organization;
            const RoleIconItem = roleIcons[membership.role];
            const isSelected = org.id === currentOrg.id;

            return (
              <DropdownMenuItem
                key={org.id}
                onClick={() => setCurrentOrg(org)}
                className={`gap-3 p-2.5 ${isSelected ? "bg-accent" : ""}`}
              >
                <div
                  className={`
                  flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold
                  ${
                    isSelected
                      ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground"
                      : "border border-border bg-muted text-muted-foreground"
                  }
                `}
                >
                  {getOrgInitials(org.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{org.name}</span>
                    {isSelected && (
                      <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RoleIconItem
                      className={`size-3 ${roleColors[membership.role]}`}
                    />
                    <span className="capitalize">{membership.role}</span>
                  </div>
                </div>
                {isSelected && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            className="gap-3 p-2.5"
          >
            <div className="flex size-9 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/30">
              <Plus className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <span className="font-medium">Create Organization</span>
              <p className="text-xs text-muted-foreground">
                Start a new workspace
              </p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={refreshOrganizations}
      />
    </>
  );
}

function UserMenu() {
  const { profile, logout } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const { currentRole } = useOrg();
  const { state } = useSidebar();
  const { isImpersonating } = useImpersonation();

  const displayName = currentUser?.name || profile?.name || "User";
  const displayEmail = currentUser?.email || profile?.email;
  // During impersonation, don't fall back to the admin's Keycloak picture
  const avatarSrc = currentUser?.avatarUrl || (isImpersonating ? undefined : profile?.picture);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || "U";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8">
            {avatarSrc && <AvatarImage src={avatarSrc} alt={displayName} />}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {getInitials(displayName, profile?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{displayName}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">
              {displayEmail}
            </span>
          </div>
          <ChevronDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
        side={state === "collapsed" ? "right" : "top"}
        sideOffset={4}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-muted-foreground">{displayEmail}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User className="mr-2 size-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        {currentRole === "owner" && (
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings className="mr-2 size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-destructive">
          <LogOut className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  const location = useLocation();
  const { currentRole } = useOrg();
  const { favorites } = useFavorites();

  const visibleNavItems = navItems.filter(
    (item) => currentRole && item.roles.includes(currentRole),
  );

  const isActive = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
                  <span className="font-mono-display text-sm font-bold text-primary-foreground">
                    AI
                  </span>
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold tracking-tight">
                    Aixle Insights
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    AI Tool Analytics
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <OrgSwitcher />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.href)}
                    tooltip={item.title}
                  >
                    <Link to={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {favorites.length > 0 && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Favorites</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {favorites.map((p) => (
                    <SidebarMenuItem key={p.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(`/projects/${p.id}`)}
                        tooltip={p.name}
                      >
                        <Link to={`/projects/${p.id}`}>
                          <Star className="size-4" />
                          <span>{p.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
          </>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Terms of Service">
              <Link to="/legal/terms" state={{ from: location.pathname }}>
                <FileText className="size-4" />
                <span>Terms</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Privacy Policy">
              <Link to="/legal/privacy" state={{ from: location.pathname }}>
                <Shield className="size-4" />
                <span>Privacy</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
