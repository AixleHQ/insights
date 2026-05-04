import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import {
  useConnectors,
  useSyncConnector,
  useDeleteConnector,
  useTestConnector,
  useToolAccounts,
  useDeleteToolAccount,
  useRegenerateIngestToken,
} from "@/hooks/useApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IntegrationCard,
  type IntegrationData,
  type IntegrationProvider,
  type ProviderInfo,
} from "@/components/integrations";
import type { ConnectorStatus } from "@/lib/types";
import type { IntegrationScope } from "@/components/integrations";
import { ApiKeyConnectSheet } from "@/components/integrations/ApiKeyConnectSheet";
import { OrgSlackConnectSheet } from "@/components/integrations/OrgSlackConnectSheet";
import { IngestTokenConnectSheet } from "@/components/integrations/IngestTokenConnectSheet";
import { OpenrouterWebhookSheet } from "@/components/integrations/OpenrouterWebhookSheet";

const AI_PROVIDERS = new Set(["anthropic", "openai", "openrouter", "gemini"]);
const SLACK_PROVIDERS = new Set(["slack"]);
const INGEST_PROVIDERS = new Set(["cursor", "claude-code"]);

const TOOL_NAME_TO_PROVIDER: Record<string, IntegrationProvider> = {
  cursor: "cursor",
  claude_code: "claude-code",
};

const availableProviders: ProviderInfo[] = [
  // Code Hosting / Version Control
  {
    id: "github",
    name: "GitHub",
    description: "Connect repositories, pull requests, and commits",
    category: "code",
    scope: "project",
    features: [
      "Repository tracking",
      "Pull request events",
      "Commit monitoring",
      "Copilot usage analytics",
    ],
    available: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Connect projects, merge requests, and pipelines",
    category: "code",
    scope: "project",
    features: [
      "Project tracking",
      "Merge request events",
      "Pipeline monitoring",
      "CI/CD analytics",
    ],
    available: true,
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    description: "Connect workspaces, repositories, pull requests, and pipelines",
    category: "code",
    scope: "project",
    features: [
      "Workspace sync",
      "Repository tracking",
      "Pull request events",
      "Commit monitoring",
      "Pipeline monitoring",
    ],
    available: true,
  },

  // Project Management
  {
    id: "jira",
    name: "Jira",
    description: "Connect issues and projects for context",
    category: "project",
    scope: "org",
    features: ["Issue tracking", "Project context", "Sprint monitoring"],
    available: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Connect teams, projects, issues, and cycles",
    category: "project",
    scope: "org",
    features: ["Team sync", "Project context", "Issue throughput", "Cycle monitoring"],
    available: true,
  },

  // AI / LLM Providers
  {
    id: "claude",
    name: "Claude",
    description: "Track Claude API usage and conversations",
    category: "ai",
    scope: "org",
    features: [
      "API usage tracking",
      "Token consumption",
      "Cost analytics",
      "Model usage breakdown",
    ],
    available: false,
    comingSoon: true,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Monitor Claude Code CLI usage",
    category: "ai",
    scope: "persona",
    features: [
      "Session tracking",
      "Code generation analytics",
      "Token consumption",
      "Project-level insights",
    ],
    available: true,
  },
  {
    id: "anthropic",
    name: "Anthropic API",
    description: "Direct Anthropic API integration 2",
    category: "ai",
    scope: "org",
    features: [
      "API key management",
      "Usage monitoring",
      "Cost tracking",
      "Rate limit visibility",
    ],
    available: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Track OpenAI API usage and costs",
    category: "ai",
    scope: "org",
    features: [
      "API usage tracking",
      "GPT model analytics",
      "Token consumption",
      "Cost breakdown",
    ],
    available: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Multi-model AI gateway tracking",
    category: "ai",
    scope: "org",
    features: [
      "Multi-provider analytics",
      "Model comparison",
      "Cost optimization",
      "Usage patterns",
    ],
    available: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Track Google Gemini API usage and costs",
    category: "ai",
    scope: "org",
    features: [
      "API usage tracking",
      "Model analytics",
      "Token consumption",
      "Cost breakdown",
    ],
    available: true,
  },
  {
    id: "github_copilot",
    name: "GitHub Copilot",
    description: "Track real Copilot seat counts, suggestion acceptance rates, and daily active users via the GitHub API",
    category: "ai",
    scope: "org",
    features: [
      "Seat count & active users",
      "Acceptance rate tracking",
      "Lines suggested vs accepted",
      "Daily sync from GitHub API",
    ],
    available: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Monitor Cursor IDE AI usage",
    category: "ai",
    scope: "persona",
    features: [
      "AI completions tracking",
      "Chat usage analytics",
      "Token consumption",
      "Session insights",
    ],
    available: true,
  },

  // Design
  {
    id: "figma",
    name: "Figma",
    description: "Track AI features in Figma",
    category: "design",
    scope: "org",
    features: [
      "AI plugin usage",
      "Design generation",
      "Collaboration insights",
    ],
    available: false,
    comingSoon: true,
  },

  // Communication
  {
    id: "slack",
    name: "Slack",
    description: "Receive alerts and notifications",
    category: "communication",
    scope: "org",
    features: ["Alert notifications", "Usage summaries", "Bot commands"],
    available: true,
  },
];

