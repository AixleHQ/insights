import { useState, useEffect, useRef } from "react";
import { Check, Copy } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useCreateToolAccount } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderLogo } from "@/components/icons";
import type { ProviderInfo } from "./IntegrationCard";
import {
  buildAixleInsightsInitCommand,
  defaultAixleChannel,
  isAixleChannelSelectable,
  type AixleChannel,
} from "@/lib/aixle-cli";

interface IngestTokenConnectSheetProps {
  provider: ProviderInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-existing token — opens directly to the setup step (used after regeneration) */
  initialToken?: string;
}

const TOOL_NAME_MAP: Record<string, string> = {
  "claude-code": "claude_code",
  cursor: "cursor",
};

function ingestEndpointUrl(): string {
  // VITE_INGEST_BASE_URL is the direct API base URL for shell hooks — these run
  // outside the browser and bypass the Vite proxy, so they need the real API
  // address (e.g. http://localhost:3000 in dev, https://api.example.com in prod).
  const ingestBase = import.meta.env.VITE_INGEST_BASE_URL;
  if (ingestBase) {
    return `${ingestBase}/api/v1/ingest/events`;
  }
  // Fall back: if VITE_API_URL is already absolute (production), use it directly.
  const apiBase = import.meta.env.VITE_API_URL ?? "/api/v1";
  if (apiBase.startsWith("http")) {
    return `${apiBase}/ingest/events`;
  }
  // Last resort: same origin (works in production where web and API share a domain).
  return `${window.location.origin}${apiBase}/ingest/events`;
}

function buildClaudeCodeSettingsSnippet(token: string): string {
  const ingestUrl = ingestEndpointUrl();
  return `{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{event_type:\\"tool_use\\",metadata:{session_id:.session_id,hook_tool:.tool_name}}' | curl -s -X POST ${ingestUrl} -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "tee /tmp/cc_stop_payload.json | python3 -c \\"import sys,json,os,urllib.request as R,collections as C\\np=json.load(sys.stdin);s=p.get('session_id','');f=p.get('transcript_path','');ti=to=cw=cr=0;mc=C.Counter()\\nfor l in (open(f) if f and os.path.exists(f) else []):\\n try:e=json.loads(l)\\n except:continue\\n if e.get('type')!='assistant' or 'message' not in e:continue\\n msg=e['message'];mc[msg.get('model','')]+=1;u=msg.get('usage',{})\\n w=u.get('cache_creation_input_tokens',0);r2=u.get('cache_read_input_tokens',0)\\n ti+=u.get('input_tokens',0)+w+r2;to+=u.get('output_tokens',0);cw+=w;cr+=r2\\npm=mc.most_common(1)[0][0] if mc else None\\nev={k:v for k,v in {'event_type':'chat','tokens_in':ti or None,'tokens_out':to or None,'tokens_total':(ti+to) or None,'model':pm,'metadata':{k:v for k,v in {'session_id':s,'cache_write_tokens':cw or None,'cache_read_tokens':cr or None}.items() if v}}.items() if v is not None}\\nreq=R.Request('${ingestUrl}',json.dumps(ev).encode(),{'Authorization':'Bearer ${token}','Content-Type':'application/json'},method='POST')\\ntry:R.urlopen(req,timeout=5)\\nexcept:pass\\""
          }
        ]
      }
    ]
  }
}`;
}

/**
 * Stable / Staging selector for the npm release channel (AIX-614).
 *
 * Only the npm package spec differs today — both channels target the environment
 * serving this sheet. See `resolveAixleChannelTarget` for why host is duplicated
 * rather than hoisted.
 *
 * Renders nothing on production (AIX-618): production users always want stable, so
 * the control and its explanatory copy are removed outright rather than disabled — a
 * disabled toggle still makes the reader stop and consider a choice they don't have.
 * The surrounding `init` instructions already say everything they need.
 *
 * Callers keep passing `channel`/`onChange` unconditionally; the state defaults to
 * `stable` on production anyway, so with the control gone the value simply never changes.
 */
