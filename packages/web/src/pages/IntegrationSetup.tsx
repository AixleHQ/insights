import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useOrg } from "@/contexts/OrgContext";
import { useCreateConnector, useUpdateConnector } from "@/hooks/useApi";
import { api, ApiError } from "@/lib/api";
import { ProviderLogo } from "@/components/icons";
import type { IntegrationProvider } from "@/components/integrations";
import { AppRoutes } from "@/lib/routes";

interface ProviderConfig {
  id: IntegrationProvider;
  name: string;
  displayName: string;
  description: string;
  features: string[];
  scopes: { name: string; description: string }[];
  requiresWebhook: boolean;
  requiresOAuth: boolean;
  multiInstance?: boolean;
}

const providers: Record<string, ProviderConfig> = {
  github: {
    id: "github",
    name: "github",
    displayName: "GitHub",
    description: "Connect your GitHub organization to track AI tool usage across repositories.",
    features: [
      "Repository activity monitoring",
      "Pull request AI suggestions tracking",
      "Copilot usage analytics",
      "Commit message analysis",
    ],
    scopes: [
      { name: "repo", description: "Access repository data and commits" },
      { name: "read:org", description: "Read organization membership" },
      { name: "admin:repo_hook", description: "Manage repository webhooks" },
    ],
    requiresWebhook: true,
    requiresOAuth: true,
    multiInstance: true,
  },
  gitlab: {
    id: "gitlab",
    name: "gitlab",
    displayName: "GitLab",
    description: "Connect your GitLab instance to monitor AI-assisted development.",
    features: [
      "Merge request tracking",
      "Pipeline AI suggestions",
      "Code review analytics",
      "Project activity monitoring",
    ],
    scopes: [
      { name: "api", description: "Full API access" },
      { name: "read_repository", description: "Read repository content" },
    ],
    requiresWebhook: true,
    requiresOAuth: true,
    multiInstance: true,
  },
  bitbucket: {
    id: "bitbucket",
    name: "bitbucket",
    displayName: "Bitbucket",
    description: "Connect Bitbucket Cloud or Server for complete visibility.",
    features: [
      "Pull request monitoring",
      "Repository insights",
      "Team activity tracking",
      "Code search analytics",
    ],
    scopes: [
      { name: "repository", description: "Read repository data" },
      { name: "pullrequest", description: "Access pull requests" },
    ],
    requiresWebhook: true,
    requiresOAuth: true,
    multiInstance: true,
  },
  jira: {
    id: "jira",
    name: "jira",
    displayName: "Jira",
    description: "Link Jira projects to correlate AI tool usage with issues.",
    features: [
      "Issue tracking integration",
      "Sprint AI metrics",
      "Worklog correlation",
      "Project analytics",
    ],
    scopes: [
      { name: "read:jira-work", description: "Read project and issue data" },
      { name: "write:jira-work", description: "Update issues with AI metadata" },
    ],
    requiresWebhook: false,
    requiresOAuth: true,
    multiInstance: true,
  },
  linear: {
    id: "linear",
    name: "linear",
    displayName: "Linear",
    description: "Connect Linear to track AI-assisted issue resolution.",
    features: [
      "Issue lifecycle tracking",
      "Team productivity insights",
      "Cycle analytics",
      "AI usage per project",
    ],
    scopes: [
      { name: "read", description: "Read workspace data" },
      { name: "issues:create", description: "Create issues for alerts" },
    ],
    requiresWebhook: true,
    requiresOAuth: true,
    multiInstance: true,
  },
  github_copilot: {
    id: "github_copilot",
    name: "github_copilot",
    displayName: "GitHub Copilot",
    description: "Connect GitHub Copilot to track real seat counts, acceptance rates, and daily active users via the GitHub Copilot Metrics API.",
    features: [
      "Daily usage sync from GitHub API",
      "Acceptance rate analytics",
      "Seat count tracking",
      "Active user breakdown",
    ],
    scopes: [
      { name: "manage_billing:copilot", description: "Access Copilot billing and usage data" },
      { name: "read:org", description: "Read organization membership to resolve your GitHub org" },
    ],
    requiresWebhook: false,
    requiresOAuth: true,
  },
  "claude-code": {
    id: "claude-code",
    name: "claude-code",
    displayName: "Claude Code",
    description: "Monitor Claude Code CLI sessions and AI usage.",
    features: [
      "Session tracking",
      "Token consumption analytics",
      "Code generation insights",
      "Project attribution",
    ],
    scopes: [
      { name: "telemetry", description: "Receive usage telemetry" },
    ],
    requiresWebhook: false,
    requiresOAuth: false,
  },
};

