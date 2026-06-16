import { useState } from "react";
import { Check, GitBranch, Lock, Search } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useConnectors, useAvailableRepos, useConnectRepo } from "@/hooks/useApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const SOURCE_CONTROL_TYPES = ["github", "gitlab", "bitbucket"];

interface ConnectRepoSheetProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ConnectRepoSheet({ projectId, open, onOpenChange, onSuccess }: ConnectRepoSheetProps) {
  const { currentOrg } = useOrg();
  const [selectedConnectorId, setSelectedConnectorId] = useState("");
  const [search, setSearch] = useState("");
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: connectors } = useConnectors(currentOrg?.id || "");
  const sourceControlConnectors = (connectors || []).filter((c) =>
    SOURCE_CONTROL_TYPES.includes(c.connectorType)
  );

  const { data: availableRepos, isLoading: isLoadingRepos } = useAvailableRepos(
    currentOrg?.id || "",
    selectedConnectorId,
    !!selectedConnectorId
  );

  const connectRepo = useConnectRepo(projectId);

  const filteredRepos = (availableRepos || []).filter((repo) =>
    repo.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedConnectorId("");
      setSearch("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleConnectRepo = async (repo: (typeof filteredRepos)[0]) => {
    if (repo.alreadyLinked || !selectedConnectorId) return;

    setConnectingId(repo.externalId);
    setError(null);

    try {
      await connectRepo.mutateAsync({
        organization_connector_id: selectedConnectorId,
        external_id: repo.externalId,
        name: repo.name,
        full_name: repo.fullName,
        url: repo.htmlUrl,
        default_branch: repo.defaultBranch,
        is_private: repo.isPrivate,
      });
      handleOpenChange(false);
      onSuccess();
    } catch {
      setError("Failed to connect repository. Please try again.");
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="size-5 text-muted-foreground" />
            <SheetTitle>Connect Repository</SheetTitle>
          </div>
          <SheetDescription>
            Select a source control account and choose a repository to link to this project.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="connector-select">Account</Label>
            {sourceControlConnectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No GitHub, GitLab, or Bitbucket accounts connected. Add one in Integrations.
              </p>
            ) : (
              <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId}>
                <SelectTrigger id="connector-select">
                  <SelectValue placeholder="Select account…" />
                </SelectTrigger>
                <SelectContent>
                  {sourceControlConnectors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label || c.externalAccountName || c.connectorType}
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
                  placeholder="Search repositories…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1">
                {isLoadingRepos ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14" />
                  ))
                ) : filteredRepos.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {search ? "No repositories match your search." : "No repositories found."}
                  </p>
                ) : (
                  filteredRepos.map((repo) => (
                    <button
                      key={repo.externalId}
                      type="button"
                      disabled={repo.alreadyLinked || connectingId === repo.externalId}
                      onClick={() => handleConnectRepo(repo)}
                      className="w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{repo.fullName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {repo.isPrivate && (
                              <Lock className="size-3 text-muted-foreground" />
                            )}
                            <span className="text-xs text-muted-foreground">{repo.defaultBranch}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {repo.alreadyLinked ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Check className="size-3" /> Linked
                          </Badge>
                        ) : connectingId === repo.externalId ? (
                          <span className="text-xs text-muted-foreground">Connecting…</span>
                        ) : null}
                      </div>
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
