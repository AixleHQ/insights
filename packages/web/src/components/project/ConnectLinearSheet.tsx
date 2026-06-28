import { useState } from "react";
import { Search, Layers } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useConnectors, useAvailableLinearProjects, useLinkLinear, useSyncProjectIssues } from "@/hooks/useApi";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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

interface ConnectLinearSheetProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ConnectLinearSheet({ projectId, open, onOpenChange, onSuccess }: ConnectLinearSheetProps) {
  const { currentOrg } = useOrg();
  const [selectedConnectorId, setSelectedConnectorId] = useState("");
  const [search, setSearch] = useState("");
  const [connectingProjectId, setConnectingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: connectors } = useConnectors(currentOrg?.id || "");
  const linearConnectors = (connectors || []).filter((connector) => connector.connectorType === "linear");

  const { data: linearProjects, isLoading: isLoadingProjects } = useAvailableLinearProjects(
    currentOrg?.id || "",
    selectedConnectorId
  );

  const linkLinear = useLinkLinear(projectId);
  const syncIssues = useSyncProjectIssues(projectId);

  const filteredProjects = (linearProjects || []).filter((project) =>
    `${project.name} ${project.key || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedConnectorId("");
      setSearch("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleLinkProject = async (projectIdToLink: string, projectName: string) => {
    if (!selectedConnectorId) return;
    setConnectingProjectId(projectIdToLink);
    setError(null);
    try {
      await linkLinear.mutateAsync({
        connector_id: selectedConnectorId,
        linear_project_id: projectIdToLink,
        linear_project_name: projectName,
      });
    } catch {
      setError("Failed to link Linear project. Please try again.");
      setConnectingProjectId(null);
      return;
    }

    try {
      await syncIssues.mutateAsync();
    } catch {
      // Linking succeeded; user can retry sync manually.
    }

    setConnectingProjectId(null);
    handleOpenChange(false);
    onSuccess();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-muted-foreground" />
            <SheetTitle>Connect Linear Project</SheetTitle>
          </div>
          <SheetDescription>
            Select a Linear account and choose a project to link to this Aixle Insights project.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="linear-connector-select">Linear Account</Label>
            {linearConnectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Linear accounts connected. Add one in Integrations first.
              </p>
            ) : (
              <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId}>
                <SelectTrigger id="linear-connector-select">
                  <SelectValue placeholder="Select account…" />
                </SelectTrigger>
                <SelectContent>
                  {linearConnectors.map((connector) => (
                    <SelectItem key={connector.id} value={connector.id}>
                      {connector.externalAccountName || "Linear"}
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
                  Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-14" />
                  ))
                ) : filteredProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    {search ? "No projects match your search." : "No Linear projects found."}
                  </p>
                ) : (
                  filteredProjects.map((project) => (
                    <button
                      key={project.externalId}
                      type="button"
                      disabled={connectingProjectId === project.externalId}
                      onClick={() => handleLinkProject(project.externalId, project.name)}
                      className="w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.key || project.state || project.externalId}
                        </p>
                      </div>
                      {connectingProjectId === project.externalId && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {syncIssues.isPending ? "Syncing…" : "Linking…"}
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
