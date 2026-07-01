import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  AlertCircle,
  AlertTriangle,
  MoreHorizontal,
  User,
  CheckCircle2,
  Clock,
  Unplug,
} from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import {
  useToolAccounts,
  useDeleteToolAccount,
  useCreateToolAccount,
  useUpdateToolAccount,
  useUserOrganizations,
  useRegenerateIngestToken,
} from "@/hooks/useApi";
import type { ToolAccount } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderLogo } from "@/components/icons";
import { IngestTokenConnectSheet } from "@/components/integrations";
import type { ProviderInfo } from "@/components/integrations";
import { AppRoutes } from "@/lib/routes";

type ToolCategory = "ai-editors";

interface ToolProvider {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  tokenLabel: string;
}

const toolProviders: ToolProvider[] = [
  // AI Code Editors
  {
    id: "claude_code",
    name: "Claude Code",
    description: "Link your Anthropic account to attribute Claude Code usage",
    category: "ai-editors",
    tokenLabel: "Access Token",
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Link your Cursor account for AI code editor attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
];

const categoryLabels: Record<ToolCategory, string> = {
  "ai-editors": "AI Code Editors",
};

const categoryOrder: ToolCategory[] = ["ai-editors"];
const INGEST_PROVIDER_IDS = new Set(["claude_code", "cursor"]);
const INGEST_PROVIDER_INFO: Record<string, ProviderInfo> = {
  claude_code: {
    id: "claude-code",
    name: "Claude Code",
    description: "Monitor Claude Code CLI usage",
    category: "ai",
    scope: "persona",
    features: [
      "Session tracking",
      "Code generation analytics",
      "Token consumption",
      "Project-level insights",
    ],
    available: true,
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    description: "Monitor Cursor IDE AI usage",
    category: "ai",
    scope: "persona",
    features: [
      "AI completions tracking",
      "Chat usage analytics",
      "Token consumption",
      "Session insights",
    ],
    available: true,
  },
};

function ingestProviderInfo(providerId: string): ProviderInfo | null {
  return INGEST_PROVIDER_INFO[providerId] ?? null;
}

const toolStatusConfig = {
  active:                 { label: "Connected",      Icon: CheckCircle2, color: "text-success",          bg: "bg-success/10" },
  waiting_for_connection: { label: "Setup required", Icon: Clock,        color: "text-warning",          bg: "bg-warning/10" },
  inactive:               { label: "Disabled",       Icon: Unplug,       color: "text-muted-foreground", bg: "bg-muted" },
} as const;

function ScopeBadge() {
  return (
    <Badge variant="secondary" className="gap-1 text-xs font-normal">
      <User className="size-3" />
      Personal
    </Badge>
  );
}

function AccountSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-md shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-40" />
      </CardContent>
    </Card>
  );
}

interface ConnectFormData {
  providerId: string;
  accountId: string;
  accountName: string;
  token: string;
}

interface ConnectDialogProps {
  provider: ToolProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ConnectFormData) => Promise<void>;
  isSubmitting: boolean;
}

