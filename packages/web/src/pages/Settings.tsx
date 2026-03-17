import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Team } from './Team';
import {
  Building2,
  Shield,
  Bell,
  CreditCard,
  Loader2,
  Save,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  FileSearch,
  Users,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import {
  useOrganization,
  useUpdateOrganization,
  useRetentionPolicy,
  useUpdateRetentionPolicy,
  useOrganizationSettings,
  useUpdateOrganizationSetting,
  useDeleteOrganizationSetting,
  useOverviewStats,
  useDailyStats,
  useOrganizationAuditLogs,
  useConnectors,
  type AuditLogFilters,
} from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const navItems = [
  { title: 'General', href: '/settings', icon: Building2 },
  { title: 'Members', href: '/settings/members', icon: Users },
  { title: 'Policies', href: '/settings/policies', icon: Shield },
  { title: 'Alerts', href: '/settings/alerts', icon: Bell },
  { title: 'Billing', href: '/settings/billing', icon: CreditCard },
  { title: 'Security & Audit', href: '/settings/security', icon: FileSearch },
];

function SettingsNav() {
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

function GeneralSettings() {
  const { currentOrg } = useOrg();
  const { data: org, isLoading } = useOrganization(currentOrg?.id || '');
  const { data: settings, isLoading: isLoadingSettings } = useOrganizationSettings(currentOrg?.id || '');
  const updateOrg = useUpdateOrganization();
  const updateSetting = useUpdateOrganizationSetting();
  const deleteSetting = useDeleteOrganizationSetting();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [emailDomain, setEmailDomain] = useState('');

  const savedEmailDomain =
    (settings as { data: Array<{ key: string; value: string }> })?.data?.find(
      (s) => s.key === 'allowed_email_domain'
    )?.value ?? '';

  // Update form when org data loads
  useEffect(() => {
    if (org) {
      setFormData((prev) => {
        const newData = {
          name: org.name || '',
          slug: org.slug || '',
          description: org.description || '',
        };
        // Only update if data actually changed
        if (prev.name !== newData.name || prev.slug !== newData.slug || prev.description !== newData.description) {
          return newData;
        }
        return prev;
      });
    }
  }, [org]);

  useEffect(() => {
    setEmailDomain(savedEmailDomain);
  }, [savedEmailDomain]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!currentOrg) return;
    try {
      await updateOrg.mutateAsync({ id: currentOrg.id, data: formData });
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleSaveEmailDomain = async () => {
    if (!currentOrg) return;
    try {
      const trimmed = emailDomain.trim().toLowerCase();
      if (!trimmed && savedEmailDomain) {
        await deleteSetting.mutateAsync({ orgId: currentOrg.id, key: 'allowed_email_domain' });
      } else if (trimmed) {
        await updateSetting.mutateAsync({
          orgId: currentOrg.id,
          key: 'allowed_email_domain',
          value: trimmed,
        });
      }
    } catch (error) {
      console.error('Failed to save email domain:', error);
    }
  };

  if (isLoading || isLoadingSettings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">General Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your organization's basic information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={formData.name || org?.name || ''}
              onChange={(e) => handleChange('name', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              value={formData.slug || org?.slug || ''}
              onChange={(e) => handleChange('slug', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is used in URLs and cannot be easily changed
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="A brief description of your organization"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateOrg.isPending || !hasChanges}>
          {updateOrg.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Save className="mr-2 size-4" />
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Domain Auto-Join</CardTitle>
          <CardDescription>
            Users who register with this email domain will automatically join your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emailDomain">Allowed Email Domain</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                <Input
                  id="emailDomain"
                  className="pl-7"
                  value={emailDomain}
                  onChange={(e) => setEmailDomain(e.target.value)}
                  placeholder="example.com"
                />
              </div>
              <Button
                onClick={handleSaveEmailDomain}
                disabled={updateSetting.isPending || deleteSetting.isPending || emailDomain.trim().toLowerCase() === savedEmailDomain}
              >
                {updateSetting.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                <Save className="mr-2 size-4" />
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to disable auto-join. Only one domain is supported per organization.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Returns a numeric value for ordering retention durations (higher = longer retention)
function retentionOrder(value: string): number {
  if (value === 'forever') return Infinity;
  const parts = value.split('_');
  const unit = parts[parts.length - 1];
  const amount = parseInt(parts[0]);
  if (unit === 'hours') return amount;
  if (unit === 'days') return amount * 24;
  return 0;
}

function formatRetentionLabel(value: string): string {
  if (value === 'forever') return 'Forever';
  const parts = value.split('_');
  const unit = parts[parts.length - 1];
  const amount = parseInt(parts[0]);
  if (unit === 'hours') return `${amount} hours`;
  if (unit === 'days') {
    if (amount % 365 === 0) {
      const years = amount / 365;
      return `${years} year${years > 1 ? 's' : ''}`;
    }
    if (amount === 180) return '6 months';
    return `${amount} days`;
  }
  return value;
}

function PolicySettings() {
  const { currentOrg } = useOrg();
  const { data: retentionPolicy, isLoading: isLoadingRetention } = useRetentionPolicy(currentOrg?.id || '');
  const { data: settings, isLoading: isLoadingSettings } = useOrganizationSettings(currentOrg?.id || '');
  const updateRetention = useUpdateRetentionPolicy();
  const updateSetting = useUpdateOrganizationSetting();

  const [pendingChange, setPendingChange] = useState<{
    field: string;
    value: string;
    currentLabel: string;
    newLabel: string;
  } | null>(null);

  // Parse settings from API or use defaults
  const policies = {
    sanitizeApiKeys: (settings as Record<string, boolean>)?.sanitize_api_keys ?? true,
    sanitizeSecrets: (settings as Record<string, boolean>)?.sanitize_secrets ?? true,
    sanitizeEmails: (settings as Record<string, boolean>)?.sanitize_emails ?? false,
    sanitizeIps: (settings as Record<string, boolean>)?.sanitize_ips ?? false,
    blockHighRisk: (settings as Record<string, boolean>)?.block_high_risk ?? true,
    requireReview: (settings as Record<string, boolean>)?.require_review ?? false,
  };

  const isLoading = isLoadingRetention || isLoadingSettings;

  const togglePolicy = async (key: keyof typeof policies) => {
    if (!currentOrg) return;
    const settingKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    try {
      await updateSetting.mutateAsync({
        orgId: currentOrg.id,
        key: settingKey,
        value: !policies[key],
      });
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const applyRetentionChange = async (field: string, value: string) => {
    if (!currentOrg) return;
    try {
      await updateRetention.mutateAsync({ orgId: currentOrg.id, data: { [field]: value } });
    } catch (error) {
      console.error('Failed to update retention:', error);
    }
  };

  const handleRetentionChange = (field: string, currentValue: string, newValue: string) => {
    if (retentionOrder(newValue) < retentionOrder(currentValue)) {
      setPendingChange({
        field,
        value: newValue,
        currentLabel: formatRetentionLabel(currentValue),
        newLabel: formatRetentionLabel(newValue),
      });
    } else {
      applyRetentionChange(field, newValue);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Sanitization Policies</h2>
        <p className="text-sm text-muted-foreground">
          Configure how sensitive content is handled
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content Sanitization</CardTitle>
          <CardDescription>
            Automatically detect and redact sensitive information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>API Keys</Label>
              <p className="text-xs text-muted-foreground">
                Detect and redact API keys and tokens
              </p>
            </div>
            <Switch
              checked={policies.sanitizeApiKeys}
              onCheckedChange={() => togglePolicy('sanitizeApiKeys')}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Secrets & Credentials</Label>
              <p className="text-xs text-muted-foreground">
                Detect passwords, SSH keys, and certificates
              </p>
            </div>
            <Switch
              checked={policies.sanitizeSecrets}
              onCheckedChange={() => togglePolicy('sanitizeSecrets')}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Email Addresses</Label>
              <p className="text-xs text-muted-foreground">
                Redact email addresses in content
              </p>
            </div>
            <Switch
              checked={policies.sanitizeEmails}
              onCheckedChange={() => togglePolicy('sanitizeEmails')}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>IP Addresses</Label>
              <p className="text-xs text-muted-foreground">
                Redact IP addresses and network info
              </p>
            </div>
            <Switch
              checked={policies.sanitizeIps}
              onCheckedChange={() => togglePolicy('sanitizeIps')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Retention</CardTitle>
          <CardDescription>
            Configure how long data is retained
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Raw Event TTL</Label>
              <Select
                value={retentionPolicy?.rawEventTtl || '24_hours'}
                onValueChange={(value) =>
                  handleRetentionChange('raw_event_ttl', retentionPolicy?.rawEventTtl || '24_hours', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6_hours">6 hours</SelectItem>
                  <SelectItem value="12_hours">12 hours</SelectItem>
                  <SelectItem value="24_hours">24 hours</SelectItem>
                  <SelectItem value="48_hours">48 hours</SelectItem>
                  <SelectItem value="72_hours">72 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tool Events</Label>
              <Select
                value={retentionPolicy?.toolEventsRetention || '90_days'}
                onValueChange={(value) =>
                  handleRetentionChange('tool_events_retention', retentionPolicy?.toolEventsRetention || '90_days', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30_days">30 days</SelectItem>
                  <SelectItem value="60_days">60 days</SelectItem>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="180_days">6 months</SelectItem>
                  <SelectItem value="365_days">1 year</SelectItem>
                  <SelectItem value="730_days">2 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hourly Aggregates</Label>
              <Select
                value={retentionPolicy?.hourlyAggregateRetention || '365_days'}
                onValueChange={(value) =>
                  handleRetentionChange('hourly_aggregate_retention', retentionPolicy?.hourlyAggregateRetention || '365_days', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="180_days">6 months</SelectItem>
                  <SelectItem value="365_days">1 year</SelectItem>
                  <SelectItem value="730_days">2 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Daily Aggregates</Label>
              <Select
                value={retentionPolicy?.dailyAggregateRetention || 'forever'}
                onValueChange={(value) =>
                  handleRetentionChange('daily_aggregate_retention', retentionPolicy?.dailyAggregateRetention || 'forever', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="365_days">1 year</SelectItem>
                  <SelectItem value="730_days">2 years</SelectItem>
                  <SelectItem value="1095_days">3 years</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingChange} onOpenChange={(open) => !open && setPendingChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reduce retention period?</AlertDialogTitle>
            <AlertDialogDescription>
              You are reducing the retention from{' '}
              <strong>{pendingChange?.currentLabel}</strong> to{' '}
              <strong>{pendingChange?.newLabel}</strong>. Data older than the
              new limit may be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingChange) {
                  applyRetentionChange(pendingChange.field, pendingChange.value);
                  setPendingChange(null);
                }
              }}
            >
              Reduce retention
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Management</CardTitle>
          <CardDescription>
            Configure how high-risk content is handled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Block High-Risk Events</Label>
              <p className="text-xs text-muted-foreground">
                Prevent high-risk content from being processed
              </p>
            </div>
            <Switch
              checked={policies.blockHighRisk}
              onCheckedChange={() => togglePolicy('blockHighRisk')}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Require Manual Review</Label>
              <p className="text-xs text-muted-foreground">
                Hold medium+ risk events for admin review
              </p>
            </div>
            <Switch
              checked={policies.requireReview}
              onCheckedChange={() => togglePolicy('requireReview')}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AlertSettings() {
  const { currentOrg } = useOrg();
  const { data: settings, isLoading } = useOrganizationSettings(currentOrg?.id || '');
  const { data: connectors } = useConnectors(currentOrg?.id || '');
  const updateSetting = useUpdateOrganizationSetting();

  const getSetting = (key: string) =>
    (settings as { data: Array<{ key: string; value: string }> })?.data?.find(
      (s) => s.key === key
    )?.value;

  const hasSlackConnector = connectors?.some(
    (c) => (c.connectorType === 'slack' || c.connector_type === 'slack') && (c.isActive || c.is_active)
  ) ?? false;

  // Parse boolean/numeric settings
  const riskCritical = getSetting('alert_risk_critical') !== 'false' && getSetting('alert_risk_critical') !== undefined ? getSetting('alert_risk_critical') !== 'false' : true;
  const riskHigh = getSetting('alert_risk_high') !== 'false' && getSetting('alert_risk_high') !== undefined ? getSetting('alert_risk_high') !== 'false' : true;
  const usageSpike = getSetting('alert_usage_spike') !== 'false' && getSetting('alert_usage_spike') !== undefined ? getSetting('alert_usage_spike') !== 'false' : true;
  const emailNotifications = getSetting('alert_email') !== 'false' && getSetting('alert_email') !== undefined ? getSetting('alert_email') !== 'false' : true;
  const slackNotifications = getSetting('alert_slack') === 'true';

  // Controlled state for cost threshold inputs
  const [costDaily, setCostDaily] = useState('');
  const [costMonthly, setCostMonthly] = useState('');
  const [costDailyError, setCostDailyError] = useState('');
  const [costMonthlyError, setCostMonthlyError] = useState('');

  // Sync controlled inputs when settings load
  useEffect(() => {
    const daily = getSetting('alert_cost_daily');
    if (daily !== undefined) setCostDaily(daily);
    else setCostDaily('500');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    const monthly = getSetting('alert_cost_monthly');
    if (monthly !== undefined) setCostMonthly(monthly);
    else setCostMonthly('5000');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const validateCostInput = (value: string): string => {
    if (value === '' || value === null) return 'Value is required';
    if (!/^\d+(\.\d+)?$/.test(value.trim())) return 'Must be a positive number';
    if (Number(value) < 0) return 'Must be non-negative';
    return '';
  };

  const handleCostDailyChange = (value: string) => {
    setCostDaily(value);
    setCostDailyError(validateCostInput(value));
  };

  const handleCostMonthlyChange = (value: string) => {
    setCostMonthly(value);
    setCostMonthlyError(validateCostInput(value));
  };

  const handleCostDailyBlur = () => {
    const error = validateCostInput(costDaily);
    setCostDailyError(error);
    if (!error && currentOrg) {
      updateSetting.mutate({ orgId: currentOrg.id, key: 'alert_cost_daily', value: costDaily });
    }
  };

  const handleCostMonthlyBlur = () => {
    const error = validateCostInput(costMonthly);
    setCostMonthlyError(error);
    if (!error && currentOrg) {
      updateSetting.mutate({ orgId: currentOrg.id, key: 'alert_cost_monthly', value: costMonthly });
    }
  };

  const updateAlertSetting = async (key: string, value: unknown) => {
    if (!currentOrg) return;
    try {
      await updateSetting.mutateAsync({ orgId: currentOrg.id, key, value });
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Alert Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure when and how you receive alerts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Thresholds</CardTitle>
          <CardDescription>Get notified when costs exceed limits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="costDaily">Daily Cost Limit (USD)</Label>
            <Input
              id="costDaily"
              type="number"
              min={0}
              value={costDaily}
              onChange={(e) => handleCostDailyChange(e.target.value)}
              onBlur={handleCostDailyBlur}
              className={cn(costDailyError && 'border-destructive focus-visible:ring-destructive')}
            />
            {costDailyError && (
              <p className="text-xs text-destructive">{costDailyError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="costMonthly">Monthly Cost Limit (USD)</Label>
            <Input
              id="costMonthly"
              type="number"
              min={0}
              value={costMonthly}
              onChange={(e) => handleCostMonthlyChange(e.target.value)}
              onBlur={handleCostMonthlyBlur}
              className={cn(costMonthlyError && 'border-destructive focus-visible:ring-destructive')}
            />
            {costMonthlyError && (
              <p className="text-xs text-destructive">{costMonthlyError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Alerts</CardTitle>
          <CardDescription>
            Notifications for security-related events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Critical Risk Events</Label>
              <p className="text-xs text-muted-foreground">
                Immediate alert for critical findings
              </p>
            </div>
            <Switch
              aria-label="Critical Risk Events"
              checked={riskCritical}
              onCheckedChange={(checked) =>
                updateAlertSetting('alert_risk_critical', checked)
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>High Risk Events</Label>
              <p className="text-xs text-muted-foreground">
                Alert for high-risk content detected
              </p>
            </div>
            <Switch
              aria-label="High Risk Events"
              checked={riskHigh}
              onCheckedChange={(checked) =>
                updateAlertSetting('alert_risk_high', checked)
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Usage Spikes</Label>
              <p className="text-xs text-muted-foreground">
                Unusual increases in tool usage
              </p>
            </div>
            <Switch
              aria-label="Usage Spikes"
              checked={usageSpike}
              onCheckedChange={(checked) =>
                updateAlertSetting('alert_usage_spike', checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Channels</CardTitle>
          <CardDescription>Where to send alert notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Email Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Send alerts to organization admins
              </p>
            </div>
            <Switch
              aria-label="Email Notifications"
              checked={emailNotifications}
              onCheckedChange={(checked) =>
                updateAlertSetting('alert_email', checked)
              }
            />
          </div>
          <div className={cn('flex items-center justify-between rounded-lg border p-3', !hasSlackConnector && 'opacity-60')}>
            <div>
              <Label>Slack Notifications</Label>
              <p className="text-xs text-muted-foreground">
                {hasSlackConnector
                  ? 'Post alerts to a Slack channel'
                  : 'Connect a Slack integration to enable this'}
              </p>
            </div>
            <Switch
              aria-label="Slack Notifications"
              checked={slackNotifications}
              disabled={!hasSlackConnector}
              onCheckedChange={(checked) =>
                updateAlertSetting('alert_slack', checked)
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BillingSettings() {
  const { currentOrg } = useOrg();
  const { data: stats, isLoading: isLoadingStats } = useOverviewStats(currentOrg?.id || '');
  const { data: dailyStats, isLoading: isLoadingDaily } = useDailyStats(currentOrg?.id || '', 30);

  // Calculate month-to-date usage from daily stats
  const monthlyEvents = dailyStats?.data?.reduce((sum, d) => sum + d.event_count, 0) ?? 0;
  const monthlyTokens = dailyStats?.data?.reduce(
    (sum, d) => sum + (d.input_tokens || 0) + (d.output_tokens || 0),
    0
  ) ?? 0;

  // Estimate storage in GB (rough estimate based on tokens)
  const estimatedStorageGb = (monthlyTokens / 1000000) * 0.004; // ~4KB per 1M tokens

  // Defaults for plan limits (in practice, these would come from a billing API)
  const limits = {
    cost: 2000,
    events: 100000,
    storage: 10,
  };

  const isLoading = isLoadingStats || isLoadingDaily;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[250px]" />
      </div>
    );
  }

  // Get current month name
  const currentMonth = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Billing & Usage</h2>
        <p className="text-sm text-muted-foreground">
          Monitor your usage and manage your subscription
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">Pro Plan</p>
              <p className="text-sm text-muted-foreground">$199/month</p>
            </div>
            <Badge variant="outline" className="text-success">
              Active
            </Badge>
          </div>
          <Separator />
          <div className="text-sm text-muted-foreground">
            <p>Current billing period: {currentMonth}</p>
          </div>
          <Button variant="outline">Manage Subscription</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Period Usage</CardTitle>
          <CardDescription>{currentMonth}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>API Costs</span>
              <span className="font-mono-display">
                ${(stats?.total_cost_usd ?? 0).toFixed(2)} / ${limits.cost}
              </span>
            </div>
            <Progress value={((stats?.total_cost_usd ?? 0) / limits.cost) * 100} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Events</span>
              <span className="font-mono-display">
                {monthlyEvents.toLocaleString()} / {limits.events.toLocaleString()}
              </span>
            </div>
            <Progress value={(monthlyEvents / limits.events) * 100} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Storage (estimated)</span>
              <span className="font-mono-display">
                {estimatedStorageGb.toFixed(2)} GB / {limits.storage} GB
              </span>
            </div>
            <Progress value={(estimatedStorageGb / limits.storage) * 100} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  'settings.create': 'Settings Created',
  'settings.update': 'Settings Updated',
  'settings.delete': 'Settings Deleted',
  'connector.create': 'Connector Created',
  'connector.update': 'Connector Updated',
  'connector.delete': 'Connector Deleted',
  'connector.test': 'Connector Tested',
  'connector.sync': 'Connector Synced',
  'member.invited': 'Member Invited',
  'member.role_changed': 'Role Changed',
  'member.removed': 'Member Removed',
  'impersonation.started': 'Impersonation Started',
  'impersonation.ended': 'Impersonation Ended',
};

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'settings.create', label: 'Settings Created' },
  { value: 'settings.update', label: 'Settings Updated' },
  { value: 'settings.delete', label: 'Settings Deleted' },
  { value: 'connector.create', label: 'Connector Created' },
  { value: 'connector.update', label: 'Connector Updated' },
  { value: 'connector.delete', label: 'Connector Deleted' },
  { value: 'connector.test', label: 'Connector Tested' },
  { value: 'connector.sync', label: 'Connector Synced' },
  { value: 'member.invited', label: 'Member Invited' },
  { value: 'member.role_changed', label: 'Role Changed' },
  { value: 'member.removed', label: 'Member Removed' },
  { value: 'impersonation.started', label: 'Impersonation Started' },
  { value: 'impersonation.ended', label: 'Impersonation Ended' },
];

function SecuritySettings() {
  const { currentOrg } = useOrg();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [actionFilter, setActionFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const activeFilters: AuditLogFilters = {
    page,
    per_page: 20,
    ...(filters.log_action ? { log_action: filters.log_action } : {}),
    ...(filters.from_date ? { from_date: filters.from_date } : {}),
    ...(filters.to_date ? { to_date: filters.to_date } : {}),
  };

  const { data, isLoading } = useOrganizationAuditLogs(currentOrg?.id || '', activeFilters);

  const logs = data?.data ?? [];
  const meta = data?.meta;

  const applyFilters = () => {
    setPage(1);
    setFilters({
      log_action: actionFilter !== 'all' ? actionFilter : undefined,
      from_date: fromDate || undefined,
      to_date: toDate || undefined,
    });
  };

  const clearFilters = () => {
    setActionFilter('all');
    setFromDate('');
    setToDate('');
    setPage(1);
    setFilters({});
  };

  const hasActiveFilters = !!(filters.log_action || filters.from_date || filters.to_date);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Security & Audit Log</h2>
        <p className="text-sm text-muted-foreground">
          Track all security-relevant actions taken within your organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="w-48">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                className="w-36"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                className="w-36"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={applyFilters}>
              <Search className="mr-1 size-3" />
              Apply
            </Button>
            {hasActiveFilters && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="mr-1 size-3" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Shield className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No audit log entries found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {log.actor ? (
                        <div>
                          <p className="text-sm font-medium">{log.actor.name || log.actor.email}</p>
                          {log.actor.name && (
                            <p className="text-xs text-muted-foreground">{log.actor.email}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action.startsWith('impersonation') ? 'destructive' : 'secondary'
                        }
                        className="text-xs"
                      >
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.resourceType ? (
                        <span className="text-muted-foreground">
                          {log.resourceType}
                          {log.resourceId && (
                            <span className="ml-1 font-mono text-xs opacity-60">
                              #{log.resourceId.slice(0, 8)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {log.ipAddress ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {meta && meta.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.current_page} of {meta.total_pages} ({meta.total_count} entries)
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= meta.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organization settings and preferences
        </p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full md:w-48 shrink-0">
          <SettingsNav />
        </aside>
        <div className="flex-1">
          <Routes>
            <Route index element={<GeneralSettings />} />
            <Route path="members" element={<Team />} />
            <Route path="policies" element={<PolicySettings />} />
            <Route path="alerts" element={<AlertSettings />} />
            <Route path="billing" element={<BillingSettings />} />
            <Route path="security" element={<SecuritySettings />} />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
