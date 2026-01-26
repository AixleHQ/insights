import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  FolderKanban,
  Plug,
  Users,
  Settings,
  ChevronDown,
  Building2,
  LogOut,
  ChevronsUpDown,
  Plus,
  Check,
  Shield,
  Crown,
  Eye,
  User,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg, type MemberRole } from '@/contexts/OrgContext';
import { useCreateOrganization } from '@/hooks/useApi';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const navItems = [
  { title: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { title: 'Events', icon: Activity, href: '/events' },
  { title: 'Projects', icon: FolderKanban, href: '/projects' },
  { title: 'Connectors', icon: Plug, href: '/connectors' },
  { title: 'Team', icon: Users, href: '/team' },
  { title: 'Settings', icon: Settings, href: '/settings' },
];

const roleIcons: Record<MemberRole, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
};

const roleColors: Record<MemberRole, string> = {
  owner: 'text-amber-500',
  admin: 'text-blue-500',
  member: 'text-emerald-500',
  viewer: 'text-muted-foreground',
};

function getOrgInitials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createOrg = useCreateOrganization();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createOrg.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      setName('');
      setDescription('');
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Failed to create organization:', error);
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createOrg.isPending}>
              {createOrg.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrgSwitcher() {
  const { currentOrg, memberships, setCurrentOrg, refreshOrganizations } = useOrg();
  const { state } = useSidebar();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (!currentOrg) return null;

  const currentMembership = memberships.find((m) => m.organization.id === currentOrg.id);
  const currentRole = currentMembership?.role || 'member';
  const RoleIcon = roleIcons[currentRole];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Building2 className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{currentOrg.name}</span>
              <span className="flex items-center gap-1 text-xs text-sidebar-foreground/60">
                <RoleIcon className={`size-3 ${roleColors[currentRole]}`} />
                <span className="capitalize">{currentRole}</span>
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-64"
          align="start"
          side={state === 'collapsed' ? 'right' : 'bottom'}
          sideOffset={4}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Your Organizations ({memberships.length})
          </DropdownMenuLabel>
          {memberships.map((membership) => {
            const org = membership.organization;
            const RoleIconItem = roleIcons[membership.role];
            const isSelected = org.id === currentOrg.id;

            return (
              <DropdownMenuItem
                key={org.id}
                onClick={() => setCurrentOrg(org)}
                className="gap-2 p-2"
              >
                <div className="flex size-7 items-center justify-center rounded-md border bg-background text-xs font-medium">
                  {getOrgInitials(org.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{org.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <RoleIconItem className={`size-3 ${roleColors[membership.role]}`} />
                    <span className="capitalize">{membership.role}</span>
                  </div>
                </div>
                {isSelected && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateDialogOpen(true)} className="gap-2">
            <div className="flex size-7 items-center justify-center rounded-md border border-dashed">
              <Plus className="size-4" />
            </div>
            <span>Create Organization</span>
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
  const { state } = useSidebar();

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(' ')
        .map((word) => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || 'U';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8">
            {profile?.picture && (
              <AvatarImage src={profile.picture} alt={profile.name || 'User'} />
            )}
            <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs">
              {getInitials(profile?.name, profile?.email)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{profile?.name || 'User'}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">
              {profile?.email}
            </span>
          </div>
          <ChevronDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
        side={state === 'collapsed' ? 'right' : 'top'}
        sideOffset={4}
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{profile?.name || 'User'}</p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings className="mr-2 size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
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

  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
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
                    90
                  </span>
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold tracking-tight">DB90</span>
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
              {navItems.map((item) => (
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
        <SidebarMenu>
          <SidebarMenuItem>
            <OrgSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
