import { useMemo, useState } from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { User, Settings2, Bell, Shield, Wrench, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import {
  useOrganizationMembers,
  useCurrentUser,
  useUpdateCurrentUser,
  useUserOrganizations,
  useUpdateUserSetting,
  usePersonalSettings,
  useUpdatePersonalSettings,
  useRetentionPolicy,
} from "@/hooks/useApi";
import { formatCost, formatTokens } from "@/lib/formatters";
import { formatRetentionLabel, retentionOrder } from "@/lib/retention-utils";
import type { UserPersonalSettings } from "@/lib/types";
import { MemberProfileView } from "./MemberProfile";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsToolsSection } from "./SettingsToolsSection";

const navItems = [
  { title: "Profile", href: "/profile", icon: User },
  { title: "Preferences", href: "/profile/settings", icon: Settings2 },
  { title: "Notifications", href: "/profile/settings/notifications", icon: Bell },
  { title: "Security", href: "/profile/settings/security", icon: Shield },
  { title: "Tools", href: "/profile/tools", icon: Wrench },
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
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
  const { data: members, isLoading: membersLoading } = useOrganizationMembers(currentOrg?.id || "");
  const { data: currentUser } = useCurrentUser();
  const updateUser = useUpdateCurrentUser();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const myMemberId = useMemo(
    () => members?.find((m) => m.user.email === (currentUser?.email || profile?.email))?.id,
    [members, currentUser?.email, profile?.email]
  );

  function handleEdit() {
    setName(currentUser?.name ?? "");
    setAvatarUrl(currentUser?.avatarUrl ?? "");
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setName(currentUser?.name ?? "");
    setAvatarUrl(currentUser?.avatarUrl ?? "");
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
            setError(Object.values(errors).flat().join(", "));
          } else {
            setError("Failed to save changes. Please try again.");
          }
        },
      }
    );
  }

  const displayName = currentUser?.name || profile?.name || "—";
  const initials = displayName !== "—" ? displayName.slice(0, 2).toUpperCase() : "?";

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
                <p className="text-sm text-muted-foreground">{currentUser?.email || profile?.email || "—"}</p>
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
                <p className="text-sm text-muted-foreground">{currentUser?.email || profile?.email || "—"}</p>
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
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const { data: currentUser } = useCurrentUser();
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations();
  const updateSetting = useUpdateUserSetting();

  const savedDefaultOrgId = currentUser?.settings?.default_org_id ?? "";

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
            <Label htmlFor="default-org-select">Default Organization</Label>
            {orgsLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <Select
                value={savedDefaultOrgId}
                onValueChange={(v) =>
                  updateSetting.mutate({ key: "default_org_id", value: v })
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
      <PersonalRetentionPreferenceCard />
    </div>
  );
}

const PERSONAL_RETENTION_OPTIONS = [
  "30_days",
  "60_days",
  "90_days",
  "180_days",
  "365_days",
  "730_days",
] as const;

