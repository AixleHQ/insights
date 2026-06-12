import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import {
  useConnectors,
  useConnectorHealth,
  useSyncConnector,
  useDeleteConnector,
  useTestConnector,
} from "@/hooks/useApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  IntegrationCard,
  IntegrationSkeleton,
  type IntegrationProvider,
  type ProviderInfo,
} from "@/components/integrations";
import type { ConnectorStatus } from "@/lib/types";
import type { IntegrationScope } from "@/components/integrations";
import { ApiKeyConnectSheet } from "@/components/integrations/ApiKeyConnectSheet";
import { OrgSlackConnectSheet } from "@/components/integrations/OrgSlackConnectSheet";
import { OpenrouterWebhookSheet } from "@/components/integrations/OpenrouterWebhookSheet";
import { availableProviders, categoryLabels } from "@/lib/providers";

const AI_PROVIDERS = new Set(["anthropic", "openai", "openrouter", "gemini"]);
const SLACK_PROVIDERS = new Set(["slack"]);



export function Integrations() {
  const { currentOrg, hasRole } = useOrg();
  const navigate = useNavigate();
  const { status } = useParams<{ status: string }>();

  const isOwner = hasRole(["owner"]);

  const { data: connectorsData, isLoading: connectorsLoading } = useConnectors(
    currentOrg?.id || "",
  );
  const { data: healthData } = useConnectorHealth(currentOrg?.id || "", { enabled: isOwner });
  const isLoading = connectorsLoading;

  const healthStatsById = useMemo(() => {
    const map = new Map(
      (healthData?.connectors ?? []).map((s) => [s.id, s])
    );
    return map;
  }, [healthData]);
  const syncConnector = useSyncConnector();
  const deleteConnector = useDeleteConnector();
  const testConnector = useTestConnector();

  const activeTab = status === "available" ? "available" : "connected";
  const [scopeFilter, setScopeFilter] = useState<IntegrationScope | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [connectingProvider, setConnectingProvider] =
    useState<ProviderInfo | null>(null);
  const [slackSheetOpen, setSlackSheetOpen] = useState(false);
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
  const integrations = useMemo(() => {
    return (connectorsData ?? []).map((c) => {
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
        scope: c.scope as IntegrationScope,
      };
    });
  }, [connectorsData]);

  const handleConnect = (providerId: string) => {
    if (AI_PROVIDERS.has(providerId)) {
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
        await deleteConnector.mutateAsync({ orgId: currentOrg.id, connectorId: id });
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect external services to sync repositories, track AI usage, and
            more
          </p>
        </div>
        {isOwner && (
          <Button variant="outline" size="sm" onClick={() => navigate("/integrations/manage")}>
            Manage Catalog
          </Button>
        )}
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
          {isOwner && healthData?.summary && healthData.summary.total > 0 && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">Connector health:</span>
              {healthData.summary.error > 0 ? (
                <span className="font-medium text-destructive">
                  {healthData.summary.error} of {healthData.summary.total} failing
                </span>
              ) : (
                <span className="font-medium text-success">
                  All {healthData.summary.total} connectors healthy
                </span>
              )}
              {healthData.summary.disconnected > 0 && (
                <span className="text-muted-foreground">
                  · {healthData.summary.disconnected} disconnected
                </span>
              )}
            </div>
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
                  healthStats={healthStatsById.get(integration.id) ?? null}
                  onSync={integration.provider === "slack" ? undefined : handleSync}
                  onTest={handleTest}
                  onDisconnect={handleDisconnect}
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
