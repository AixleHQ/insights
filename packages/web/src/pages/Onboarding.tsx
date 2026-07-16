import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Mail,
  Loader2,
  Plus,
  Sparkles,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import {
  useCheckPendingInvitations,
  useAcceptInvitation,
  useCreateOrganization,
} from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { InvitationPublic } from "@/lib/types";
import { AppRoutes } from "@/lib/routes";

function InvitationCard({
  invitation,
  onAccept,
  isAccepting,
}: {
  invitation: InvitationPublic;
  onAccept: () => void;
  isAccepting: boolean;
}) {
  const isExpired = invitation.expired;

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
        isExpired
          ? "border-border/50 bg-muted/30 opacity-60"
          : "border-border bg-card hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
      }`}
    >
      {/* Subtle gradient overlay on hover */}
      {!isExpired && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}

      <div className="relative flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate max-w-[200px]" title={invitation.organization.name}>
              {invitation.organization.name.length > 50
                ? `${invitation.organization.name.slice(0, 50)}…`
                : invitation.organization.name}
            </h4>
            <Badge
              variant={isExpired ? "secondary" : "outline"}
              className="text-xs capitalize"
            >
              {invitation.role}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Invited by {invitation.invitedByName}
          </p>
          <div className="flex items-center gap-1 type-caption text-muted-foreground">
            <Clock className="size-3" />
            <span>
              {isExpired ? "Expired" : `Expires ${formatDate(invitation.expiresAt)}`}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          onClick={onAccept}
          disabled={isExpired || isAccepting}
          className="shrink-0"
        >
          {isAccepting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isExpired ? (
            "Expired"
          ) : (
            <>
              Accept
              <ArrowRight className="ml-1 size-3" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return date.toLocaleDateString();
}

export function Onboarding() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { organizations, isInitialized, refreshOrganizations, setCurrentOrg } = useOrg();

  // Fetch pending invitations
  const {
    data: pendingInvitations,
    isLoading: isLoadingInvitations,
    refetch: refetchInvitations,
  } = useCheckPendingInvitations();

  // Mutations
  const acceptInvitation = useAcceptInvitation();
  const createOrganization = useCreateOrganization();

  // Create org dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Accept invitation state
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Redirect to dashboard if user already has organizations
  useEffect(() => {
    if (isInitialized && organizations.length > 0) {
      navigate(AppRoutes.dashboard, { replace: true });
    }
  }, [isInitialized, organizations, navigate]);

  // Show loading while checking if user has organizations
  if (!isInitialized) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleAcceptInvitation = async (invitation: InvitationPublic) => {
    setAcceptingId(invitation.id);
    try {
      // The accept endpoint is keyed by the invitation token, not its id.
      const result = await acceptInvitation.mutateAsync(invitation.token);

      // Refresh organizations and set the new one as current
      await refreshOrganizations();

      // Navigate to dashboard
      if (result.data?.organization) {
        navigate(AppRoutes.dashboard);
      }
    } catch (err) {
      console.error("Failed to accept invitation:", err);
    } finally {
      setAcceptingId(null);
      refetchInvitations();
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createOrganization.mutateAsync({
        name: orgName.trim(),
        description: orgDescription.trim() || undefined,
      });

      // Refresh organizations and set the new one as current
      await refreshOrganizations();

      // Set the new org as current if we have it
      if (result) {
        setCurrentOrg({
          id: result.id,
          name: result.name,
          slug: result.slug,
          is_active: true,
        });
      }

      setCreateDialogOpen(false);
      navigate(AppRoutes.dashboard);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setIsCreating(false);
    }
  };

  const activeInvitations = pendingInvitations?.filter((inv) => !inv.expired) || [];
  const hasInvitations = activeInvitations.length > 0;

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
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
              <span className="font-mono text-sm font-bold text-primary-foreground">
                AI
              </span>
            </div>
            <span className="type-h4">Aixle Insights</span>
          </div>
          {profile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{profile.email}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl space-y-8">
          {/* Welcome section */}
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Sparkles className="size-8 text-primary" />
            </div>
            <h1 className="type-h1">
              Welcome to Aixle Insights
            </h1>
            <p className="mx-auto max-w-md text-muted-foreground">
              You're not part of any organization yet. Create your own organization or
              accept an invitation to get started.
            </p>
          </div>

          {/* Action cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Create Organization Card */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Card className="group cursor-pointer border-2 border-dashed transition-all duration-300 hover:border-primary/50 hover:bg-primary/[0.02] hover:shadow-lg hover:shadow-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-transform duration-300 group-hover:scale-110">
                      <Building2 className="size-6 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <CardTitle className="flex items-center gap-2">
                      Create Organization
                      <Plus className="size-4 text-muted-foreground" />
                    </CardTitle>
                    <CardDescription>
                      Start fresh with your own organization and invite team
                      members to join you.
                    </CardDescription>
                  </CardContent>
                </Card>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Organization</DialogTitle>
                  <DialogDescription>
                    Set up your new organization to start tracking AI tool usage.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateOrganization} className="space-y-4">
                  {createError && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                      {createError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name</Label>
                    <Input
                      id="org-name"
                      placeholder="Acme Inc"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-description">
                      Description{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="org-description"
                      placeholder="A brief description of your organization"
                      value={orgDescription}
                      onChange={(e) => setOrgDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isCreating || !orgName.trim()}>
                      {isCreating ? (
                        <>
                          <Loader2 className="mr-2 size-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 size-4" />
                          Create Organization
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            {/* Accept Invitation Card */}
            <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
              {/* Badge for invitation count */}
              {hasInvitations && (
                <div className="absolute right-4 top-4">
                  <Badge className="bg-primary text-primary-foreground">
                    {activeInvitations.length} pending
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-3">
                <div className="flex size-12 items-center justify-center rounded-xl bg-accent">
                  <Mail className="size-6 text-accent-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <CardTitle>Pending Invitations</CardTitle>
                  <CardDescription>
                    {hasInvitations
                      ? `You have ${activeInvitations.length} invitation${activeInvitations.length > 1 ? "s" : ""} waiting for you.`
                      : "No pending invitations for your email address."}
                  </CardDescription>
                </div>

                {isLoadingInvitations ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : hasInvitations ? (
                  <div className="space-y-3">
                    <Separator />
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {activeInvitations.map((invitation) => (
                        <InvitationCard
                          key={invitation.id}
                          invitation={invitation}
                          onAccept={() => handleAcceptInvitation(invitation)}
                          isAccepting={acceptingId === invitation.id}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center">
                    <Mail className="mb-2 size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Ask your team admin to send you an invitation
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-center px-6">
          <p className="type-caption text-muted-foreground">
            &copy; {new Date().getFullYear()} Aixle Insights. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
