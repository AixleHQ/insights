import { useOrg } from "@/contexts/OrgContext";
import { useOrgProviderSettings, useUpdateOrgProviderSetting } from "@/hooks/useApi";
import { ProviderManageCard } from "@/components/integrations/ProviderManageCard";
import { IntegrationSkeleton } from "@/components/integrations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { availableProviders, categoryLabels } from "@/lib/providers";
import type { IntegrationProvider, ProviderInfo } from "@/lib/providers";
import { useCallback } from "react";

type Category = ProviderInfo["category"];
const CATEGORIES: Category[] = ["code", "project", "ai", "design", "communication"];

const providersByCategory: Record<"all" | Category, ProviderInfo[]> = {
  all: availableProviders,
  code: availableProviders.filter((p) => p.category === "code"),
  project: availableProviders.filter((p) => p.category === "project"),
  ai: availableProviders.filter((p) => p.category === "ai"),
  design: availableProviders.filter((p) => p.category === "design"),
  communication: availableProviders.filter((p) => p.category === "communication"),
};

export function IntegrationsManage() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? "";

  const { enabledMap, isLoading, isError } = useOrgProviderSettings(orgId);
  const { mutate: updateProviderSetting, isPending, variables } = useUpdateOrgProviderSetting(orgId);

  const handleToggle = useCallback(
    (provider: IntegrationProvider, enabled: boolean) => {
      updateProviderSetting({ provider, enabled });
    },
    [updateProviderSetting]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manage Integration Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Control which integrations Eng Leads can connect at the project level
        </p>
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>Failed to load integration settings. Please refresh the page.</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {categoryLabels[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        {(["all", ...CATEGORIES] as const).map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <IntegrationSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {providersByCategory[cat].map((provider) => (
                  <ProviderManageCard
                    key={provider.id}
                    provider={provider}
                    enabled={enabledMap[provider.id] !== false}
                    onToggle={handleToggle}
                    isPending={isPending && variables?.provider === provider.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
