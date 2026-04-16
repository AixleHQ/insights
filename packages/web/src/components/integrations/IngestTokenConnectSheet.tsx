import { useState, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';
import { useOrg } from '@/contexts/OrgContext';
import { useCreateToolAccount } from '@/hooks/useApi';
import { ApiError } from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProviderLogo } from '@/components/icons';
import type { ProviderInfo } from './IntegrationCard';

interface IngestTokenConnectSheetProps {
  provider: ProviderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-existing token — opens directly to the setup step (used after regeneration) */
  initialToken?: string;
}

const TOOL_NAME_MAP: Record<string, string> = {
  'claude-code': 'claude_code',
  cursor: 'cursor',
};

function SetupInstructions({ providerId, token }: { providerId: string; token: string }) {
  if (providerId === 'claude-code') {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Add to <code className="text-xs bg-muted px-1 py-0.5 rounded">~/.claude/settings.json</code></p>
        <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
{`{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST ${window.location.origin}/api/v1/ingest/events -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}`}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Run the db90 Cursor reporter</p>
      <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">
        {`npx db90-cursor --token ${token}`}
      </pre>
    </div>
  );
}

export function IngestTokenConnectSheet({
  provider,
  open,
  onOpenChange,
  onSuccess,
  initialToken,
}: IngestTokenConnectSheetProps) {
  const { currentOrg } = useOrg();
  const createToolAccount = useCreateToolAccount();

  const [step, setStep] = useState<'connect' | 'setup'>(initialToken ? 'setup' : 'connect');
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && initialToken) {
      setStep('setup');
      setToken(initialToken);
      setCopied(false);
      setError(null);
    }
  }, [open, initialToken]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep('connect');
      setToken(null);
      setCopied(false);
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleConnect = async () => {
    if (!provider || !currentOrg) return;
    setError(null);
    setIsSubmitting(true);

    const toolName = TOOL_NAME_MAP[provider.id];
    if (!toolName) {
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createToolAccount.mutateAsync({
        orgId: currentOrg.id,
        toolName,
      });
      const rawToken = result.data.ingestToken ?? null;
      setToken(rawToken);
      setStep('setup');
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { errors?: Record<string, string[]> } | null;
        const firstError = data?.errors && Object.values(data.errors)[0]?.[0];
        setError(firstError ?? err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    handleOpenChange(false);
    onSuccess();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <div className="flex items-center gap-3">
            {provider && (
              <ProviderLogo provider={provider.id} size="md" showBackground />
            )}
            <div>
              <SheetTitle>{provider?.name}</SheetTitle>
              <SheetDescription>{provider?.description}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {step === 'connect' && (
            <>
              {provider?.features && provider.features.length > 0 && (
                <ul className="space-y-1">
                  {provider.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="size-3.5 shrink-0 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </>
          )}

          {step === 'setup' && token && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Your ingest token</p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={token}
                    className="font-mono text-xs"
                    aria-label="Ingest token"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    aria-label={copied ? 'Copied' : 'Copy token'}
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This token will not be shown again. Copy it now.
                </p>
              </div>

              {provider && <SetupInstructions providerId={provider.id} token={token} />}
            </div>
          )}
        </div>

        <SheetFooter>
          {step === 'connect' ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConnect}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Connecting…' : 'Connect'}
              </Button>
            </>
          ) : (
            <Button onClick={handleDone}>Done</Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
