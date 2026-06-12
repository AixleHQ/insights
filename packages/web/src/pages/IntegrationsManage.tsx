import { useOrg } from "@/contexts/OrgContext";
import { useOrgProviderSettings, useUpdateOrgProviderSetting } from "@/hooks/useApi";
import { ProviderManageCard } from "@/components/integrations/ProviderManageCard";
import { IntegrationSkeleton } from "@/components/integrations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { availableProviders, categoryLabels } from "@/lib/providers";
import type { IntegrationProvider, ProviderInfo } from "@/lib/providers";
import { useState, useMemo, useCallback } from "react";

type Category = ProviderInfo["category"];
const CATEGORIES: Category[] = ["code", "project", "ai", "design", "communication"];

export function IntegrationsManage() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? "";

  const { enabledMap, isLoading, isError } = useOrgProviderSettings(orgId);
  const updateSetting = useUpdateOrgProviderSetting(orgId);

  const [activeCategory, setActiveCategory] = useState<"all" | Category>("all");

  const visibleProviders = useMemo(() => {
    if (activeCategory === "all") return availableProviders;
    return availableProviders.filter((p) => p.category === activeCategory);
  }, [activeCategory]);

  const handleToggle = useCallback(
    (provider: IntegrationProvider, enabled: boolean) => {
      updateSetting.mutate({ provider, enabled });
    },
    [updateSetting]
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

      <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as "all" | Category)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {categoryLabels[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <IntegrationSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {visibleProviders.map((provider) => (
                <ProviderManageCard
                  key={provider.id}
                  provider={provider}
                  enabled={enabledMap[provider.id] !== false}
                  onToggle={handleToggle}
                  isPending={updateSetting.isPending && updateSetting.variables?.provider === provider.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
