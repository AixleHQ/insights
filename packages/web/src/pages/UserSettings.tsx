import { useMemo, useState } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { User, Settings2, Bell, Shield, Wrench, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { useTheme, type Theme } from '@/contexts/ThemeContext';
import { useOrganizationMembers, useCurrentUser, useUpdateCurrentUser, useUserOrganizations, useUpdateUserSetting } from '@/hooks/useApi';
import { MemberProfileView } from './MemberProfile';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const { currentOrg } = useOrg();
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(currentOrg?.id || '');
  const { data: currentUser } = useCurrentUser();
  const updateUser = useUpdateCurrentUser();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const myMemberId = useMemo(
    () => members?.find((m) => m.user.email === profile?.email)?.id,
    [members, profile?.email]
  );

  function handleEdit() {
    setName(currentUser?.name ?? '');
    setAvatarUrl(currentUser?.avatarUrl ?? '');
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setName(currentUser?.name ?? '');
    setAvatarUrl(currentUser?.avatarUrl ?? '');
    setError(null);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    updateUser.mutate(
      { name: name || undefined, avatar_url: avatarUrl || undefined },
      {
        onSuccess: () => setIsEditing(false),
        onError: (err: unknown) => {
          const apiError = err as { response?: { data?: { errors?: Record<string, string[]> } } };
          const errors = apiError?.response?.data?.errors;
          if (errors) {
            setError(Object.values(errors).flat().join(', '));
          } else {
            setError('Failed to save changes. Please try again.');
          }
        },
      }
    );
  }

  const displayName = currentUser?.name || profile?.name || '—';
  const initials = displayName !== '—' ? displayName.slice(0, 2).toUpperCase() : '?';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Your personal information and account details.</CardDescription>
          </div>
          {!isEditing && (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div className="flex items-center gap-4">
                <Avatar size="lg" className="size-16">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <p className="text-sm text-muted-foreground">Avatar preview</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avatar-url">Avatar URL</Label>
                <Input
                  id="avatar-url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.png"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{profile?.email || '—'}</p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={updateUser.isPending}>
                  {updateUser.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save
                </Button>
                <Button variant="outline" onClick={handleCancel} disabled={updateUser.isPending}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar size="lg" className="size-16">
                  <AvatarImage src={currentUser?.avatarUrl || undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Name</p>
                <p className="text-sm text-muted-foreground">{displayName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{profile?.email || '—'}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {membersLoading ? (
        <Skeleton className="h-[400px]" />
      ) : myMemberId ? (
        <MemberProfileView memberId={myMemberId} embedded />
      ) : null}
    </div>
  );
}

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const { data: currentUser } = useCurrentUser();
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations();
  const updateSetting = useUpdateUserSetting();

  const savedDefaultOrgId = currentUser?.settings?.default_org_id ?? '';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your experience in DB90.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="theme-select">Theme</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger id="theme-select" className="w-48">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Changes apply immediately and are saved to your account.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-org-select">Default Organisation</Label>
            {orgsLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <Select
                value={savedDefaultOrgId}
                onValueChange={(v) =>
                  updateSetting.mutate({ key: 'default_org_id', value: v })
                }
              >
                <SelectTrigger id="default-org-select" className="w-48">
                  <SelectValue placeholder="Select organisation" />
                </SelectTrigger>
                <SelectContent>
                  {(orgs ?? []).map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Used when you log in on a new device or browser.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const NOTIFICATION_TOGGLES = [
  { key: 'notify_in_app_risk',  label: 'In-app risk alerts',  description: 'Show alerts in-app when a risk is detected.' },
  { key: 'notify_in_app_cost',  label: 'In-app cost alerts',  description: 'Show alerts in-app when cost thresholds are exceeded.' },
  { key: 'notify_email_digest', label: 'Weekly email digest', description: 'Receive a weekly summary of usage and costs by email.' },
  { key: 'notify_email_alerts', label: 'Alert emails',        description: 'Receive email notifications for risk and cost alerts.' },
] as const;

function NotificationsSection() {
  const { data: currentUser } = useCurrentUser();
  const updateSetting = useUpdateUserSetting();

  function handleToggle(key: string, checked: boolean) {
    updateSetting.mutate({ key, value: String(checked) });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Control how and when you receive notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {NOTIFICATION_TOGGLES.map(({ key, label, description }) => {
            const enabled = currentUser?.settings?.[key] === 'true';
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={key}>{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  id={key}
                  checked={enabled}
                  onCheckedChange={(checked) => handleToggle(key, checked)}
                  disabled={updateSetting.isPending}
                />
              </div>
            );
          })}
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
