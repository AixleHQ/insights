import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  useProjectConnectors,
  useProjectConnectWithApiKey,
  useProjectDeleteConnector,
  useProjectTestConnector,
  useProjectUpdateConnector,
  useOrgProviderSettings,
} from "@/hooks/useApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IntegrationCard,
  IntegrationSkeleton,
  type IntegrationData,
  type IntegrationProvider,
  type IntegrationScope,
  type ProviderInfo,
} from "@/components/integrations";
import type { ConnectorStatus } from "@/lib/types";
import { ApiKeyConnectSheet } from "@/components/integrations/ApiKeyConnectSheet";
import { SlackConnectSheet } from "@/components/integrations/SlackConnectSheet";

const MULTI_INSTANCE_PROVIDER_IDS = new Set<string>(["slack"]);

const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic API",
    description: "Track Anthropic API usage, costs, and model analytics",
    category: "ai",
    scope: "project",
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
    scope: "project",
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
    scope: "project",
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
    scope: "project",
    features: [
      "API usage tracking",
      "Model analytics",
      "Token consumption",
      "Cost breakdown",
    ],
    available: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send project alerts and notifications to Slack",
    category: "communication",
    scope: "project",
    features: [
      "Cost alerts",
      "Usage notifications",
      "Custom channel routing",
      "Webhook-based delivery",
    ],
    available: true,
    connectSheet: "webhook",
  },
];


interface ProjectConnectorsTabProps {
  projectId: string;
  orgId?: string;
}

// orgId defaults to "" so useOrgProviderSettings is disabled and all providers show (fail-open)
export function ProjectConnectorsTab({ projectId, orgId = "" }: ProjectConnectorsTabProps) {
  const { data: connectorsData, isLoading } = useProjectConnectors(projectId);
  const { enabledMap } = useOrgProviderSettings(orgId);
  const connectWithApiKey = useProjectConnectWithApiKey();
  const deleteConnector = useProjectDeleteConnector();
  const testConnector = useProjectTestConnector();
  const updateConnector = useProjectUpdateConnector();

  const [activeTab, setActiveTab] = useState("connected");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [slackSheetOpen, setSlackSheetOpen] = useState(false);
  const [connectingProvider, setConnectingProvider] =
    useState<ProviderInfo | null>(null);
  const [testingConnectorId, setTestingConnectorId] = useState<string | null>(
    null,
  );
  const [disconnectingConnectorId, setDisconnectingConnectorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const integrations: IntegrationData[] = useMemo(() => {
    if (!connectorsData) return [];
    return connectorsData.map((c) => {
      const connectorType = c.connectorType || c.connector_type || "anthropic";
      const lastError = c.lastError || c.last_error;
      const externalAccountName =
        c.externalAccountName || c.external_account_name;
      const lastSyncAt = c.lastSyncAt || c.last_sync_at;
      const status: ConnectorStatus = c.status;
      const providerInfo = PROVIDERS.find((p) => p.id === connectorType);
      // Only show error copy when the connector is actually in error state,
      // so a stale last_error from a previous attempt does not appear after reconnect.
      const syncError =
        status === "error" && lastError ? lastError : undefined;

      return {
        id: c.id,
        provider: connectorType as IntegrationProvider,
        name: externalAccountName || providerInfo?.name || connectorType,
        label: c.label,
        status,
        last_sync_at: lastSyncAt || undefined,
        sync_error: syncError,
        metadata: {
          account_name: externalAccountName || "",
          resources_count: 0,
        },
        scope: c.scope as IntegrationScope,
      };
    });
  }, [connectorsData]);

  const availableProviders = useMemo(() => {
    const connectedSingleInstanceIds = new Set(
      integrations
        .filter((i) => !MULTI_INSTANCE_PROVIDER_IDS.has(i.provider))
        .map((i) => i.provider),
    );
    return PROVIDERS.filter(
      (p) => !connectedSingleInstanceIds.has(p.id) && enabledMap[p.id] !== false,
    );
  }, [integrations, enabledMap]);

  const handleConnect = (providerId: string) => {
    const provider = PROVIDERS.find((p) => p.id === providerId) ?? null;
    if (provider?.connectSheet === "webhook") {
      setSlackSheetOpen(true);
      return;
    }
    setConnectingProvider(provider);
    setSheetOpen(true);
  };

  const handleConnectWithApiKey = async (apiKey: string) => {
    if (!connectingProvider) return;
    await connectWithApiKey.mutateAsync({
      projectId,
      connectorType: connectingProvider.id,
      apiKey,
    });
  };

  const handleDisconnect = (id: string) => {
    setDisconnectingConnectorId(id);
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectingConnectorId) return;
    setActionError(null);
    try {
      await deleteConnector.mutateAsync({ projectId, connectorId: disconnectingConnectorId });
    } catch {
      setActionError("Failed to disconnect. Please try again.");
    } finally {
      setDisconnectingConnectorId(null);
    }
  };

  const handleTest = async (id: string) => {
    setTestingConnectorId(id);
    setActionError(null);
    try {
      await testConnector.mutateAsync({ projectId, connectorId: id });
    } catch {
      setActionError("Failed to run connection test. Please try again.");
    } finally {
      setTestingConnectorId(null);
    }
  };

  const handleRename = async (id: string, newLabel: string) => {
    await updateConnector.mutateAsync({
      projectId,
      connectorId: id,
      data: { label: newLabel },
    });
  };

  return (
    <>
      {actionError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="connected">
            Connected ({integrations.length})
          </TabsTrigger>
          <TabsTrigger value="available">
            Available ({availableProviders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connected" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <IntegrationSkeleton key={i} />
              ))}
            </div>
          ) : integrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
              <p className="text-muted-foreground text-sm">
                No providers connected
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Switch to the Available tab to connect a provider
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  onTest={handleTest}
                  onRename={handleRename}
                  onDisconnect={handleDisconnect}
                  isTesting={testingConnectorId === integration.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          {availableProviders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8">
              <p className="text-muted-foreground text-sm">
                All providers are connected
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {availableProviders.map((provider) => (
                <IntegrationCard
                  key={provider.id}
                  provider={provider}
                  onConnect={handleConnect}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ApiKeyConnectSheet
        provider={connectingProvider}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={() => setActiveTab("connected")}
        onConnect={handleConnectWithApiKey}
      />

      <SlackConnectSheet
        projectId={projectId}
        open={slackSheetOpen}
        onOpenChange={setSlackSheetOpen}
        onSuccess={() => setActiveTab("connected")}
      />

      <AlertDialog
        open={disconnectingConnectorId !== null}
        onOpenChange={(open) => { if (!open) setDisconnectingConnectorId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect integration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the integration from this project. You can reconnect it at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnectConfirm}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