function PersonalRetentionPreferenceCard() {
  const { currentOrg } = useOrg();
  const { data: orgPolicy, isLoading: orgLoading } = useRetentionPolicy(currentOrg?.id || "");
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const updateSetting = useUpdateUserSetting();

  const orgMax = orgPolicy?.toolEventsRetention ?? "90_days";
  const allowedOptions = PERSONAL_RETENTION_OPTIONS.filter(
    (value) => retentionOrder(value) <= retentionOrder(orgMax)
  );
  const saved = currentUser?.settings?.personal_tool_events_retention ?? "";
  const exceedsCeiling = !!saved && retentionOrder(saved) > retentionOrder(orgMax);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Retention Preference</CardTitle>
        <CardDescription>
          Personal retention cannot exceed the org maximum ({formatRetentionLabel(orgMax)}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {orgLoading || userLoading ? (
          <Skeleton className="h-9 w-48" />
        ) : (
          <>
            <Select
              value={saved || "__inherit__"}
              onValueChange={(v) =>
                updateSetting.mutate({
                  key: "personal_tool_events_retention",
                  value: v === "__inherit__" ? "" : v,
                })
              }
            >
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue placeholder="Use org default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit__">Use org default</SelectItem>
                {allowedOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {formatRetentionLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {exceedsCeiling && (
              <p className="text-xs text-destructive">
                Current value exceeds org max. Choose a shorter period.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PersonalAlertThresholdsForm({ settings }: { settings: UserPersonalSettings }) {
  const { currentOrg } = useOrg();
  const { data: orgPolicy } = useRetentionPolicy(currentOrg?.id || "");
  const updateSettings = useUpdatePersonalSettings();
  const [costInput, setCostInput] = useState(
    settings.costThresholdCents != null ? String(settings.costThresholdCents / 100) : ""
  );
  const [tokenInput, setTokenInput] = useState(
    settings.tokenThreshold != null ? String(settings.tokenThreshold) : ""
  );

  const orgCostCeiling = orgPolicy?.costThresholdCents ?? null;
  const orgTokenCeiling = orgPolicy?.tokenThreshold ?? null;
  const costCents = costInput !== "" ? Math.round(parseFloat(costInput) * 100) : null;
  const tokens = tokenInput !== "" ? parseInt(tokenInput, 10) : null;
  const exceedsCostCeiling =
    orgCostCeiling != null && costCents != null && !isNaN(costCents) && costCents > orgCostCeiling;
  const exceedsTokenCeiling =
    orgTokenCeiling != null && tokens != null && !isNaN(tokens) && tokens > orgTokenCeiling;
  const hasValidationError = exceedsCostCeiling || exceedsTokenCeiling;

  function handleSaveThresholds() {
    if (hasValidationError) return;
    updateSettings.mutate({
      costThresholdCents: costCents != null && !isNaN(costCents) ? costCents : null,
      tokenThreshold: tokens != null && !isNaN(tokens) ? tokens : null,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Alert Thresholds</CardTitle>
        <CardDescription>
          Override org-level thresholds with your own limits. Leave blank to use org defaults.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="personal-cost-threshold">Cost threshold (USD)</Label>
            {orgCostCeiling != null && (
              <p className="text-xs text-muted-foreground">
                Org max: {formatCost(orgCostCeiling / 100)}
              </p>
            )}
            <Input
              id="personal-cost-threshold"
              type="number"
              min="0"
              step="0.01"
              placeholder={
                orgCostCeiling != null
                  ? `Max ${formatCost(orgCostCeiling / 100)}`
                  : "e.g. 5.00"
              }
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              className={exceedsCostCeiling ? "border-destructive" : ""}
            />
            {exceedsCostCeiling && (
              <p className="text-xs text-destructive">
                Cannot exceed org ceiling of {formatCost(orgCostCeiling! / 100)}.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Alert when your personal cost exceeds this amount.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="personal-token-threshold">Token threshold</Label>
            {orgTokenCeiling != null && (
              <p className="text-xs text-muted-foreground">
                Org max: {formatTokens(orgTokenCeiling)}
              </p>
            )}
            <Input
              id="personal-token-threshold"
              type="number"
              min="0"
              step="1000"
              placeholder={
                orgTokenCeiling != null
                  ? `Max ${formatTokens(orgTokenCeiling)}`
                  : "e.g. 100000"
              }
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className={exceedsTokenCeiling ? "border-destructive" : ""}
            />
            {exceedsTokenCeiling && (
              <p className="text-xs text-destructive">
                Cannot exceed org ceiling of {formatTokens(orgTokenCeiling!)}.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Alert when your personal token usage exceeds this count.</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleSaveThresholds}
          disabled={updateSettings.isPending || hasValidationError}
        >
          {updateSettings.isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
          Save thresholds
        </Button>
        <div className="space-y-4 border-t pt-4">
          <p className="text-sm font-medium">Alert delivery</p>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="alert-email">Email alerts</Label>
              <p className="text-xs text-muted-foreground">Receive alert notifications by email.</p>
            </div>
            <Switch
              id="alert-email"
              checked={settings.alertEmail}
              onCheckedChange={(checked) => updateSettings.mutate({ alertEmail: checked })}
              disabled={updateSettings.isPending}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="alert-slack">Slack alerts</Label>
              <p className="text-xs text-muted-foreground">Receive alert notifications via Slack.</p>
            </div>
            <Switch
              id="alert-slack"
              checked={settings.alertSlack}
              onCheckedChange={(checked) => updateSettings.mutate({ alertSlack: checked })}
              disabled={updateSettings.isPending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonalAlertThresholdsCard() {
  const { data: settings, isLoading } = usePersonalSettings();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Personal Alert Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </CardContent>
      </Card>
    );
  }
  if (!settings) return null;
  return <PersonalAlertThresholdsForm settings={settings} />;
}

/** Per notification-route-type opt-outs (true = receive, false = opted out). */
const NOTIFICATION_TYPE_TOGGLES = [
  { key: "notify_cost_alert", label: "Cost alerts", description: "Notifications when cost thresholds are exceeded." },
  { key: "notify_token_alert", label: "Token alerts", description: "Notifications when token thresholds are exceeded." },
  { key: "notify_retention_warning", label: "Retention warnings", description: "Warnings before data is purged per retention policy." },
  { key: "notify_risk_alert", label: "Risk alerts", description: "Security and risk scan notifications." },
] as const;

const LEGACY_NOTIFICATION_TOGGLES = [
  { key: "notify_in_app_risk", label: "In-app risk alerts", description: "Show alerts in-app when a risk is detected." },
  { key: "notify_in_app_cost", label: "In-app cost alerts", description: "Show alerts in-app when cost thresholds are exceeded." },
  { key: "notify_email_digest", label: "Weekly email digest", description: "Receive a weekly summary of usage and costs by email." },
  { key: "notify_email_alerts", label: "Alert emails", description: "Receive email notifications for risk and cost alerts." },
] as const;

function NotificationsSection() {
  const { data: currentUser, isLoading } = useCurrentUser();
  const updateSetting = useUpdateUserSetting();

  function handleToggle(key: string, checked: boolean) {
    updateSetting.mutate({ key, value: String(checked) });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Per-type opt-outs and delivery preferences. Disabled types will not be sent to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[...NOTIFICATION_TYPE_TOGGLES, ...LEGACY_NOTIFICATION_TOGGLES].map(({ key }) => (
                <Skeleton key={key} className="h-10" />
              ))}
            </div>
          ) : (
            [...NOTIFICATION_TYPE_TOGGLES, ...LEGACY_NOTIFICATION_TOGGLES].map(({ key, label, description }) => {
              const enabled = currentUser?.settings?.[key] !== "false";
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
            })
          )}
        </CardContent>
      </Card>
      <PersonalAlertThresholdsCard />
    </div>
  );
}

function SecuritySection() {
  const { data: currentUser, isLoading } = useCurrentUser();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Account security information and session details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label>Email address</Label>
            {isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Last sign-in</Label>
            {isLoading ? (
              <Skeleton className="h-4 w-36" />
            ) : (
              <p className="text-sm text-muted-foreground">
                {currentUser?.lastSignInAt
                  ? new Date(currentUser.lastSignInAt).toLocaleString()
                  : "No sign-in recorded"}
              </p>
            )}
          </div>

          <div className="rounded-md border p-4">
            <p className="text-sm text-muted-foreground">
              Password and authentication settings are managed through your identity provider.
              Contact your administrator to change your password or update multi-factor
              authentication.
            </p>
          </div>
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
            <Route path="tools" element={<SettingsToolsSection />} />
            <Route path="*" element={<Navigate to="/profile" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