function ConnectDialog({ provider, open, onOpenChange, onSubmit, isSubmitting }: ConnectDialogProps) {
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAccountId("");
      setAccountName("");
      setToken("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !accountId.trim()) return;
    setError(null);
    try {
      await onSubmit({ providerId: provider.id, accountId: accountId.trim(), accountName: accountName.trim(), token: token.trim() });
      handleOpenChange(false);
    } catch {
      setError("Failed to connect account. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {provider?.name}</DialogTitle>
          <DialogDescription>
            Enter your {provider?.name} account identifier to enable automatic event attribution.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="account-id">Account ID or Username</Label>
              <Input
                id="account-id"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder={`Your ${provider?.name} username or ID`}
                required
              />
              <p className="type-caption text-muted-foreground">
                This should match the identifier used in your API requests.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-name">Display Name (optional)</Label>
              <Input
                id="account-name"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="How you want it displayed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="access-token">{provider?.tokenLabel} (optional)</Label>
              <Input
                id="access-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={`Paste your ${provider?.tokenLabel?.toLowerCase()}`}
              />
              <p className="type-caption text-muted-foreground">
                Stored encrypted. Used for event attribution.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!accountId.trim() || isSubmitting}>
              {isSubmitting ? "Connecting..." : "Connect Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ReconnectDialogProps {
  provider: ToolProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (token: string) => Promise<void>;
  isSubmitting: boolean;
}

function ReconnectDialog({ provider, open, onOpenChange, onSubmit, isSubmitting }: ReconnectDialogProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setToken("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !token.trim()) return;
    setError(null);
    try {
      await onSubmit(token.trim());
      handleOpenChange(false);
    } catch {
      setError("Failed to reconnect. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconnect {provider?.name}</DialogTitle>
          <DialogDescription>
            Your {provider?.name} token has expired. Enter a new {provider?.tokenLabel?.toLowerCase()} to
            restore access.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reconnect-token">{provider?.tokenLabel}</Label>
              <Input
                id="reconnect-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={`Paste your new ${provider?.tokenLabel?.toLowerCase()}`}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!token.trim() || isSubmitting}>
              {isSubmitting ? "Reconnecting..." : "Reconnect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AvailableCardFooter({
  provider,
  onConnect,
}: {
  provider: ToolProvider;
  onConnect: (provider: ToolProvider) => void;
}) {
  const features = INGEST_PROVIDER_INFO[provider.id]?.features.slice(0, 3) ?? [];
  return (
    <div className="space-y-4">
      {features.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-2">
              <div className="size-1 rounded-full bg-muted-foreground" />
              {feature}
            </li>
          ))}
        </ul>
      )}
      <Button className="w-full" onClick={() => onConnect(provider)}>
        <Plus className="mr-2 size-4" />
        Connect
      </Button>
    </div>
  );
}

function ToolCard({
  provider,
  linkedAccount,
  onConnect,
  onDisconnect,
  onToggleActive,
  onReconnect,
  isToggling,
}: {
  provider: ToolProvider;
  linkedAccount?: ToolAccount;
  onConnect: (provider: ToolProvider) => void;
  onDisconnect: (accountId: string) => void;
  onToggleActive?: (accountId: string, newValue: "inactive" | "active") => void;
  onReconnect?: (accountId: string) => void;
  isToggling?: boolean;
}) {
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);

  const isLinked = !!linkedAccount;
  const connectionState = linkedAccount?.connectionState ?? "inactive";
  const isInactive = connectionState === "inactive";
  const requiresSetup = connectionState === "waiting_for_connection";
  const isActive = connectionState === "active";
  const statusKey = connectionState in toolStatusConfig ? connectionState : "inactive";
  const status = toolStatusConfig[statusKey as keyof typeof toolStatusConfig];
  const StatusIcon = status.Icon;

  return (
    <>
      <Card className={cn("group relative transition-all hover:shadow-md", isLinked && isInactive && "opacity-60")}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ProviderLogo provider={provider.id} showBackground size="md" className="shrink-0" />
              <div>
                <CardTitle className="type-body-lg">{provider.name}</CardTitle>
                <CardDescription className="text-xs">{provider.description}</CardDescription>
                {isLinked && (
                  <div className="mt-1">
                    <ScopeBadge />
                  </div>
                )}
              </div>
            </div>
            {isLinked ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!requiresSetup && (
                    <DropdownMenuItem
                      onClick={() => onToggleActive?.(linkedAccount.id, isActive ? "inactive" : "active")}
                      disabled={isToggling}
                    >
                      {isActive ? "Disable" : "Enable"}
                    </DropdownMenuItem>
                  )}
                  {linkedAccount.tokenExpired && (
                    <DropdownMenuItem onClick={() => onReconnect?.(linkedAccount.id)}>
                      Reconnect
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDisconnectTarget(linkedAccount.id)}
                  >
                    Disconnect
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <ScopeBadge />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLinked && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("gap-1", status.bg)}>
                <StatusIcon className={cn("size-3", status.color)} />
                <span className={status.color}>{status.label}</span>
              </Badge>
              {linkedAccount.tokenExpired && (
                <Badge variant="outline" className="border-warning/50 text-warning">
                  <AlertTriangle className="mr-1 size-3" />
                  Token expired
                </Badge>
              )}
            </div>
          )}
          {isLinked && (
            <p className="text-sm text-muted-foreground">
              Linked as {linkedAccount.externalUsername || linkedAccount.externalUserId || "Aixle Insights"}
            </p>
          )}
          {isLinked && requiresSetup && (
            <p className="type-caption text-muted-foreground">
              This tool will become active after it sends its first event to Aixle Insights.
            </p>
          )}
          {!isLinked && (
            <AvailableCardFooter provider={provider} onConnect={onConnect} />
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {provider.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink your {provider.name} account. Future events from this tool
              may not be attributed to you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (disconnectTarget) onDisconnect(disconnectTarget);
                setDisconnectTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ToolAccounts({ embedded = false }: { embedded?: boolean }) {
  const { currentOrg } = useOrg();
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations();
  const [userSelectedOrgId, setUserSelectedOrgId] = useState<string | null>(null);
  const selectedOrgId = userSelectedOrgId ?? currentOrg?.id ?? "";
  const [connectingProvider, setConnectingProvider] = useState<ToolProvider | null>(null);
  const [reconnectingAccountId, setReconnectingAccountId] = useState<string | null>(null);
  const [ingestProvider, setIngestProvider] = useState<ProviderInfo | null>(null);
  const [ingestInitialToken, setIngestInitialToken] = useState<string | null>(null);

  const { data: accounts, isLoading } = useToolAccounts(selectedOrgId);
  const createAccount = useCreateToolAccount();
  const deleteAccount = useDeleteToolAccount();
  const updateAccount = useUpdateToolAccount();
  const regenerateIngestToken = useRegenerateIngestToken();

  const { linkedProviders, connectedProviders, availableProviders } = useMemo(() => {
    const linkedMap = new Map<string, ToolAccount>();
    accounts?.forEach((account) => {
      linkedMap.set(account.toolName, account);
    });
    return {
      linkedProviders: linkedMap,
      connectedProviders: toolProviders.filter((p) => linkedMap.has(p.id)),
      availableProviders: toolProviders.filter((p) => !linkedMap.has(p.id)),
    };
  }, [accounts]);

  const providersByCategory = useMemo(() => {
    const grouped: Record<ToolCategory, ToolProvider[]> = {
      "ai-editors": [],
    };
    availableProviders.forEach((p) => {
      grouped[p.category].push(p);
    });
    return grouped;
  }, [availableProviders]);

  const handleConnectSubmit = async ({ providerId, accountId, accountName, token }: ConnectFormData) => {
    if (!selectedOrgId) return;
    await createAccount.mutateAsync({
      orgId: selectedOrgId,
      toolName: providerId,
      externalUserId: accountId,
      externalUsername: accountName || undefined,
      accessToken: token || undefined,
    });
  };

  const handleDisconnect = async (accountId: string) => {
    if (!selectedOrgId) return;
    try {
      await deleteAccount.mutateAsync({ orgId: selectedOrgId, accountId });
    } catch (error) {
      console.error("Failed to disconnect account:", error);
    }
  };

  const handleToggleActive = async (
    accountId: string,
    connectionState: "inactive" | "active"
  ) => {
    if (!selectedOrgId) return;
    try {
      await updateAccount.mutateAsync({ orgId: selectedOrgId, accountId, connectionState });
    } catch (error) {
      console.error("Failed to update account status:", error);
    }
  };

  const reconnectingAccount = accounts?.find((a) => a.id === reconnectingAccountId) ?? null;
  const reconnectingProvider = reconnectingAccount
    ? toolProviders.find((p) => p.id === reconnectingAccount.toolName) ?? null
    : null;

  const openIngestSheet = (providerId: string, initialToken?: string | null) => {
    setIngestProvider(ingestProviderInfo(providerId));
    setIngestInitialToken(initialToken ?? null);
  };

  const handleConnect = (provider: ToolProvider) => {
    if (INGEST_PROVIDER_IDS.has(provider.id)) {
      openIngestSheet(provider.id);
      return;
    }
    setConnectingProvider(provider);
  };

  const handleReconnect = async (accessToken: string) => {
    if (!selectedOrgId || !reconnectingAccountId) return;
    await updateAccount.mutateAsync({ orgId: selectedOrgId, accountId: reconnectingAccountId, accessToken });
  };

  const handleReconnectClick = async (accountId: string) => {
    const account = accounts?.find((item) => item.id === accountId);
    if (!selectedOrgId || !account) return;

    if (!INGEST_PROVIDER_IDS.has(account.toolName)) {
      setReconnectingAccountId(accountId);
      return;
    }

    try {
      const result = await regenerateIngestToken.mutateAsync({ orgId: selectedOrgId, accountId });
      openIngestSheet(account.toolName, result.data.ingestToken ?? null);
    } catch (error) {
      console.error("Failed to regenerate ingest token:", error);
    }
  };

  return (
    <div className={cn("space-y-6", !embedded && "mx-auto max-w-4xl")}>
      {!embedded && (
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" aria-label="Back to settings">
            <Link to={AppRoutes.settings.root}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="type-h3">Tool Accounts</h1>
            <p className="text-sm text-muted-foreground">
              Link your AI tool accounts for automatic event attribution
            </p>
          </div>
        </div>
      )}

      {!embedded && (
        <div className="flex items-center gap-3">
          <Label htmlFor="org-select" className="shrink-0 type-label">
            Organization
          </Label>
          <Select value={selectedOrgId} onValueChange={setUserSelectedOrgId} disabled={orgsLoading}>
            <SelectTrigger id="org-select" className="w-56">
              <SelectValue placeholder="Select organisation" />
            </SelectTrigger>
            <SelectContent>
              {(orgs ?? []).map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <AccountSkeleton key={i} />
          ))}
        </div>
      ) : (
        <Tabs defaultValue={connectedProviders.length > 0 ? "connected" : "available"}>
          <TabsList>
            <TabsTrigger value="connected">
              Connected ({connectedProviders.length})
            </TabsTrigger>
            <TabsTrigger value="available">
              Available ({availableProviders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connected" className="space-y-4 pt-2">
            {connectedProviders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
                <p className="text-muted-foreground">No tools connected yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Switch to Available to connect your first tool
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {connectedProviders.map((provider) => (
                  <ToolCard
                    key={provider.id}
                    provider={provider}
                    linkedAccount={linkedProviders.get(provider.id)}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onToggleActive={handleToggleActive}
                    onReconnect={handleReconnectClick}
                    isToggling={updateAccount.isPending && updateAccount.variables?.accountId === linkedProviders.get(provider.id)?.id && !updateAccount.variables?.accessToken}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="available" className="space-y-8 pt-2">
            {availableProviders.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                All available tools are connected.
              </p>
            ) : (
              categoryOrder.map((category) => {
                const providers = providersByCategory[category];
                if (providers.length === 0) return null;
                return (
                  <div key={category} className="space-y-4">
                    <h2 className="type-body-lg font-medium">{categoryLabels[category]}</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {providers.map((provider) => (
                        <ToolCard
                          key={provider.id}
                          provider={provider}
                          onConnect={handleConnect}
                          onDisconnect={handleDisconnect}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      )}

      <Card className="border-muted bg-muted/50">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Privacy Note</p>
            <p className="text-muted-foreground">
              Aixle Insights only stores your account identifier and, if provided, your API token —
              encrypted at rest. We use these only for event attribution and do not access
              your tool data directly.
            </p>
          </div>
        </CardContent>
      </Card>

      <ConnectDialog
        provider={connectingProvider}
        open={!!connectingProvider}
        onOpenChange={(open) => !open && setConnectingProvider(null)}
        onSubmit={handleConnectSubmit}
        isSubmitting={createAccount.isPending}
      />

      <ReconnectDialog
        provider={reconnectingProvider}
        open={!!reconnectingAccountId}
        onOpenChange={(open) => !open && setReconnectingAccountId(null)}
        onSubmit={handleReconnect}
        isSubmitting={updateAccount.isPending && updateAccount.variables?.accountId === reconnectingAccountId}
      />

      <IngestTokenConnectSheet
        provider={ingestProvider}
        open={!!ingestProvider}
        onOpenChange={(open) => {
          if (!open) {
            setIngestProvider(null);
            setIngestInitialToken(null);
          }
        }}
        onSuccess={() => {
          setIngestProvider(null);
          setIngestInitialToken(null);
        }}
        initialToken={ingestInitialToken ?? undefined}
      />
    </div>
  );
}
