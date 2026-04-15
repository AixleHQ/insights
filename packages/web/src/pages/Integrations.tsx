import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import {
  useConnectors,
  useSyncConnector,
  useDeleteConnector,
  useTestConnector,
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
import { ApiKeyConnectSheet } from "@/components/integrations/ApiKeyConnectSheet";
import { OrgSlackConnectSheet } from "@/components/integrations/OrgSlackConnectSheet";
import { IngestTokenConnectSheet } from "@/components/integrations/IngestTokenConnectSheet";

const AI_PROVIDERS = new Set(["anthropic", "openai", "openrouter", "gemini"]);
const SLACK_PROVIDERS = new Set(["slack"]);
const INGEST_PROVIDERS = new Set(["cursor", "claude-code"]);

const availableProviders: ProviderInfo[] = [
  // Code Hosting / Version Control
  {
    id: "github",
    name: "GitHub",
    description: "Connect repositories, pull requests, and commits",
    category: "code",
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
    description: "Connect repositories and pull requests",
    category: "code",
    features: [
      "Repository tracking",
      "Pull request events",
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
    features: ["Issue tracking", "Project context", "Sprint monitoring"],
    available: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Connect issues and teams",
    category: "project",
    features: ["Issue tracking", "Team context", "Cycle monitoring"],
    available: true,
  },

  // AI / LLM Providers
  {
    id: "claude",
    name: "Claude",
    description: "Track Claude API usage and conversations",
    category: "ai",
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
    features: [
      "API usage tracking",
      "Model analytics",
      "Token consumption",
      "Cost breakdown",
    ],
    available: true,
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "Track Copilot suggestions and usage",
    category: "ai",
    features: [
      "Suggestion tracking",
      "Acceptance rates",
      "Language breakdown",
      "Developer productivity",
    ],
    available: false,
    comingSoon: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Monitor Cursor IDE AI usage",
    category: "ai",
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

  const { data: connectorsData, isLoading } = useConnectors(
    currentOrg?.id || "",
  );
  const syncConnector = useSyncConnector();
  const deleteConnector = useDeleteConnector();
  const testConnector = useTestConnector();

  const activeTab = status === "available" ? "available" : "connected";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connectingProvider, setConnectingProvider] =
    useState<ProviderInfo | null>(null);
  const [slackSheetOpen, setSlackSheetOpen] = useState(false);
  const [ingestSheetOpen, setIngestSheetOpen] = useState(false);
  const [ingestProvider, setIngestProvider] = useState<ProviderInfo | null>(null);
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(
    null,
  );

  const handleConnectSuccess = () => navigate("/integrations/connected");

  // Transform API response to component format
  const integrations: IntegrationData[] = useMemo(() => {
    if (!connectorsData) return [];
    return connectorsData.map((c) => {
      const connectorType = c.connectorType || c.connector_type || "github";
      const lastError = c.lastError || c.last_error;
      const externalAccountName =
        c.externalAccountName || c.external_account_name;
      const lastSyncAt = c.lastSyncAt || c.last_sync_at;

      const status: ConnectorStatus = c.status;

      return {
        id: c.id,
        provider: connectorType as IntegrationProvider,
        name: externalAccountName || connectorType,
        status,
        last_sync_at: lastSyncAt || undefined,
        sync_error: lastError || undefined,
        metadata: {
          account_name: externalAccountName || "",
          resources_count: 0,
        },
      };
    });
  }, [connectorsData]);

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
        await deleteConnector.mutateAsync({
          orgId: currentOrg.id,
          connectorId: id,
        });
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
            Connected ({integrations.length})
          </TabsTrigger>
          <TabsTrigger value="available">
            Available ({unconnectedProviders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connected" className="space-y-4">
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
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onSync={
                    integration.provider === "slack" ? undefined : handleSync
                  }
                  onTest={handleTest}
                  onDisconnect={handleDisconnect}
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
        onOpenChange={setIngestSheetOpen}
        onSuccess={handleConnectSuccess}
      />
    </div>
  );
}
