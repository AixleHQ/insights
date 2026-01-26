import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Github,
  Loader2,
  Shield,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

interface ProviderConfig {
  name: string;
  displayName: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  features: string[];
  scopes: { name: string; description: string }[];
  requiresWebhook: boolean;
}

const providers: Record<string, ProviderConfig> = {
  github: {
    name: 'github',
    displayName: 'GitHub',
    icon: <Github className="size-6" />,
    color: 'bg-[#24292f]',
    description: 'Connect your GitHub organization to track AI tool usage across repositories.',
    features: [
      'Repository activity monitoring',
      'Pull request AI suggestions tracking',
      'Copilot usage analytics',
      'Commit message analysis',
    ],
    scopes: [
      { name: 'repo', description: 'Access repository data and commits' },
      { name: 'read:org', description: 'Read organization membership' },
      { name: 'admin:repo_hook', description: 'Manage repository webhooks' },
    ],
    requiresWebhook: true,
  },
  gitlab: {
    name: 'gitlab',
    displayName: 'GitLab',
    icon: (
      <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
      </svg>
    ),
    color: 'bg-[#fc6d26]',
    description: 'Connect your GitLab instance to monitor AI-assisted development.',
    features: [
      'Merge request tracking',
      'Pipeline AI suggestions',
      'Code review analytics',
      'Project activity monitoring',
    ],
    scopes: [
      { name: 'api', description: 'Full API access' },
      { name: 'read_repository', description: 'Read repository content' },
    ],
    requiresWebhook: true,
  },
  bitbucket: {
    name: 'bitbucket',
    displayName: 'Bitbucket',
    icon: (
      <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M.778 1.213a.768.768 0 0 0-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 0 0 .77-.646l3.27-20.03a.768.768 0 0 0-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z" />
      </svg>
    ),
    color: 'bg-[#0052cc]',
    description: 'Connect Bitbucket Cloud or Server for complete visibility.',
    features: [
      'Pull request monitoring',
      'Repository insights',
      'Team activity tracking',
      'Code search analytics',
    ],
    scopes: [
      { name: 'repository', description: 'Read repository data' },
      { name: 'pullrequest', description: 'Access pull requests' },
    ],
    requiresWebhook: true,
  },
  jira: {
    name: 'jira',
    displayName: 'Jira',
    icon: (
      <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0z" />
      </svg>
    ),
    color: 'bg-[#0052cc]',
    description: 'Link Jira projects to correlate AI tool usage with issues.',
    features: [
      'Issue tracking integration',
      'Sprint AI metrics',
      'Worklog correlation',
      'Project analytics',
    ],
    scopes: [
      { name: 'read:jira-work', description: 'Read project and issue data' },
      { name: 'write:jira-work', description: 'Update issues with AI metadata' },
    ],
    requiresWebhook: false,
  },
  linear: {
    name: 'linear',
    displayName: 'Linear',
    icon: (
      <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3.025 9.213A9.028 9.028 0 0 1 9.213 3.025l-1.186-1.186A11.035 11.035 0 0 0 1.839 8.027l1.186 1.186zm-.997 3.349a9.027 9.027 0 0 0 2.456 5.961l8.466-8.466A9.023 9.023 0 0 0 7.013 7.61l-4.985 4.952zM5.898 20a9.025 9.025 0 0 0 5.89 2.028l-1.186-1.186A7.033 7.033 0 0 1 7.085 18.8L5.898 20zm8.39 1.972A11.033 11.033 0 0 0 22.16 15.16l-1.186-1.186a9.024 9.024 0 0 1-5.5 5.813l-.186.185z" />
      </svg>
    ),
    color: 'bg-[#5e6ad2]',
    description: 'Connect Linear to track AI-assisted issue resolution.',
    features: [
      'Issue lifecycle tracking',
      'Team productivity insights',
      'Cycle analytics',
      'AI usage per project',
    ],
    scopes: [
      { name: 'read', description: 'Read workspace data' },
      { name: 'issues:create', description: 'Create issues for alerts' },
    ],
    requiresWebhook: true,
  },
};

type SetupStep = 'overview' | 'authorize' | 'configure' | 'complete';