const categoryLabels: Record<ProviderInfo["category"], string> = {
  code: "Code Hosting",
  project: "Project Management",
  ai: "AI Tools",
  design: "Design",
  communication: "Communication",
};

function IntegrationSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

export function Integrations() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const { status } = useParams<{ status: string }>();

  const { data: connectorsData, isLoading: connectorsLoading } = useConnectors(
    currentOrg?.id || "",
  );
  const { data: toolAccountsData, isLoading: toolAccountsLoading } = useToolAccounts(currentOrg?.id || "");
  const isLoading = connectorsLoading || toolAccountsLoading;
  const syncConnector = useSyncConnector();
  const deleteConnector = useDeleteConnector();
  const deleteToolAccount = useDeleteToolAccount();
  const testConnector = useTestConnector();
  const regenerateIngestToken = useRegenerateIngestToken();

  const activeTab = status === "available" ? "available" : "connected";
  const [scopeFilter, setScopeFilter] = useState<IntegrationScope | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connectingProvider, setConnectingProvider] =
    useState<ProviderInfo | null>(null);
  const [slackSheetOpen, setSlackSheetOpen] = useState(false);
  const [ingestSheetOpen, setIngestSheetOpen] = useState(false);
  const [ingestProvider, setIngestProvider] = useState<ProviderInfo | null>(null);
  const [regeneratedToken, setRegeneratedToken] = useState<string | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(null);
  const [webhookSheetOpen, setWebhookSheetOpen] = useState(false);
  const [webhookSheetData, setWebhookSheetData] = useState<{
    connectorId: string;
    webhookActive: boolean;
    webhookToken?: string;
    webhookSecretSet?: boolean;
  } | null>(null);

  const handleConnectSuccess = () => navigate("/integrations/connected");

  // Transform API response to component format
  const { integrations, ingestAccountIds } = useMemo(() => {
    const connectorIntegrations: IntegrationData[] = (connectorsData ?? []).map((c) => {
      const connectorType = c.connectorType || c.connector_type || "github";
      const lastError = c.lastError || c.last_error;
      const externalAccountName =
        c.externalAccountName || c.external_account_name;
      const lastSyncAt = c.lastSyncAt || c.last_sync_at;
      const lastEventAt = c.lastEventAt || c.last_event_at;
      const repositoryCount = c.repositoryCount || c.repository_count || 0;
      const syncedEventCount = c.syncedEventCount || c.synced_event_count || 0;
      const providerInfo = availableProviders.find((p) => p.id === connectorType);

      return {
        id: c.id,
        provider: connectorType as IntegrationProvider,
        name: externalAccountName || providerInfo?.name || connectorType,
        status: c.status as ConnectorStatus,
        last_sync_at: lastSyncAt || undefined,
        last_event_at: lastEventAt || undefined,
        sync_error: lastError || undefined,
        metadata: {
          account_name: externalAccountName || "",
          resources_count: repositoryCount,
          event_count: syncedEventCount,
        },
        copilotConnector: c.copilotConnector,
        seatCount: c.seatCount,
        activeUsersCount: c.activeUsersCount,
        webhookActive: connectorType === "openrouter" ? (c.webhookActive ?? false) : undefined,
        webhookToken: connectorType === "openrouter" ? c.webhookToken : undefined,
        webhookSecretSet: connectorType === "openrouter" ? (c.webhookSecretSet ?? false) : undefined,
        scope: (c.scope as IntegrationScope) ?? "org",
      };
    });

    const ingestIds = new Set<string>();
    const ingestIntegrations: IntegrationData[] = (toolAccountsData ?? [])
      .filter((a) => TOOL_NAME_TO_PROVIDER[a.toolName])
      .map((a) => {
        ingestIds.add(a.id);
        const provider = TOOL_NAME_TO_PROVIDER[a.toolName];
        const providerInfo = availableProviders.find((p) => p.id === provider);
        return {
          id: a.id,
          provider,
          name: providerInfo?.name ?? a.toolName,
          status: (a.isActive ? "connected" : "disconnected") as ConnectorStatus,
          scope: "persona" as IntegrationScope,
        };
      });

    return {
      integrations: [...connectorIntegrations, ...ingestIntegrations],
      ingestAccountIds: ingestIds,
    };
  }, [connectorsData, toolAccountsData]);

  const handleConnect = (providerId: string) => {
    if (INGEST_PROVIDERS.has(providerId)) {
      setIngestProvider(availableProviders.find((p) => p.id === providerId) ?? null);
      setIngestSheetOpen(true);
    } else if (AI_PROVIDERS.has(providerId)) {
      const provider = availableProviders.find((p) => p.id === providerId) ?? null;
      setConnectingProvider(provider);
      setSheetOpen(true);
    } else if (SLACK_PROVIDERS.has(providerId)) {
      setSlackSheetOpen(true);
    } else {
      navigate(`/integrations/new/${providerId}`);
    }
  };

  const handleSync = async (id: string) => {
    if (!currentOrg) return;
    try {
      await syncConnector.mutateAsync({
        orgId: currentOrg.id,
        connectorId: id,
      });
    } catch (error) {
      console.error("Failed to sync integration:", error);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!currentOrg) return;
    if (
      window.confirm("Are you sure you want to disconnect this integration?")
    ) {
      try {
        if (ingestAccountIds.has(id)) {
          await deleteToolAccount.mutateAsync({ orgId: currentOrg.id, accountId: id });
        } else {
          await deleteConnector.mutateAsync({ orgId: currentOrg.id, connectorId: id });
        }
      } catch (error) {
        console.error("Failed to disconnect integration:", error);
      }
    }
  };

  const handleTest = async (id: string) => {
    if (!currentOrg) return;
    setTestingConnectorId(id);
    try {
      await testConnector.mutateAsync({
        orgId: currentOrg.id,
        connectorId: id,
      });
    } catch (error) {
      console.error("Failed to test connector:", error);
    } finally {
      setTestingConnectorId(null);
    }
  };

  const handleRegenerateToken = async (id: string) => {
    if (!currentOrg) return;
    setRegenerateError(null);
    try {
      const result = await regenerateIngestToken.mutateAsync({ orgId: currentOrg.id, accountId: id });
      const newToken = result.data.ingestToken ?? null;
      const integration = integrations.find((i) => i.id === id);
      const provider = integration
        ? availableProviders.find((p) => p.id === integration.provider) ?? null
        : null;
      setRegeneratedToken(newToken);
      setIngestProvider(provider);
      setIngestSheetOpen(true);
    } catch (error) {
      console.error("Failed to regenerate token:", error);
      setRegenerateError(error instanceof Error ? error.message : "Failed to regenerate token. Please try again.");
    }
  };

  const handleSetupWebhook = (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;
    setWebhookSheetData({
      connectorId: id,
      webhookActive: integration.webhookActive ?? false,
      webhookToken: integration.webhookToken,
      webhookSecretSet: integration.webhookSecretSet,
    });
    setWebhookSheetOpen(true);
  };

  // Filtered integrations by scope
  const filteredIntegrations = scopeFilter === "all"
    ? integrations
    : integrations.filter((i) => i.scope === scopeFilter);

  // Scope counts for filter pills
  const scopeCounts = useMemo(() => ({
    org: integrations.filter((i) => i.scope === "org").length,
    project: integrations.filter((i) => i.scope === "project").length,
    persona: integrations.filter((i) => i.scope === "persona").length,
  }), [integrations]);

  // Get providers that are already connected
  const connectedProviders = new Set(integrations.map((c) => c.provider));

  // Filter available providers to show only those not connected
  const unconnectedProviders = availableProviders.filter(
    (p) => !connectedProviders.has(p.id),
  );

  // Group unconnected providers by category
  const providersByCategory = useMemo(() => {
    const grouped: Record<ProviderInfo["category"], ProviderInfo[]> = {
      code: [],
      project: [],
      ai: [],
      design: [],
      communication: [],
    };
    unconnectedProviders.forEach((p) => {
      grouped[p.category].push(p);
    });
    return grouped;
  }, [unconnectedProviders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect external services to sync repositories, track AI usage, and
          more
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => navigate(`/integrations/${value}`)}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="connected">
            Connected ({filteredIntegrations.length})
          </TabsTrigger>
          <TabsTrigger value="available">
            Available ({unconnectedProviders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connected" className="space-y-4">
          {regenerateError && (
            <p className="text-sm text-destructive">{regenerateError}</p>
          )}
          {!isLoading && integrations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(["all", "org", "project", "persona"] as const).map((s) => {
                const label = s === "all" ? "All" : s === "org" ? "Org" : s === "project" ? "Project" : "Personal";
                const count = s === "all" ? integrations.length : scopeCounts[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScopeFilter(s)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      scopeFilter === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                      scopeFilter === s ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <IntegrationSkeleton key={i} />
              ))}
            </div>
          ) : integrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <p className="text-muted-foreground">
                No integrations configured
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect a service to get started
              </p>
            </div>
          ) : filteredIntegrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
              <p className="text-muted-foreground text-sm">
                No integrations in this scope
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onSync={ingestAccountIds.has(integration.id) || 
                    integration.provider === "slack" ? undefined : handleSync
                  }
                  onTest={ingestAccountIds.has(integration.id) ? undefined : handleTest}
                  onDisconnect={handleDisconnect}
                  onRegenerateToken={ingestAccountIds.has(integration.id) ? handleRegenerateToken : undefined}
                  onSetupWebhook={integration.provider === "openrouter" ? handleSetupWebhook : undefined}
                  isTesting={testingConnectorId === integration.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-8">
          {Object.entries(providersByCategory).map(([category, providers]) => {
            if (providers.length === 0) return null;
            return (
              <div key={category} className="space-y-4">
                <h2 className="text-lg font-medium">
                  {categoryLabels[category as ProviderInfo["category"]]}
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {providers.map((provider) => (
                    <IntegrationCard
                      key={provider.id}
                      provider={provider}
                      onConnect={handleConnect}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>

      <ApiKeyConnectSheet
        provider={connectingProvider}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={handleConnectSuccess}
      />

      <OrgSlackConnectSheet
        open={slackSheetOpen}
        onOpenChange={setSlackSheetOpen}
        onSuccess={handleConnectSuccess}
      />

      <IngestTokenConnectSheet
        provider={ingestProvider}
        open={ingestSheetOpen}
        onOpenChange={(open) => {
          setIngestSheetOpen(open);
          if (!open) setRegeneratedToken(null);
        }}
        onSuccess={handleConnectSuccess}
        initialToken={regeneratedToken ?? undefined}
      />

      {webhookSheetData && (
        <OpenrouterWebhookSheet
          open={webhookSheetOpen}
          onOpenChange={setWebhookSheetOpen}
          connectorId={webhookSheetData.connectorId}
          webhookActive={webhookSheetData.webhookActive}
          webhookToken={webhookSheetData.webhookToken}
          webhookSecretSet={webhookSheetData.webhookSecretSet}
        />
      )}
    </div>
  );
}
