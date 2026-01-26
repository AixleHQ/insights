import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useConnectors, useSyncConnector, useDeleteConnector } from '@/hooks/useApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ConnectorCard,
  type ConnectorData,
  type ProviderInfo,
} from '@/components/connectors';

const availableProviders: ProviderInfo[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Connect repositories, pull requests, and commits',
    icon: <span className="text-lg">G</span>,
    features: [
      'Repository tracking',
      'Pull request events',
      'Commit monitoring',
      'Issue integration',
    ],
    available: true,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Connect projects, merge requests, and pipelines',
    icon: <span className="text-lg">G</span>,
    features: [
      'Project tracking',
      'Merge request events',
      'Pipeline monitoring',
      'Issue integration',
    ],
    available: true,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    description: 'Connect repositories and pull requests',
    icon: <span className="text-lg">B</span>,
    features: ['Repository tracking', 'Pull request events', 'Pipeline monitoring'],
    available: true,
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Connect issues and projects for context',
    icon: <span className="text-lg">J</span>,
    features: ['Issue tracking', 'Project context', 'Sprint monitoring'],
    available: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Connect issues and teams',
    icon: <span className="text-lg">L</span>,
    features: ['Issue tracking', 'Team context', 'Cycle monitoring'],
    available: true,
  },
];

function ConnectorSkeleton() {
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

export function Connectors() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();

  const { data: connectorsData, isLoading } = useConnectors(currentOrg?.id || '');
  const syncConnector = useSyncConnector();
  const deleteConnector = useDeleteConnector();

  // Transform API response to component format
  const connectors: ConnectorData[] = useMemo(() => {
    return connectorsData?.map((c) => ({
      id: c.id,
      provider: c.provider,
      name: c.name,
      status: c.status === 'active' ? 'connected' : c.status === 'error' ? 'error' : 'syncing',
      last_sync_at: c.last_sync_at || undefined,
      sync_error: c.sync_error || undefined,
      metadata: {
        account_name: c.external_id || '',
        resources_count: 0, // Would need to be fetched separately
      },
    })) || [];
  }, [connectorsData]);

  const handleConnect = (providerId: string) => {
    navigate(`/connectors/new/${providerId}`);
  };

  const handleSync = async (id: string) => {
    if (!currentOrg) return;
    try {
      await syncConnector.mutateAsync({ orgId: currentOrg.id, connectorId: id });
    } catch (error) {
      console.error('Failed to sync connector:', error);
    }
  };

  const handleDisconnect = async (id: string) => {
    if (!currentOrg) return;
    if (window.confirm('Are you sure you want to disconnect this connector?')) {
      try {
        await deleteConnector.mutateAsync({ orgId: currentOrg.id, connectorId: id });
      } catch (error) {
        console.error('Failed to disconnect connector:', error);
      }
    }
  };

  // Get providers that are already connected
  const connectedProviders = new Set(connectors.map((c) => c.provider));

  // Filter available providers to show only those not connected
  const unconnectedProviders = availableProviders.filter(
    (p) => !connectedProviders.has(p.id as ConnectorData['provider'])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connectors</h1>
        <p className="text-sm text-muted-foreground">
          Connect external services to sync repositories, issues, and more
        </p>
      </div>

      <Tabs defaultValue="connected" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connected">
            Connected ({connectors.length})
          </TabsTrigger>
          <TabsTrigger value="available">
            Available ({unconnectedProviders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connected" className="space-y-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <ConnectorSkeleton key={i} />
              ))}
            </div>
          ) : connectors.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <p className="text-muted-foreground">No connectors configured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect a service to get started
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  onSync={handleSync}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {unconnectedProviders.map((provider) => (
              <ConnectorCard
                key={provider.id}
                provider={provider}
                onConnect={handleConnect}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
