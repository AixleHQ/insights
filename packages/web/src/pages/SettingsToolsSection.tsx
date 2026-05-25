import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import { useMyToolAccounts, useMcpIngestExchange } from "@/hooks/useApi";
import { DB90_CLI_CLAUDE_SETUP_COMMAND } from "@/lib/db90-cli";
import { formatDateTime } from "@/lib/formatters";
import type { McpIngestExchangeData } from "@/lib/types";
import { ToolAccounts } from "./ToolAccounts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

function extractIngestToken(data: McpIngestExchangeData, toolName: string): string | undefined {
  if (data.ingestToken) return data.ingestToken;
  return data.accounts?.[toolName]?.ingestToken;
}

export function SettingsToolsSection() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id ?? "";
  const { data: ingestRows, isLoading, isError, error } = useMyToolAccounts(orgId);
  const mcpExchange = useMcpIngestExchange();

  const [revealedByAccountId, setRevealedByAccountId] = useState<Record<string, string>>({});
  const [copyFlash, setCopyFlash] = useState<string | null>(null);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const copyFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyFlashTimeoutRef.current != null) {
        clearTimeout(copyFlashTimeoutRef.current);
      }
    };
  }, []);

  const sortedRows = useMemo(() => {
    if (!ingestRows) return [];
    return [...ingestRows].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [ingestRows]);

  async function handleCopy(text: string, flashKey: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFlash(flashKey);
      if (copyFlashTimeoutRef.current != null) {
        clearTimeout(copyFlashTimeoutRef.current);
      }
      copyFlashTimeoutRef.current = setTimeout(() => {
        copyFlashTimeoutRef.current = null;
        setCopyFlash((k) => (k === flashKey ? null : k));
      }, 2000);
    } catch {
      setCopyFlash(null);
    }
  }

  async function handleRotate(accountId: string, toolName: string) {
    try {
      setRotationError(null);
      const data = await mcpExchange.mutateAsync({ toolName, orgId });
      if (data.organizationId !== orgId) {
        throw new Error("Rotation returned a token for a different organization");
      }

      const token = extractIngestToken(data, toolName);
      if (token) {
        setRevealedByAccountId((prev) => ({ ...prev, [accountId]: token }));
      }
    } catch (err) {
      if (!mcpExchange.isError) {
        setRotationError(err instanceof Error ? err.message : "Rotation failed");
      }
      // TanStack Query keeps the mutation error for the alert; avoid an unhandled promise rejection.
    }
  }

  const exchangeError =
    rotationError ??
    (mcpExchange.isError && mcpExchange.error instanceof Error
      ? mcpExchange.error.message
      : mcpExchange.isError
        ? "Rotation failed"
        : null);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Ingest tokens</CardTitle>
          <CardDescription>
            Copy or rotate DB90 ingest credentials for Claude Code and Cursor. Tokens are only shown
            immediately after rotation — use the CLI or MCP flow for first-time setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!orgId ? (
            <p className="text-sm text-muted-foreground">Select an organization to manage ingest tokens.</p>
          ) : isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load ingest tokens</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "Unknown error"}
              </AlertDescription>
            </Alert>
          ) : sortedRows.length === 0 ? (
            <div className="space-y-4 rounded-lg border border-dashed bg-muted/30 p-6">
              <p className="text-sm text-muted-foreground">
                No ingest-linked tools yet. Install the DB90 CLI and sign in to create your ingest
                token, or connect via the dashboard MCP setup path.
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Recommended command</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{DB90_CLI_CLAUDE_SETUP_COMMAND}</pre>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopy(DB90_CLI_CLAUDE_SETUP_COMMAND, "empty-cmd")}
                >
                  <Copy className="mr-2 size-4" />
                  {copyFlash === "empty-cmd" ? "Copied" : "Copy command"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {exchangeError && (
                <Alert variant="destructive">
                  <AlertTitle>Rotation failed</AlertTitle>
                  <AlertDescription>{exchangeError}</AlertDescription>
                </Alert>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row) => {
                    const revealed = revealedByAccountId[row.id];
                    const canCopy = !!revealed;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.displayName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDateTime(row.lastUsedAt)}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!canCopy}
                            title={
                              canCopy
                                ? "Copy ingest token"
                                : "Rotate to receive a new token you can copy once"
                            }
                            onClick={() =>
                              revealed ? void handleCopy(revealed, `tok-${row.id}`) : undefined
                            }
                          >
                            <Copy className="mr-1 size-3.5" />
                            {copyFlash === `tok-${row.id}` ? "Copied" : "Copy token"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={mcpExchange.isPending}
                            onClick={() => void handleRotate(row.id, row.toolName)}
                          >
                            {mcpExchange.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="mr-1 size-3.5" />
                                Rotate
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {Object.keys(revealedByAccountId).length > 0 && (
                <Alert>
                  <AlertTitle>New token</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>
                      Your previous ingest token for the rotated tool is no longer valid. Copy the
                      new value now — it will not appear in this list after you leave the page.
                    </p>
                    {sortedRows.map((row) => {
                      const t = revealedByAccountId[row.id];
                      if (!t) return null;
                      return (
                        <div key={row.id} className="space-y-1">
                          <p className="text-xs font-medium">{row.displayName}</p>
                          <pre className="max-h-24 overflow-auto rounded bg-muted p-2 text-xs break-all">
                            {t}
                          </pre>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleCopy(t, `reveal-${row.id}`)}
                          >
                            <Copy className="mr-2 size-3.5" />
                            {copyFlash === `reveal-${row.id}` ? "Copied" : "Copy new token"}
                          </Button>
                        </div>
                      );
                    })}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked tool accounts</CardTitle>
          <CardDescription>
            Connect or disconnect additional providers for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToolAccounts embedded />
        </CardContent>
      </Card>
    </div>
  );
}
