import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Github,
  Check,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useToolAccounts, useDeleteToolAccount, useCreateToolAccount, useUpdateToolAccount, useUserOrganizations } from '@/hooks/useApi';
import type { ToolAccount } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
} from '@/components/ui/alert-dialog';

interface ToolProvider {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  tokenLabel: string;
}

const toolProviders: ToolProvider[] = [
  {
    id: 'claude_code',
    name: 'Claude Code',
    description: 'Link your Anthropic account to attribute Claude Code usage',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 22h20L12 2zm0 6l6 12H6l6-12z" />
      </svg>
    ),
    color: 'bg-[#d4a27f]',
    tokenLabel: 'Access Token',
  },
  {
    id: 'github_copilot',
    name: 'GitHub Copilot',
    description: 'Link your GitHub account to attribute Copilot events',
    icon: <Github className="size-5" />,
    color: 'bg-[#24292f]',
    tokenLabel: 'Personal Access Token',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Link your Cursor account for AI code editor attribution',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    color: 'bg-[#6366f1]',
    tokenLabel: 'API Key',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Link your Windsurf account for AI-assisted coding attribution',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
      </svg>
    ),
    color: 'bg-[#0ea5e9]',
    tokenLabel: 'API Key',
  },
  {
    id: 'openai_api',
    name: 'OpenAI',
    description: 'Link your OpenAI account for ChatGPT / Codex tracking',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681z" />
      </svg>
    ),
    color: 'bg-[#10a37f]',
    tokenLabel: 'API Key',
  },
  {
    id: 'anthropic_api',
    name: 'Anthropic API',
    description: 'Link your Anthropic API account for direct API usage tracking',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 22h20L12 2zm0 6l6 12H6l6-12z" />
      </svg>
    ),
    color: 'bg-[#cc785c]',
    tokenLabel: 'API Key',
  },
  {
    id: 'gemini_api',
    name: 'Gemini',
    description: 'Link your Google account for Gemini API usage tracking',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-5h2v2h-2zm0-8h2v6h-2z" />
      </svg>
    ),
    color: 'bg-[#4285f4]',
    tokenLabel: 'API Key',
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'Link your Aider account for AI pair programming attribution',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    color: 'bg-[#7c3aed]',
    tokenLabel: 'API Key',
  },
];

function AccountSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <Skeleton className="size-9" />
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
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setAccountId('');
      setAccountName('');
      setToken('');
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
      setError('Failed to connect account. Please try again.');
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
              {isSubmitting ? 'Connecting...' : 'Connect Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToolRow({
  provider,
  linkedAccount,
  onConnect,
  onDisconnect,
  onToggleActive,
  isToggling,
}: {
  provider: ToolProvider;
  linkedAccount?: ToolAccount;
  onConnect: (provider: ToolProvider) => void;
  onDisconnect: (accountId: string) => void;
  onToggleActive?: (accountId: string, newValue: boolean) => void;
  isToggling?: boolean;
}) {
  const isLinked = !!linkedAccount;

  return (
    <div className={cn('flex items-center justify-between rounded-lg border p-4', isLinked && !linkedAccount.isActive && 'opacity-60')}>
      <div className="flex items-center gap-4">
        <div
          className={`flex size-10 items-center justify-center rounded-lg text-white ${provider.color}`}
        >
          {provider.icon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{provider.name}</span>
            {isLinked && (
              <Badge
                variant="outline"
                className={linkedAccount.isActive ? 'text-success' : 'text-muted-foreground'}
              >
                <Check className="mr-1 size-3" />
                {linkedAccount.isActive ? 'Connected' : 'Disabled'}
              </Badge>
            )}
            {isLinked && linkedAccount.tokenExpired && (
              <Badge variant="outline" className="border-warning/50 text-warning">
                <AlertTriangle className="mr-1 size-3" />
                Token expired
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isLinked
              ? `Linked as ${linkedAccount.externalUsername || linkedAccount.externalUserId}`
              : provider.description}
          </p>
        </div>
      </div>

      {isLinked ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleActive?.(linkedAccount.id, !linkedAccount.isActive)}
            disabled={isToggling}
          >
            {linkedAccount.isActive ? 'Disable' : 'Enable'}
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
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => onConnect(provider)}>
          <Plus className="mr-2 size-4" />
          Connect
        </Button>
      )}
    </div>
  );
}

export function ToolAccounts({ embedded = false }: { embedded?: boolean }) {
  const { currentOrg } = useOrg();
  const { data: orgs, isLoading: orgsLoading } = useUserOrganizations();
  // null means "follow the global org context"; a string means user manually picked an org
  const [userSelectedOrgId, setUserSelectedOrgId] = useState<string | null>(null);
  const selectedOrgId = userSelectedOrgId ?? currentOrg?.id ?? '';
  const [connectingProvider, setConnectingProvider] = useState<ToolProvider | null>(null);

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
      console.error('Failed to disconnect account:', error);
    }
  };

  const handleToggleActive = async (accountId: string, isActive: boolean) => {
    if (!selectedOrgId) return;
    try {
      await updateAccount.mutateAsync({ orgId: selectedOrgId, accountId, isActive });
    } catch (error) {
      console.error('Failed to update account status:', error);
    }
  };

  return (
    <div className={cn('space-y-6', !embedded && 'mx-auto max-w-2xl')}>
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
          Organisation
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
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <AccountSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {connectedProviders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Connected
              </h2>
              {connectedProviders.map((provider) => (
                <ToolRow
                  key={provider.id}
                  provider={provider}
                  linkedAccount={linkedProviders.get(provider.id)}
                  onConnect={setConnectingProvider}
                  onDisconnect={handleDisconnect}
                  onToggleActive={handleToggleActive}
                  isToggling={updateAccount.isPending && updateAccount.variables?.accountId === linkedProviders.get(provider.id)?.id}
                />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Available
            </h2>
            {availableProviders.length > 0 ? (
              availableProviders.map((provider) => (
                <ToolRow
                  key={provider.id}
                  provider={provider}
                  onConnect={setConnectingProvider}
                  onDisconnect={handleDisconnect}
                />
              ))
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                All available tools are connected.
              </p>
            )}
          </div>
        </>
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
    </div>
  );
}
