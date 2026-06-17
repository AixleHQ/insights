import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Building2,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  AlertTriangle,
  UserPlus,
  Shield,
  Copy,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useInvitationByToken, useAcceptInvitation } from "@/hooks/useApi";
import {
  buildDb90ClaudeIngestExampleCommand,
  buildDb90CursorIngestExampleCommand,
} from "@/lib/db90-cli";
import { formatLongUsDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatExpirationDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return formatLongUsDate(date);
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  switch (role) {
    case "owner":
      return "default";
    case "member":
      return "secondary";
    default:
      return "outline";
  }
}

function getRoleDescription(role: string): string {
  switch (role) {
    case "owner":
      return "Full control over organization settings and member management";
    case "member":
      return "View dashboards and contribute to projects";
    case "viewer":
      return "Read-only access to organization data";
    default:
      return "Access to organization resources";
  }
}

function getAcceptedInvitationStorageKey(token: string): string {
  return `db90:accepted-invitation:${token}`;
}

export function InvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();
  const { refreshOrganizations, setCurrentOrg } = useOrg();
  const acceptedInvitationStorageKey = token ? getAcceptedInvitationStorageKey(token) : null;

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState(() => {
    if (!acceptedInvitationStorageKey || typeof window === "undefined") {
      return false;
    }

    return window.sessionStorage.getItem(acceptedInvitationStorageKey) === "true";
  });
  const [copiedExampleCli, setCopiedExampleCli] = useState<"claude" | "cursor" | null>(null);

  const claudeExampleCommand = useMemo(() => buildDb90ClaudeIngestExampleCommand(), []);
  const cursorExampleCommand = useMemo(() => buildDb90CursorIngestExampleCommand(), []);

  // Fetch invitation details
  const {
    data: invitation,
    isLoading,
    error,
  } = useInvitationByToken(token || "");

  const acceptInvitation = useAcceptInvitation();

  const handleAccept = async () => {
    if (!token) return;

    setIsAccepting(true);
    setAcceptError(null);

    try {
      const result = await acceptInvitation.mutateAsync(token);
      const acceptedOrganization = result.data?.organization;

      if (acceptedInvitationStorageKey) {
        window.sessionStorage.setItem(acceptedInvitationStorageKey, "true");
      }
      setAcceptSuccess(true);

      if (acceptedOrganization) {
        try {
          setCurrentOrg({
            id: acceptedOrganization.id,
            name: acceptedOrganization.name,
            slug: acceptedOrganization.slug,
            is_active: true,
          });
        } catch (orgError) {
          console.error("Failed to set accepted organization:", orgError);
        }
      }

      // Refresh the org list in the background so the success card is not blocked by it.
      void refreshOrganizations().catch((refreshError) => {
        console.error("Failed to refresh organizations after invitation accept:", refreshError);
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to accept invitation";
      setAcceptError(message);
    } finally {
      setIsAccepting(false);
    }
  };

  // Determine the current state for rendering
  const isNotFound = error?.message?.includes("404") || error?.message?.includes("Not Found");
  const isExpired = invitation?.expired || invitation?.status === "expired";
  const isRevoked = invitation?.status === "revoked";
  const isAlreadyAccepted = invitation?.status === "accepted";

  const handleContinueToDashboard = () => {
    if (acceptedInvitationStorageKey) {
      window.sessionStorage.removeItem(acceptedInvitationStorageKey);
    }
    navigate("/");
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Subtle background pattern */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 size-1/2 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 size-1/2 rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
              <span className="font-mono text-sm font-bold text-primary-foreground">
                90
              </span>
            </div>
            <span className="type-h4">Aixle Insights</span>
          </Link>
          {profile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{profile.email}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Loading State */}
          {isLoading && (
            <Card className="animate-pulse border-2">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <div className="space-y-2">
                  <div className="mx-auto h-6 w-48 rounded bg-muted" />
                  <div className="mx-auto h-4 w-64 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Not Found State */}
          {!isLoading && isNotFound && (
            <Card className="border-2 border-destructive/20">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
                  <XCircle className="size-8 text-destructive" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Invitation Not Found</CardTitle>
                  <CardDescription className="text-base">
                    This invitation link is invalid or has been removed. Please
                    check the link or contact the person who invited you.
                  </CardDescription>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/">
                    Go to Home
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Expired State */}
          {!isLoading && !isNotFound && isExpired && (
            <Card className="border-2 border-warning/20">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-warning/10">
                  <Clock className="size-8 text-warning" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Invitation Expired</CardTitle>
                  <CardDescription className="text-base">
                    This invitation to join{" "}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>{" "}
                    has expired. Please ask{" "}
                    <span className="font-medium text-foreground">
                      {invitation?.invitedByName}
                    </span>{" "}
                    to send you a new invitation.
                  </CardDescription>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/">
                    Go to Home
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Revoked State */}
          {!isLoading && !isNotFound && isRevoked && (
            <Card className="border-2 border-destructive/20">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10">
                  <AlertTriangle className="size-8 text-destructive" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Invitation Revoked</CardTitle>
                  <CardDescription className="text-base">
                    This invitation to join{" "}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>{" "}
                    has been revoked. If you believe this is a mistake, please
                    contact the organization administrator.
                  </CardDescription>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/">
                    Go to Home
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Already Accepted State */}
          {!isLoading && !isNotFound && isAlreadyAccepted && !acceptSuccess && (
            <Card className="border-2 border-success/20">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-success/10">
                  <CheckCircle2 className="size-8 text-success" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Already a Member</CardTitle>
                  <CardDescription className="text-base">
                    This invitation has already been accepted. You're a member of{" "}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>
                    .
                  </CardDescription>
                </div>
                <Button asChild>
                  <Link to="/">
                    Go to Dashboard
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Success State */}
          {!isLoading && acceptSuccess && (
            <Card className="border-2 border-success/30">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-success/10">
                  <CheckCircle2 className="size-8 text-success animate-in zoom-in-50 duration-300" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">You&apos;re connected</CardTitle>
                  <CardDescription className="text-base">
                    Your account is linked to{" "}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>
                    . Link your AI tools next so Aixle Insights can receive telemetry.
                  </CardDescription>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-left space-y-3">
                  <p className="type-label text-foreground">Link your AI tools</p>
                  <p className="text-sm text-muted-foreground">
                    After you create an ingest token in Settings → Tools (or Integrations), replace{" "}
                    <code className="rounded bg-background px-1 py-0.5 text-xs">
                      &lt;YOUR_INGEST_TOKEN&gt;
                    </code>{" "}
                    and run the command for your editor on the machine where you work:
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <p className="text-caption font-medium text-muted-foreground">Claude Code</p>
                      <pre className="overflow-x-auto rounded-md bg-background border p-3 text-xs font-mono whitespace-pre-wrap break-all">
                        {claudeExampleCommand}
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(claudeExampleCommand);
                            setCopiedExampleCli("claude");
                            window.setTimeout(() => setCopiedExampleCli(null), 2000);
                          } catch {
                            setCopiedExampleCli(null);
                          }
                        }}
                      >
                        <Copy className="mr-2 size-4" />
                        {copiedExampleCli === "claude" ? "Copied" : "Copy command"}
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-caption font-medium text-muted-foreground">Cursor</p>
                      <pre className="overflow-x-auto rounded-md bg-background border p-3 text-xs font-mono whitespace-pre-wrap break-all">
                        {cursorExampleCommand}
                      </pre>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(cursorExampleCommand);
                            setCopiedExampleCli("cursor");
                            window.setTimeout(() => setCopiedExampleCli(null), 2000);
                          } catch {
                            setCopiedExampleCli(null);
                          }
                        }}
                      >
                        <Copy className="mr-2 size-4" />
                        {copiedExampleCli === "cursor" ? "Copied" : "Copy command"}
                      </Button>
                    </div>
                  </div>
                </div>
                <Button size="lg" className="w-full" onClick={handleContinueToDashboard}>
                  Continue to dashboard
                  <ArrowRight className="ml-2 size-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Valid Invitation - Ready to Accept */}
          {!isLoading &&
            !isNotFound &&
            !isExpired &&
            !isRevoked &&
            !isAlreadyAccepted &&
            !acceptSuccess &&
            invitation && (
              <Card className="border-2 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="items-center pb-4">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                    <UserPlus className="size-8 text-primary" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Organization Info */}
                  <div className="space-y-2 text-center">
                    <CardTitle className="text-xl">
                      You've Been Invited
                    </CardTitle>
                    <CardDescription className="text-base">
                      <span className="font-medium text-foreground">
                        {invitation.invitedByName}
                      </span>{" "}
                      has invited you to join their organization
                    </CardDescription>
                  </div>

                  {/* Organization Card */}
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background border">
                        <Building2 className="size-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <h3 className="type-h4">
                          {invitation.organization.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          @{invitation.organization.slug}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Role Info */}
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Shield className="size-4" />
                        <span>Your Role</span>
                      </div>
                      <Badge
                        variant={getRoleBadgeVariant(invitation.role)}
                        className="capitalize"
                      >
                        {invitation.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getRoleDescription(invitation.role)}
                    </p>
                  </div>

                  {/* Expiration Notice */}
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-4" />
                    <span>
                      This invitation expires{" "}
                      {formatExpirationDate(invitation.expiresAt)}
                    </span>
                  </div>

                  {/* Error Message */}
                  {acceptError && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                      {acceptError}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-3">
                    {isAuthenticated ? (
                      <Button
                        size="lg"
                        onClick={handleAccept}
                        disabled={isAccepting}
                        className="w-full"
                      >
                        {isAccepting ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Joining...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 size-4" />
                            Accept Invitation
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button size="lg" asChild className="w-full">
                        <Link to={`/login?redirect=/invitations/${token}`}>
                          Sign In to Accept
                          <ArrowRight className="ml-2 size-4" />
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" asChild>
                      <Link to="/">Maybe Later</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-center px-6">
          <p className="type-caption text-muted-foreground">
            &copy; {new Date().getFullYear()} Acme Corp. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
