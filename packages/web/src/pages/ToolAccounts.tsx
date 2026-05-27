import React, { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useToolAccounts, useDeleteToolAccount, useCreateToolAccount, useUpdateToolAccount, useUserOrganizations } from "@/hooks/useApi";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderLogo } from "@/components/icons";

type ToolCategory = "ai-editors" | "ai-apis" | "other";

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
  {
    id: "windsurf",
    name: "Windsurf",
    description: "Link your Windsurf account for AI-assisted coding attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
  {
    id: "github_copilot",
    name: "GitHub Copilot",
    description: "Link your GitHub account to attribute Copilot events",
    category: "ai-editors",
    tokenLabel: "Personal Access Token",
  },
  {
    id: "aider",
    name: "Aider",
    description: "Link your Aider account for AI pair programming attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
  {
    id: "continue",
    name: "Continue",
    description: "Link your Continue account for open-source AI code assistant attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
  {
    id: "cody",
    name: "Cody",
    description: "Link your Sourcegraph Cody account for AI coding attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
  {
    id: "tabnine",
    name: "Tabnine",
    description: "Link your Tabnine account for AI code completion attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
  {
    id: "amazon_q",
    name: "Amazon Q",
    description: "Link your Amazon Q account for AI developer tool attribution",
    category: "ai-editors",
    tokenLabel: "API Key",
  },
  // AI APIs
  {
    id: "openrouter_api",
    name: "OpenRouter",
    description: "Link your OpenRouter account for multi-model AI gateway tracking",
    category: "ai-apis",
    tokenLabel: "API Key",
  },
  {
    id: "anthropic_api",
    name: "Anthropic API",
    description: "Link your Anthropic API account for direct API usage tracking",
    category: "ai-apis",
    tokenLabel: "API Key",
  },
  {
    id: "openai_api",
    name: "OpenAI API",
    description: "Link your OpenAI account for ChatGPT / Codex tracking",
    category: "ai-apis",
    tokenLabel: "API Key",
  },
  {
    id: "gemini_api",
    name: "Gemini API",
    description: "Link your Google account for Gemini API usage tracking",
    category: "ai-apis",
    tokenLabel: "API Key",
  },
  // Other
  {
    id: "custom",
    name: "Custom Tool",
    description: "Link a custom or internal AI tool for usage attribution",
    category: "other",
    tokenLabel: "API Key",
  },
];

const categoryLabels: Record<ToolCategory, string> = {
  "ai-editors": "AI Code Editors",
  "ai-apis": "AI APIs",
  "other": "Other",
};

const categoryOrder: ToolCategory[] = ["ai-editors", "ai-apis", "other"];

function AccountSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="h-8 w-24 ml-auto" />
    </div>
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
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
  onToggleActive?: (accountId: string, newValue: boolean) => void;
  onReconnect?: (accountId: string) => void;
  isToggling?: boolean;
}) {
  const isLinked = !!linkedAccount;

  return (
    <Card className={cn(isLinked && !linkedAccount.isActive && "opacity-60")}>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-3">
          <ProviderLogo provider={provider.id} showBackground size="md" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{provider.name}</span>
              {isLinked && (
                <Badge
                  variant="outline"
                  className={linkedAccount.isActive ? "text-success" : "text-muted-foreground"}
                >
                  <Check className="mr-1 size-3" />
                  {linkedAccount.isActive ? "Connected" : "Disabled"}
                </Badge>
              )}
              {isLinked && linkedAccount.tokenExpired && (
                <Badge variant="outline" className="border-warning/50 text-warning">
                  <AlertTriangle className="mr-1 size-3" />
                  Token expired
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isLinked
                ? `Linked as ${
                    linkedAccount.externalUsername ||
                    linkedAccount.externalUserId ||
                    "DB90"
                  }`
                : provider.description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {isLinked ? (
            <>
              {linkedAccount.tokenExpired && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-warning/50 text-warning hover:bg-warning/10"
                  onClick={() => onReconnect?.(linkedAccount.id)}
                >
                  Reconnect
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleActive?.(linkedAccount.id, !linkedAccount.isActive)}
                disabled={isToggling}
              >
                {linkedAccount.isActive ? "Disable" : "Enable"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
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
                      onClick={() => onDisconnect(linkedAccount.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onConnect(provider)}>
              <Plus className="mr-2 size-4" />
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ToolAccounts({ embedded = false }: { embedded?: boolean }) {
  const { currentOrg } = useOrg();
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations();
  const [userSelectedOrgId, setUserSelectedOrgId] = useState<string | null>(null);
  const selectedOrgId = userSelectedOrgId ?? currentOrg?.id ?? "";
  const [connectingProvider, setConnectingProvider] = useState<ToolProvider | null>(null);
  const [reconnectingAccountId, setReconnectingAccountId] = useState<string | null>(null);

  const { data: accounts, isLoading } = useToolAccounts(selectedOrgId);
  const createAccount = useCreateToolAccount();
  const deleteAccount = useDeleteToolAccount();
  const updateAccount = useUpdateToolAccount();

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
      "ai-apis": [],
      "other": [],
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

  const handleToggleActive = async (accountId: string, isActive: boolean) => {
    if (!selectedOrgId) return;
    try {
      await updateAccount.mutateAsync({ orgId: selectedOrgId, accountId, isActive });
    } catch (error) {
      console.error("Failed to update account status:", error);
    }
  };

  const reconnectingAccount = accounts?.find((a) => a.id === reconnectingAccountId) ?? null;
  const reconnectingProvider = reconnectingAccount
    ? toolProviders.find((p) => p.id === reconnectingAccount.toolName) ?? null
    : null;

  const handleReconnect = async (accessToken: string) => {
    if (!selectedOrgId || !reconnectingAccountId) return;
    await updateAccount.mutateAsync({ orgId: selectedOrgId, accountId: reconnectingAccountId, accessToken });
  };

  return (
    <div className={cn("space-y-6", !embedded && "mx-auto max-w-4xl")}>
      {!embedded && (
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" aria-label="Back to settings">
            <Link to="/settings">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Tool Accounts</h1>
            <p className="text-sm text-muted-foreground">
              Link your AI tool accounts for automatic event attribution
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Label htmlFor="org-select" className="shrink-0 text-sm font-medium">
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
                    onConnect={setConnectingProvider}
                    onDisconnect={handleDisconnect}
                    onToggleActive={handleToggleActive}
                    onReconnect={setReconnectingAccountId}
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
                    <h2 className="text-base font-medium">{categoryLabels[category]}</h2>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {providers.map((provider) => (
                        <ToolCard
                          key={provider.id}
                          provider={provider}
                          onConnect={setConnectingProvider}
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
              DB90 only stores your account identifier and, if provided, your API token —
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
    </div>
  );
}
