import { NavLink, Outlet, Navigate } from 'react-router-dom';
import {
  Users,
  Building2,
  LayoutDashboard,
  Settings,
  Activity,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/useApi';
import { cn } from '@/lib/utils';

const adminNavItems = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/organizations', label: 'Organizations', icon: Building2 },
  { to: '/admin/activity', label: 'Activity Log', icon: Activity },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  const { data: currentUser, isLoading } = useCurrentUser();

  // Show loading state while checking permissions
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Check if user is super admin
  if (!currentUser?.super_admin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      {/* Admin header */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h1 className="font-semibold">Admin Console</h1>
          <p className="text-sm text-muted-foreground">
            Platform administration and management
          </p>
        </div>
      </div>

      {/* Admin navigation */}
      <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1">
        {adminNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Admin content */}
      <Outlet />
    </div>
  );
}