type SetupStep = "overview" | "authorize" | "configure" | "complete";

export function IntegrationSetup() {
  const { provider: providerKey } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { mutateAsync: createConnector } = useCreateConnector();
  const { mutateAsync: updateConnector } = useUpdateConnector();
  const isProcessingCallback = useRef(false);
  const oauthPopupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [step, setStep] = useState<SetupStep>("overview");
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectorId, setConnectorId] = useState<string | null>(null);
  const [config, setConfig] = useState({
    label: "",
    syncRepos: true,
    syncPRs: true,
  });

  const provider = providerKey ? providers[providerKey] : null;
  const isSourceControl = provider ? ["github", "gitlab", "bitbucket"].includes(provider.name) : false;

  // Clear popup poll on unmount to avoid state updates after component is gone
  useEffect(() => {
    return () => {
      if (oauthPopupPollRef.current) clearInterval(oauthPopupPollRef.current);
    };
  }, []);

  // Listen for OAuth callback messages
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "integration_oauth_callback") return;

      // Popup completed (success or error) — stop polling for manual close
      if (oauthPopupPollRef.current) {
        clearInterval(oauthPopupPollRef.current);
        oauthPopupPollRef.current = null;
      }

      const { code, error: oauthError } = event.data;

      if (oauthError) {
        setError(`Authorization failed: ${oauthError}`);
        setIsAuthorizing(false);
        return;
      }

      if (code && currentOrg && provider) {
        if (isProcessingCallback.current) return;
        isProcessingCallback.current = true;

        try {
          const result = await createConnector({
            orgId: currentOrg.id,
            code,
            connectorType: provider.name,
            ...(config.label.trim() ? { label: config.label.trim() } : {}),
          });
          const created = result.data;
          setConnectorId(created.id);
          if (created.syncRepositories !== undefined) {
            setConfig((prev) => ({
              ...prev,
              syncRepos: created.syncRepositories ?? true,
              syncPRs: created.syncPullRequests ?? true,
            }));
          }
          setError(null);
          setIsAuthorizing(false);
          setStep("configure");
        } catch {
          setError("Failed to complete authorization. Please try again.");
          setIsAuthorizing(false);
          isProcessingCallback.current = false;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [currentOrg, provider, createConnector, config.label]);

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Unknown integration</p>
        <Button asChild variant="link" className="mt-2">
          <Link to={AppRoutes.integrations.root}>
            <ArrowLeft className="mr-2 size-4" />
            Back to integrations
          </Link>
        </Button>
      </div>
    );
  }

  const handleAuthorize = async () => {
    if (!currentOrg) return;
    isProcessingCallback.current = false;
    setIsAuthorizing(true);
    setError(null);

    // Clear any previous popup poll
    if (oauthPopupPollRef.current) {
      clearInterval(oauthPopupPollRef.current);
      oauthPopupPollRef.current = null;
    }

    // Open popup synchronously within the user gesture context.
    // Browsers block window.open() called after an await, so we open
    // a blank popup first and navigate it to the auth URL once obtained.
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popup = window.open(
      "about:blank",
      "oauth_popup",
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      setError("A popup window was blocked. Please allow popups for this site and try again.");
      setIsAuthorizing(false);
      return;
    }

    try {
      // Get authorization URL from API
      const response = await api.get<{ data: { authorize_url: string } }>(
        `/organizations/${currentOrg.id}/connectors/authorize/${provider.name}`
      );
      const authUrl = response.data.authorize_url;

      // Navigate the already-open popup to the authorization URL
      popup.location.href = authUrl;

      // Poll so that closing the popup without completing OAuth resets the button
      oauthPopupPollRef.current = setInterval(() => {
        if (popup.closed) {
          clearInterval(oauthPopupPollRef.current!);
          oauthPopupPollRef.current = null;
          setIsAuthorizing(false);
        }
      }, 500);
    } catch (err) {
      popup.close();
      const isNotConfigured =
        err instanceof ApiError &&
        (err.data as { code?: string })?.code === "integration_not_configured";
      setError(
        isNotConfigured
          ? "This integration is not available in this environment. Please contact your administrator."
          : "Failed to start authorization. Please try again."
      );
      setIsAuthorizing(false);
    }
  };

  const handleSkipOAuth = () => {
    // For providers that don't require OAuth (like claude-code)
    setStep("configure");
  };

  const handleConnect = async () => {
    if (!currentOrg) return;
    setIsConnecting(true);
    setError(null);

    try {
      if (isSourceControl) {
        if (!connectorId) {
          setError("Failed to complete setup. Missing connector identifier.");
          return;
        }

        await updateConnector({
          orgId: currentOrg.id,
          connectorId,
          data: {
            config: {
              sync_repositories: config.syncRepos,
              sync_pull_requests: config.syncPRs,
            },
          },
        });
      }
      setStep("complete");
    } catch {
      setError("Failed to complete setup. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleFinish = () => {
    navigate(AppRoutes.integrations.root);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to={AppRoutes.integrations.root}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <ProviderLogo provider={provider.id} size="lg" showBackground />
          <div>
            <h1 className="text-xl font-semibold">Connect {provider.displayName}</h1>
            <p className="text-sm text-muted-foreground">Step-by-step setup wizard</p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {(["overview", "authorize", "configure", "complete"] as SetupStep[]).map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : ["overview", "authorize", "configure", "complete"].indexOf(step) > i
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {["overview", "authorize", "configure", "complete"].indexOf(step) > i ? (
                <Check className="size-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && (
              <div
                className={`mx-2 h-0.5 w-8 transition-colors ${
                  ["overview", "authorize", "configure", "complete"].indexOf(step) > i
                    ? "bg-primary"
                    : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step Content */}
      {step === "overview" && (
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

            {provider.requiresOAuth && (
              <>
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
              </>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep("authorize")}>
                Continue
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "authorize" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {provider.requiresOAuth ? "Authorize Access" : "Configuration"}
            </CardTitle>
            <CardDescription>
              {provider.requiresOAuth
                ? `You'll be redirected to ${provider.displayName} to grant access to your account.`
                : `Configure ${provider.displayName} integration settings.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {provider.requiresOAuth ? (
              <>
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <div className="mx-auto mb-4">
                    <ProviderLogo provider={provider.id} size="lg" showBackground />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    DB90 will request read-only access to monitor AI tool activity.
                    <br />
                    We never store your credentials.
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="oauth-label">Label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="oauth-label"
                    type="text"
                    placeholder="e.g. Work org, Personal account"
                    value={config.label}
                    onChange={(e) => setConfig({ ...config, label: e.target.value })}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional display name for this connection.
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
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This integration doesn't require OAuth. You can proceed to configure it.
                </p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("overview")}>
                <ArrowLeft className="mr-2 size-4" />
                Back
              </Button>
              <Button
                onClick={provider.requiresOAuth ? handleAuthorize : handleSkipOAuth}
                disabled={isAuthorizing}
              >
                {isAuthorizing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Authorizing...
                  </>
                ) : provider.requiresOAuth ? (
                  <>
                    Authorize with {provider.displayName}
                    <ExternalLink className="ml-2 size-4" />
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "configure" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configure Integration</CardTitle>
            <CardDescription>
              Customize how DB90 syncs with {provider.displayName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isSourceControl ? (
              <>
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

                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your {provider.displayName} integration is ready to activate. Click Connect to complete the setup.
              </p>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep("authorize")}>
                <ArrowLeft className="mr-2 size-4" />
                Back
              </Button>
              <div className="flex flex-col items-end gap-1">
                {isSourceControl && !config.syncRepos && !config.syncPRs && (
                  <p className="text-xs text-muted-foreground">
                    Enable at least one sync option
                  </p>
                )}
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || (isSourceControl && !config.syncRepos && !config.syncPRs)}
                >
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
            </div>
          </CardContent>
        </Card>
      )}

      {step === "complete" && (
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
                <Link to={AppRoutes.integrations.root}>View All Integrations</Link>
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