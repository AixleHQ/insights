import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import {
  useCheckPendingInvitations,
  useAcceptInvitation,
  useCreateOrganization,
} from "@/hooks/useApi";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { InvitationPublic } from "@/lib/types";
import { AppRoutes } from "@/lib/routes";

export function Onboarding() {
  const navigate = useNavigate();
  const { organizations, isInitialized, refreshOrganizations, setCurrentOrg } = useOrg();

  const { data: pendingInvitations, isLoading: isLoadingInvitations, refetch: refetchInvitations } =
    useCheckPendingInvitations();

  const acceptInvitation = useAcceptInvitation();
  const createOrganization = useCreateOrganization();

  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    if (isInitialized && organizations.length > 0) {
      navigate(AppRoutes.dashboard, { replace: true });
    }
  }, [isInitialized, organizations, navigate]);

  // Loading state — shown during org creation / invitation acceptance
  if (isSettingUp) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center gap-5">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="type-body text-center whitespace-nowrap text-muted-foreground">
            Setting up your workspace...
          </p>
        </div>
      </AuthLayout>
    );
  }

  // Initial load
  if (!isInitialized || isLoadingInvitations) {
    return (
      <AuthLayout>
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </AuthLayout>
    );
  }

  const activeInvitations = pendingInvitations?.filter((inv) => !inv.expired) ?? [];

  const handleAcceptInvitation = async (invitation: InvitationPublic) => {
    setAcceptingId(invitation.id);
    setIsSettingUp(true);
    try {
      const result = await acceptInvitation.mutateAsync(invitation.token);
      await refreshOrganizations();
      if (result.data?.organization) {
        navigate(AppRoutes.dashboard);
      }
    } catch {
      setIsSettingUp(false);
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
    setIsSettingUp(true);
    try {
      const result = await createOrganization.mutateAsync({
        name: orgName.trim(),
        description: orgDescription.trim() || undefined,
      });
      await refreshOrganizations();
      if (result) {
        setCurrentOrg({ id: result.id, name: result.name, slug: result.slug, is_active: true });
      }
      navigate(AppRoutes.dashboard);
    } catch (err) {
      setIsSettingUp(false);
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex w-full max-w-[448px] flex-col gap-12 px-4">
        {/* Title */}
        <p className="type-h2 font-medium text-center tracking-tight text-muted-foreground">
          Set up your organization
        </p>

        {/* Org creation form */}
        <form onSubmit={handleCreateOrganization} className="flex flex-col gap-6">
          {createError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="type-caption text-destructive">{createError}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="org-name" className="text-muted-foreground">Organization Name</Label>
            <Input
              id="org-name"
              type="text"
              placeholder="Acme Corp"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="org-description" className="text-muted-foreground">
              Description <span className="text-muted-foreground/60">(optional)</span>
            </Label>
            <Textarea
              id="org-description"
              placeholder="Our engineering team"
              value={orgDescription}
              onChange={(e) => setOrgDescription(e.target.value)}
              className="h-24 border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring resize-none"
            />
          </div>

          <Button type="submit" size="default" className="w-full" disabled={isCreating || !orgName.trim()}>
            {isCreating ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Creating...</>
            ) : (
              "Create Organization"
            )}
          </Button>
        </form>

        {/* Pending invitations */}
        {activeInvitations.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="type-caption text-center text-muted-foreground">
              Or accept a pending invitation
            </p>
            <div className="flex flex-col gap-2">
              {activeInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="type-body font-medium truncate text-foreground">
                      {invitation.organization.name}
                    </p>
                    <p className="type-caption text-muted-foreground">
                      Invited by {invitation.invitedByName}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 border-border"
                    onClick={() => handleAcceptInvitation(invitation)}
                    disabled={acceptingId === invitation.id}
                  >
                    {acceptingId === invitation.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Accept"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
