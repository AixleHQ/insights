import { useMemo, useState } from "react";
import { AlertCircle, MoreHorizontal } from "lucide-react";
import {
  useProjectConnectors,
  useProjectConnectWithApiKey,
  useProjectDeleteConnector,
  useOrgProviderSettings,
} from "@/hooks/useApi";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ProviderLogo } from "@/components/icons";
import {
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

type ProviderCategory = "ai" | "communication" | "code-hosting" | "project-mgmt" | "design";

interface ExtendedProviderInfo extends ProviderInfo {
  category: ProviderCategory;
  features: string[];
}

const PROVIDERS: ExtendedProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic API",
    description: "Track Anthropic API usage, costs, and model analytics",
    category: "ai",
    scope: "project",
    features: ["Usage monitoring", "Cost tracking", "Rate limit visibility"],
    available: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Track OpenAI API usage and costs",
    category: "ai",
    scope: "project",
    features: ["API usage tracking", "Token consumption", "Cost breakdown"],
    available: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Multi-model AI gateway tracking",
    category: "ai",
    scope: "project",
    features: ["Multi-provider analytics", "Model comparison", "Cost optimization"],
    available: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Track Google Gemini API usage and costs",
    category: "ai",
    scope: "project",
    features: ["API usage tracking", "Model analytics", "Cost breakdown"],
    available: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send project alerts and notifications to Slack",
    category: "communication",
    scope: "project",
    features: ["Cost alerts", "Usage notifications", "Custom channel routing"],
    available: true,
    connectSheet: "webhook",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  ai: "AI Tools",
  communication: "Communication",
  "code-hosting": "Code Hosting",
  "project-mgmt": "Project Mgmt",
  design: "Design",
};

interface ProjectConnectorsTabProps {
  projectId: string;
  orgId?: string;
}

function ConnectedCard({
  integration,
  onDisconnect,
}: {
  integration: IntegrationData;
  onDisconnect?: (id: string) => void;
}) {
  const provider = PROVIDERS.find((p) => p.id === integration.provider);
  const features = provider?.features ?? [];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3.5">
      <ProviderLogo provider={integration.provider} size="md" showBackground />
      <div className="min-w-0 flex-1">
        <p className="type-label font-semibold text-foreground">{integration.name}</p>
        <p className="type-caption text-muted-foreground truncate">
          {features.join(" · ")}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => onDisconnect?.(integration.id)}
          >
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function AvailableCard({
  provider,
  onConnect,
}: {
  provider: ExtendedProviderInfo;
  onConnect?: (id: string) => void;
}) {
  return (
    <div
      data-testid={`provider-card-${provider.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3.5",
        !provider.available && "opacity-60"
      )}
    >
      <ProviderLogo provider={provider.id} size="md" showBackground />
      <div className="min-w-0 flex-1">
        <p className="type-label font-semibold text-foreground">{provider.name}</p>
        <p className="type-caption text-muted-foreground truncate">
          {provider.features.join(" · ")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={!provider.available}
        onClick={() => onConnect?.(provider.id)}
      >
        {provider.available ? "Connect" : "Coming Soon"}
      </Button>
    </div>
  );
}

export function ProjectConnectorsTab({ projectId, orgId = "" }: ProjectConnectorsTabProps) {
  const { data: connectorsData, isLoading } = useProjectConnectors(projectId);
  const { enabledMap } = useOrgProviderSettings(orgId);
  const connectWithApiKey = useProjectConnectWithApiKey();
  const deleteConnector = useProjectDeleteConnector();

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [slackSheetOpen, setSlackSheetOpen] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<ProviderInfo | null>(null);
  const [disconnectingConnectorId, setDisconnectingConnectorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const integrations: IntegrationData[] = useMemo(() => {
    if (!connectorsData) return [];
    return connectorsData.map((c) => {
      const connectorType = c.connectorType || c.connector_type || "anthropic";
      const lastError = c.lastError || c.last_error;
      const externalAccountName = c.externalAccountName || c.external_account_name;
      const lastSyncAt = c.lastSyncAt || c.last_sync_at;
      const status: ConnectorStatus = c.status;
      const providerInfo = PROVIDERS.find((p) => p.id === connectorType);
      const syncError = status === "error" && lastError ? lastError : undefined;

      return {
        id: c.id,
        provider: connectorType as IntegrationProvider,
        name: c.label || externalAccountName || providerInfo?.name || connectorType,
        label: c.label,
        status,
        last_sync_at: lastSyncAt || undefined,
        sync_error: syncError,
        metadata: { account_name: externalAccountName || "", resources_count: 0 },
        scope: c.scope as IntegrationScope,
      };
    });
  }, [connectorsData]);

  const availableProviders = useMemo(() => {
    const connectedSingleIds = new Set(
      integrations.filter((i) => !MULTI_INSTANCE_PROVIDER_IDS.has(i.provider)).map((i) => i.provider)
    );
    return PROVIDERS.filter(
      (p) => !connectedSingleIds.has(p.id) && enabledMap[p.id] !== false
    );
  }, [integrations, enabledMap]);

  const availableCategories = useMemo(() => {
    const cats = new Set(availableProviders.map((p) => p.category));
    return ["all", ...Array.from(cats)];
  }, [availableProviders]);

  const filteredAvailable = useMemo(() => {
    if (categoryFilter === "all") return availableProviders;
    return availableProviders.filter((p) => p.category === categoryFilter);
  }, [availableProviders, categoryFilter]);

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
    await connectWithApiKey.mutateAsync({ projectId, connectorType: connectingProvider.id, apiKey });
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

  return (
    <>
      {actionError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Currently Connected */}
        {(isLoading || integrations.length > 0) && (
          <div className="space-y-3">
            <p className="font-mono-display type-caption font-medium uppercase tracking-wider text-muted-foreground">
              Currently Connected
            </p>
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <IntegrationSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {integrations.map((integration) => (
                  <ConnectedCard
                    key={integration.id}
                    integration={integration}
                    onDisconnect={(id) => setDisconnectingConnectorId(id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Category filter + available providers */}
        {!isLoading && availableProviders.length > 0 && (
          <div className="space-y-3">
            {/* Filter pills */}
            <div className="flex flex-wrap gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "rounded-full px-3 py-1 type-caption font-medium transition-colors border",
                    categoryFilter === cat
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent text-muted-foreground border-border/60 hover:border-foreground/40 hover:text-foreground"
                  )}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>

            {/* Available grid */}
            <div className="grid gap-3 md:grid-cols-2">
              {filteredAvailable.map((provider) => (
                <AvailableCard
                  key={provider.id}
                  provider={provider}
                  onConnect={handleConnect}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state — nothing connected, nothing available */}
        {!isLoading && integrations.length === 0 && availableProviders.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
            <p className="type-label text-muted-foreground">All providers are connected</p>
          </div>
        )}
      </div>

      <ApiKeyConnectSheet
        provider={connectingProvider}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={() => {}}
        onConnect={handleConnectWithApiKey}
      />

      <SlackConnectSheet
        projectId={projectId}
        open={slackSheetOpen}
        onOpenChange={setSlackSheetOpen}
        onSuccess={() => {}}
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
            <AlertDialogAction onClick={handleDisconnectConfirm}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
