import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Github,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useToolAccounts, useDeleteToolAccount, useCreateToolAccount } from '@/hooks/useApi';
import type { ToolAccount } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
}

const toolProviders: ToolProvider[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Link your GitHub account to attribute Copilot events',
    icon: <Github className="size-5" />,
    color: 'bg-[#24292f]',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Link your GitLab account for Duo AI attribution',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
      </svg>
    ),
    color: 'bg-[#fc6d26]',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Link your Anthropic account for Claude usage tracking',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 22h20L12 2zm0 6l6 12H6l6-12z" />
      </svg>
    ),
    color: 'bg-[#d4a27f]',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Link your OpenAI account for ChatGPT/Codex tracking',
    icon: (
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681z" />
      </svg>
    ),
    color: 'bg-[#10a37f]',
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

interface ConnectDialogProps {
  provider: ToolProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (providerId: string, accountId: string, accountName: string) => Promise<void>;
  isSubmitting: boolean;
}

function ConnectDialog({ provider, open, onOpenChange, onSubmit, isSubmitting }: ConnectDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [accountName, setAccountName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !accountId.trim()) return;
    await onSubmit(provider.id, accountId.trim(), accountName.trim());
    setAccountId('');
    setAccountName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

export function ToolAccounts() {
  const { currentOrg } = useOrg();
  const [connectingProvider, setConnectingProvider] = useState<ToolProvider | null>(null);

  const { data: accounts, isLoading } = useToolAccounts(currentOrg?.id || '');
  const createAccount = useCreateToolAccount();
  const deleteAccount = useDeleteToolAccount();

  // Map linked accounts by provider
  const linkedProviders = useMemo(() => {
    const map = new Map<string, ToolAccount>();
    accounts?.forEach((account) => {
      map.set(account.provider, account);
    });
    return map;
  }, [accounts]);

  const handleConnect = (provider: ToolProvider) => {
    setConnectingProvider(provider);
  };

  const handleConnectSubmit = async (providerId: string, accountId: string, _accountName: string) => {
    if (!currentOrg) return;
    try {
      await createAccount.mutateAsync({
        orgId: currentOrg.id,
        provider: providerId,
        code: accountId, // Using code field for account ID
      });
    } catch (error) {
      console.error('Failed to connect account:', error);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!currentOrg) return;
    try {
      await deleteAccount.mutateAsync({ orgId: currentOrg.id, accountId });
    } catch (error) {
      console.error('Failed to disconnect account:', error);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Why Link Accounts?</CardTitle>
          <CardDescription>
            When you link your tool accounts, DB90 can automatically attribute AI tool
            events to you based on your API keys and account identifiers. This enables:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-success" />
              Automatic attribution of events to your user profile
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-success" />
              Personal usage analytics and cost tracking
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-success" />
              Team-level insights and productivity metrics
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Available Integrations</h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <AccountSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {toolProviders.map((provider) => {
              const linkedAccount = linkedProviders.get(provider.id);
              const isLinked = !!linkedAccount;

              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
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
                          <Badge variant="outline" className="text-success">
                            <Check className="mr-1 size-3" />
                            Connected
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {isLinked
                          ? `Linked as ${linkedAccount.external_username || linkedAccount.external_id}`
                          : provider.description}
                      </p>
                    </div>
                  </div>

                  {isLinked ? (
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
                            This will unlink your {provider.name} account. Future events
                            from this tool may not be attributed to you.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDisconnect(linkedAccount.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => handleConnect(provider)}>
                      <Plus className="mr-2 size-4" />
                      Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Card className="border-muted bg-muted/50">
        <CardContent className="flex items-start gap-4 p-4">
          <AlertCircle className="size-5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Privacy Note</p>
            <p className="text-muted-foreground">
              DB90 only stores your account identifier for attribution purposes.
              We do not store your credentials or access your tool data directly.
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
