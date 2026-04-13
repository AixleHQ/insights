import { useState } from 'react';
import { Search, Layers } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useConnectors, useAvailableJiraProjects, useLinkJira } from '@/hooks/useApi';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface ConnectJiraSheetProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ConnectJiraSheet({ projectId, open, onOpenChange, onSuccess }: ConnectJiraSheetProps) {
  const { currentOrg } = useOrg();
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [search, setSearch] = useState('');
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: connectors } = useConnectors(currentOrg?.id || '');
  const jiraConnectors = (connectors || []).filter((c) => c.connectorType === 'jira');

  const { data: jiraProjects, isLoading: isLoadingProjects } = useAvailableJiraProjects(
    currentOrg?.id || '',
    selectedConnectorId
  );

  const linkJira = useLinkJira(projectId);

  const filteredProjects = (jiraProjects || []).filter((p) =>
    `${p.name} ${p.key}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedConnectorId('');
      setSearch('');
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleLinkProject = async (key: string) => {
    if (!selectedConnectorId) return;
    setConnectingKey(key);
    setError(null);
    try {
      await linkJira.mutateAsync({ connector_id: selectedConnectorId, jira_project_key: key });
      handleOpenChange(false);
      onSuccess();
    } catch {
      setError('Failed to link Jira project. Please try again.');
    } finally {
      setConnectingKey(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-muted-foreground" />
            <SheetTitle>Connect Jira Project</SheetTitle>
          </div>
          <SheetDescription>
            Select a Jira account and choose a project to link to this db90 project.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="jira-connector-select">Jira Account</Label>
            {jiraConnectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Jira accounts connected. Add one in Integrations first.
              </p>
            ) : (
              <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId}>
                <SelectTrigger id="jira-connector-select">
                  <SelectValue placeholder="Select account…" />
                </SelectTrigger>
                <SelectContent>
                  {jiraConnectors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.externalAccountName || 'Jira'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedConnectorId && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search projects…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1">
                {isLoadingProjects ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))
                ) : filteredProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {search ? 'No projects match your search.' : 'No Jira projects found.'}
                  </p>
                ) : (
                  filteredProjects.map((project) => (
                    <button
                      key={project.key}
                      type="button"
                      disabled={connectingKey === project.key}
                      onClick={() => handleLinkProject(project.key)}
                      className="w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {project.avatarUrl && (
                          <img
                            src={project.avatarUrl}
                            alt=""
                            className="size-6 rounded shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{project.name}</p>
                          <p className="text-xs text-muted-foreground">{project.key}</p>
                        </div>
                      </div>
                      {connectingKey === project.key && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          Linking…
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button variant="outline" onClick={() => handleOpenChange(false)} className="mt-auto">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