function ChannelSelector({
  channel,
  onChange,
}: {
  channel: AixleChannel;
  onChange: (next: AixleChannel) => void;
}) {
  if (!isAixleChannelSelectable()) return null;

  // Deliberately NOT a Tabs control: this is a mutually-exclusive choice, not tabbed
  // panels, so radiogroup is the correct role. It also keeps the Cursor path free of
  // `role="tab"` elements, which a test asserts (that path has no MCP/hooks tabs).
  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label="npm release channel"
        className="inline-flex rounded-md border p-0.5 gap-0.5"
      >
        {(["stable", "staging"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            role="radio"
            aria-checked={channel === value}
            variant={channel === value ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onChange(value)}
            className="text-xs h-auto py-1 px-2.5"
          >
            {value === "stable" ? "Stable" : "Staging"}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {channel === "stable" ? (
          <>
            <strong>Stable</strong> is what everyone runs — a plain version with no suffix.
          </>
        ) : (
          <>
            <strong>Staging</strong> installs an unreleased QA build (version ends in{" "}
            <code className="bg-muted px-1 rounded">-staging</code>). It may change or break
            without notice.
          </>
        )}
      </p>
    </div>
  );
}

function ClaudeCodeSetupInstructions({ token }: { token: string }) {
  const [copiedInit, setCopiedInit] = useState(false);
  const [copiedSettings, setCopiedSettings] = useState(false);
  const [channel, setChannel] = useState<AixleChannel>(defaultAixleChannel);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (initTimerRef.current) clearTimeout(initTimerRef.current);
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
  }, []);

  const initCommand = buildAixleInsightsInitCommand(channel);
  const settingsSnippet = buildClaudeCodeSettingsSnippet(token);

  const handleCopyInit = async () => {
    try {
      await navigator.clipboard.writeText(initCommand);
      setCopiedInit(true);
      initTimerRef.current = setTimeout(() => setCopiedInit(false), 2000);
    } catch {
      // clipboard access denied — non-critical
    }
  };

  const handleCopySettings = async () => {
    try {
      await navigator.clipboard.writeText(settingsSnippet);
      setCopiedSettings(true);
      settingsTimerRef.current = setTimeout(() => setCopiedSettings(false), 2000);
    } catch {
      // clipboard access denied — non-critical
    }
  };

  return (
    <div className="space-y-3">
      <Tabs defaultValue="mcp-recommended">
        <TabsList className="w-full justify-start gap-1.5 flex-wrap h-auto group-data-[orientation=horizontal]/tabs:h-auto min-h-9 rounded-md">
          <TabsTrigger value="mcp-recommended" className="text-xs flex-none h-auto py-1.5 px-2">
            MCP (recommended)
          </TabsTrigger>
          <TabsTrigger value="advanced-hooks" className="text-xs flex-none h-auto py-1.5 px-2">
            Advanced hooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mcp-recommended" className="space-y-2 pt-2">
          <ChannelSelector channel={channel} onChange={setChannel} />
          <p className="text-xs text-muted-foreground">
            One-time Keycloak device login installs the MCP entry in <code className="bg-muted px-1 rounded whitespace-pre-wrap break-all">~/.claude.json</code>.
            Omit <code className="bg-muted px-1 rounded">--tool-name</code> during <code className="bg-muted px-1 rounded">init</code> so both Claude Code and Cursor accounts can auto-forward telemetry when Integration Connect has provisioned them — no pasted ingest token needed for this path.
          </p>
          <div className="flex items-start gap-2">
            <pre
              className="text-xs bg-muted rounded p-3 overflow-x-auto flex-1 whitespace-pre-wrap break-all"
              aria-label="Recommended MCP install command"
            >
              {initCommand}
            </pre>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyInit}
              aria-label={copiedInit ? "Copied MCP init command" : "Copy MCP init command"}
              className="shrink-0 mt-0.5"
            >
              {copiedInit ? <Check className="size-3.5 mr-1" /> : <Copy className="size-3.5 mr-1" />}
              {copiedInit ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            After provisioning through this sheet, rerun <code className="bg-muted px-1 rounded whitespace-pre-wrap break-all">{initCommand}</code> whenever you rotate hosts or reinstall.
            Troubleshooting: issuer configuration, duplicate <code className="bg-muted px-1 rounded">aixle-insights</code> MCP entries (<code className="bg-muted px-1 rounded">init --force</code>), logs under <code className="bg-muted px-1 rounded">~/.aixle-insights</code> — see <code className="bg-muted px-1 rounded">@aixle/insights</code> README.
          </p>
        </TabsContent>

        <TabsContent value="advanced-hooks" className="space-y-2 pt-2">
          <p className="text-sm font-medium">PostToolUse / Stop hooks (optional, brittle)</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Snippet for <code className="bg-muted px-1 py-0.5 rounded">~/.claude/settings.json</code></p>
            <Button variant="outline" size="sm" onClick={handleCopySettings} aria-label={copiedSettings ? "Copied Claude hook settings snippet" : "Copy Claude hook settings snippet"}>
              {copiedSettings ? <Check className="size-3.5 mr-1" /> : <Copy className="size-3.5 mr-1" />}
              {copiedSettings ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="text-xs bg-muted rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {settingsSnippet}
          </pre>
          <p className="text-xs text-muted-foreground">
            The PostToolUse hook requires <code className="bg-muted px-1 rounded">jq</code>. The Stop hook uses <code className="bg-muted px-1 rounded">python3</code> — still needs the pasted ingest token in each curl invocation.
          </p>
        </TabsContent>
      </Tabs>

      <div className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
        Prefer the MCP tab whenever possible — Advanced hooks above still require copying the ingest token shown above.
      </div>
    </div>
  );
}

function CursorSetupInstructions() {
  const [copiedInit, setCopiedInit] = useState(false);
  const [channel, setChannel] = useState<AixleChannel>(defaultAixleChannel);
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (initTimerRef.current) clearTimeout(initTimerRef.current);
  }, []);

  const initCommand = buildAixleInsightsInitCommand(channel);

  const handleCopyInit = async () => {
    try {
      await navigator.clipboard.writeText(initCommand);
      setCopiedInit(true);
      initTimerRef.current = setTimeout(() => setCopiedInit(false), 2000);
    } catch {
      // clipboard access denied — non-critical
    }
  };

  return (
    <div className="space-y-2">
      <ChannelSelector channel={channel} onChange={setChannel} />
      <p className="text-xs text-muted-foreground">
        One-time Keycloak device login stores credentials in{" "}
        <code className="bg-muted px-1 rounded whitespace-pre-wrap break-all">~/.aixle-insights</code>.
        After provisioning Cursor through this sheet, run{" "}
        <code className="bg-muted px-1 rounded">init</code> — add{" "}
        <code className="bg-muted px-1 rounded">--tool-name cursor</code> if you only use Cursor
        (skips Claude MCP install in{" "}
        <code className="bg-muted px-1 rounded whitespace-pre-wrap break-all">~/.claude.json</code>
        ). Omit <code className="bg-muted px-1 rounded">--tool-name</code> when you also use Claude
        Code. No pasted ingest token needed for this path.
      </p>
      <div className="flex items-start gap-2">
        <pre
          className="text-xs bg-muted rounded p-3 overflow-x-auto flex-1 whitespace-pre-wrap break-all"
          aria-label="Recommended MCP install command"
        >
          {initCommand}
        </pre>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyInit}
          aria-label={copiedInit ? "Copied MCP init command" : "Copy MCP init command"}
          className="shrink-0 mt-0.5"
        >
          {copiedInit ? <Check className="size-3.5 mr-1" /> : <Copy className="size-3.5 mr-1" />}
          {copiedInit ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cursor telemetry syncs from the MCP process (e.g.{" "}
        <code className="bg-muted px-1 rounded">aixle-insights run --once</code> or{" "}
        <code className="bg-muted px-1 rounded">aixle_insights_sync_now</code> when Claude Code has the Aixle Insights
        MCP). For Cursor-only workflows without Claude Code, schedule{" "}
        <code className="bg-muted px-1 rounded">aixle-insights run --once</code> via cron or launchd — see{" "}
        <code className="bg-muted px-1 rounded">@aixle/insights</code> README.
      </p>
    </div>
  );
}

function SetupInstructions({ providerId, token }: { providerId: string; token: string }) {
  if (providerId === "claude-code") {
    return <ClaudeCodeSetupInstructions token={token} />;
  }

  if (providerId === "cursor") {
    return <CursorSetupInstructions />;
  }

  return null;
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

  const [step, setStep] = useState<"connect" | "setup">(initialToken ? "setup" : "connect");
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  useEffect(() => {
    if (open && initialToken) {
      setStep("setup");
      setToken(initialToken);
      setCopied(false);
      setError(null);
    }
  }, [open, initialToken]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStep("connect");
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
      setStep("setup");
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { errors?: Record<string, string[]> } | null;
        const firstError = data?.errors && Object.values(data.errors)[0]?.[0];
        setError(firstError ?? err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied — non-critical
    }
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {step === "connect" && (
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

          {step === "setup" && token && (
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
                    aria-label={copied ? "Copied" : "Copy token"}
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
          {step === "connect" ? (
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
                {isSubmitting ? "Connecting…" : "Connect"}
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
