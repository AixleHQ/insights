import { useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import {
  Building2,
  Shield,
  Bell,
  CreditCard,
  Loader2,
  Save,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useOrganization, useUpdateOrganization, useRetentionPolicy, useUpdateRetentionPolicy } from '@/hooks/useApi';
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
import { cn } from '@/lib/utils';

const navItems = [
  { title: 'General', href: '/settings', icon: Building2 },
  { title: 'Policies', href: '/settings/policies', icon: Shield },
  { title: 'Alerts', href: '/settings/alerts', icon: Bell },
  { title: 'Billing', href: '/settings/billing', icon: CreditCard },
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
  const updateOrg = useUpdateOrganization();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Update form when org data loads
  useState(() => {
    if (org) {
      setFormData({
        name: org.name || '',
        slug: org.slug || '',
        description: '',
      });
    }
  });

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

  if (isLoading) {
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
    </div>
  );
}

function PolicySettings() {
  const { currentOrg } = useOrg();
  const { data: retentionPolicy, isLoading } = useRetentionPolicy(currentOrg?.id || '');
  const updateRetention = useUpdateRetentionPolicy();

  const [policies, setPolicies] = useState({
    sanitizeApiKeys: true,
    sanitizeSecrets: true,
    sanitizeEmails: false,
    sanitizeIps: false,
    blockHighRisk: true,
    requireReview: false,
  });

  const togglePolicy = (key: keyof typeof policies) => {
    setPolicies((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRetentionChange = async (field: string, value: string) => {
    if (!currentOrg) return;
    try {
      await updateRetention.mutateAsync({
        orgId: currentOrg.id,
        data: { [field]: value },
      });
    } catch (error) {
      console.error('Failed to update retention:', error);
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
              <Label>Raw Content</Label>
              <Select
                value={retentionPolicy?.raw_content_retention || '30_days'}
                onValueChange={(value) => handleRetentionChange('raw_content_retention', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7_days">7 days</SelectItem>
                  <SelectItem value="30_days">30 days</SelectItem>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="1_year">1 year</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sanitized Content</Label>
              <Select
                value={retentionPolicy?.sanitized_content_retention || '90_days'}
                onValueChange={(value) => handleRetentionChange('sanitized_content_retention', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7_days">7 days</SelectItem>
                  <SelectItem value="30_days">30 days</SelectItem>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="1_year">1 year</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metadata</Label>
              <Select
                value={retentionPolicy?.metadata_retention || '1_year'}
                onValueChange={(value) => handleRetentionChange('metadata_retention', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30_days">30 days</SelectItem>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="1_year">1 year</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Audit Logs</Label>
              <Select
                value={retentionPolicy?.audit_log_retention || '1_year'}
                onValueChange={(value) => handleRetentionChange('audit_log_retention', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90_days">90 days</SelectItem>
                  <SelectItem value="1_year">1 year</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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

function AlertSettings() {
  const [alerts, setAlerts] = useState({
    costDaily: 500,
    costMonthly: 5000,
    riskCritical: true,
    riskHigh: true,
    usageSpike: true,
    emailNotifications: true,
    slackNotifications: false,
  });

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
              value={alerts.costDaily}
              onChange={(e) =>
                setAlerts({ ...alerts, costDaily: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="costMonthly">Monthly Cost Limit (USD)</Label>
            <Input
              id="costMonthly"
              type="number"
              value={alerts.costMonthly}
              onChange={(e) =>
                setAlerts({ ...alerts, costMonthly: Number(e.target.value) })
              }
            />
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
              checked={alerts.riskCritical}
              onCheckedChange={(checked) =>
                setAlerts({ ...alerts, riskCritical: checked })
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
              checked={alerts.riskHigh}
              onCheckedChange={(checked) =>
                setAlerts({ ...alerts, riskHigh: checked })
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
              checked={alerts.usageSpike}
              onCheckedChange={(checked) =>
                setAlerts({ ...alerts, usageSpike: checked })
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
              checked={alerts.emailNotifications}
              onCheckedChange={(checked) =>
                setAlerts({ ...alerts, emailNotifications: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Slack Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Post alerts to a Slack channel
              </p>
            </div>
            <Switch
              checked={alerts.slackNotifications}
              onCheckedChange={(checked) =>
                setAlerts({ ...alerts, slackNotifications: checked })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BillingSettings() {
  const usage = {
    currentCost: 847.52,
    limit: 2000,
    events: 45623,
    eventsLimit: 100000,
    storage: 2.4,
    storageLimit: 10,
  };

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
            <p>Next billing date: February 1, 2026</p>
          </div>
          <Button variant="outline">Manage Subscription</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Period Usage</CardTitle>
          <CardDescription>January 1 - January 31, 2026</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>API Costs</span>
              <span className="font-mono-display">
                ${usage.currentCost.toFixed(2)} / ${usage.limit}
              </span>
            </div>
            <Progress value={(usage.currentCost / usage.limit) * 100} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Events</span>
              <span className="font-mono-display">
                {usage.events.toLocaleString()} / {usage.eventsLimit.toLocaleString()}
              </span>
            </div>
            <Progress value={(usage.events / usage.eventsLimit) * 100} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Storage</span>
              <span className="font-mono-display">
                {usage.storage} GB / {usage.storageLimit} GB
              </span>
            </div>
            <Progress value={(usage.storage / usage.storageLimit) * 100} />
          </div>
        </CardContent>
      </Card>
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
            <Route path="policies" element={<PolicySettings />} />
            <Route path="alerts" element={<AlertSettings />} />
            <Route path="billing" element={<BillingSettings />} />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