export function ConnectorSetup() {
  const { provider: providerKey } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<SetupStep>('overview');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [config, setConfig] = useState({
    name: '',
    syncRepos: true,
    syncPRs: true,
    webhookEnabled: true,
    selectedProjects: [] as string[],
  });

  const provider = providerKey ? providers[providerKey] : null;

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Unknown provider</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/connectors">
            <ArrowLeft className="mr-2 size-4" />
            Back to connectors
          </Link>
        </Button>
      </div>
    );
  }

  const handleAuthorize = async () => {
    setIsAuthorizing(true);
    // Simulate OAuth redirect
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsAuthorizing(false);
    setStep('configure');
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsConnecting(false);
    setStep('complete');
  };

  const handleFinish = () => {
    navigate('/connectors');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to="/connectors">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className={`flex size-10 items-center justify-center rounded-lg text-white ${provider.color}`}>
            {provider.icon}
          </div>
          <div>
            <h1 className="text-xl font-semibold">Connect {provider.displayName}</h1>
            <p className="text-sm text-muted-foreground">Step-by-step setup wizard</p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {(['overview', 'authorize', 'configure', 'complete'] as SetupStep[]).map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : ['overview', 'authorize', 'configure', 'complete'].indexOf(step) > i
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {['overview', 'authorize', 'configure', 'complete'].indexOf(step) > i ? (
                <Check className="size-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && (
              <div
                className={`mx-2 h-0.5 w-8 transition-colors ${
                  ['overview', 'authorize', 'configure', 'complete'].indexOf(step) > i
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 'overview' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Overview</CardTitle>
            <CardDescription>{provider.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">Features</h3>
              <div className="grid gap-2">
                {provider.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm">
                    <Zap className="size-4 text-primary" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Shield className="size-4" />
                Required Permissions
              </h3>
              <div className="space-y-2">
                {provider.scopes.map((scope) => (
                  <div key={scope.name} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {scope.name}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{scope.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep('authorize')}>
                Continue
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'authorize' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Authorize Access</CardTitle>
            <CardDescription>
              You'll be redirected to {provider.displayName} to grant access to your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <div className={`mx-auto mb-4 flex size-16 items-center justify-center rounded-xl text-white ${provider.color}`}>
                {provider.icon}
              </div>
              <p className="text-sm text-muted-foreground">
                DB90 will request read-only access to monitor AI tool activity.
                <br />
                We never store your credentials.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <span className="text-sm">Secure OAuth 2.0 authorization</span>
              </div>
              <a
                href="#"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Learn more
                <ExternalLink className="size-3" />
              </a>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('overview')}>
                <ArrowLeft className="mr-2 size-4" />
                Back
              </Button>
              <Button onClick={handleAuthorize} disabled={isAuthorizing}>
                {isAuthorizing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Authorizing...
                  </>
                ) : (
                  <>
                    Authorize with {provider.displayName}
                    <ExternalLink className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'configure' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configure Integration</CardTitle>
            <CardDescription>
              Customize how DB90 syncs with {provider.displayName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Connection Name</Label>
              <Input
                id="name"
                placeholder={`My ${provider.displayName} Connection`}
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                A friendly name to identify this connection
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-medium">Sync Options</h3>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Sync Repositories</Label>
                  <p className="text-xs text-muted-foreground">
                    Import repository metadata and activity
                  </p>
                </div>
                <Switch
                  checked={config.syncRepos}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, syncRepos: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Sync Pull Requests / MRs</Label>
                  <p className="text-xs text-muted-foreground">
                    Track AI-assisted code changes
                  </p>
                </div>
                <Switch
                  checked={config.syncPRs}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, syncPRs: checked })
                  }
                />
              </div>

              {provider.requiresWebhook && (
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Webhooks</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive real-time updates (recommended)
                    </p>
                  </div>
                  <Switch
                    checked={config.webhookEnabled}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, webhookEnabled: checked })
                    }
                  />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Link to Project</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api-gateway">api-gateway</SelectItem>
                  <SelectItem value="web-dashboard">web-dashboard</SelectItem>
                  <SelectItem value="mobile-app">mobile-app</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optionally link this connector to a specific project
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('authorize')}>
                <ArrowLeft className="mr-2 size-4" />
                Back
              </Button>
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'complete' && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Check className="size-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Connection Successful!</h2>
            <p className="mt-2 text-muted-foreground">
              Your {provider.displayName} account is now connected to DB90.
            </p>
            <div className="mt-6 rounded-lg bg-muted/50 p-4">
              <p className="text-sm">
                Initial sync will begin shortly. You'll see data appear in your dashboard
                within a few minutes.
              </p>
            </div>
            <div className="mt-8 flex justify-center gap-4">
              <Button variant="outline" asChild>
                <Link to={`/connectors`}>View All Connectors</Link>
              </Button>
              <Button onClick={handleFinish}>
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
