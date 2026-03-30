import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { User, Settings2, Bell, Shield, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ToolAccounts } from './ToolAccounts';

const navItems = [
  { title: 'Profile', href: '/profile', icon: User },
  { title: 'Preferences', href: '/profile/settings', icon: Settings2 },
  { title: 'Notifications', href: '/profile/settings/notifications', icon: Bell },
  { title: 'Security', href: '/profile/settings/security', icon: Shield },
  { title: 'Tools', href: '/profile/tools', icon: Wrench },
];

function UserSettingsNav() {
  const location = useLocation();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = location.pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="size-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileSection() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information and account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Name</p>
            <p className="text-sm text-muted-foreground">{profile?.name || '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{profile?.email || '—'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your experience in DB90.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Preference settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Control how and when you receive notifications.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Notification settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Manage your account security and active sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Security settings coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function UserSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">User Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and preferences.</p>
      </div>
      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full md:w-48 shrink-0">
          <UserSettingsNav />
        </aside>
        <div className="flex-1 min-w-0">
          <Routes>
            <Route index element={<ProfileSection />} />
            <Route path="settings" element={<PreferencesSection />} />
            <Route path="settings/notifications" element={<NotificationsSection />} />
            <Route path="settings/security" element={<SecuritySection />} />
            <Route path="tools" element={<ToolAccounts embedded />} />
            <Route path="*" element={<Navigate to="/profile" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
