import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { useInvitationByToken, useAcceptInvitation } from '@/hooks/useApi';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function formatExpirationDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return `in ${days} days`;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getRoleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'default';
    case 'member':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getRoleDescription(role: string): string {
  switch (role) {
    case 'owner':
      return 'Full control over organization settings, billing, and member management';
    case 'admin':
      return 'Manage projects, members, and organization settings';
    case 'member':
      return 'View dashboards and contribute to projects';
    case 'viewer':
      return 'Read-only access to organization data';
    default:
      return 'Access to organization resources';
  }
}

export function InvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { refreshOrganizations, setCurrentOrg } = useOrg();

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptSuccess, setAcceptSuccess] = useState(false);

  // Fetch invitation details
  const {
    data: invitation,
    isLoading,
    error,
  } = useInvitationByToken(token || '');

  const acceptInvitation = useAcceptInvitation();

  const handleAccept = async () => {
    if (!token) return;

    setIsAccepting(true);
    setAcceptError(null);

    try {
      const result = await acceptInvitation.mutateAsync(token);

      // Refresh organizations and set the new one as current
      await refreshOrganizations();

      setAcceptSuccess(true);

      // Brief pause to show success state, then redirect
      setTimeout(() => {
        if (result.data?.organization) {
          setCurrentOrg({
            id: result.data.organization.id,
            name: result.data.organization.name,
            slug: result.data.organization.slug,
            logo_url: null,
            created_at: '',
            updated_at: '',
          });
        }
        navigate('/profile');
      }, 1500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to accept invitation';
      setAcceptError(message);
    } finally {
      setIsAccepting(false);
    }
  };

  // Determine the current state for rendering
  const isNotFound = error?.message?.includes('404') || error?.message?.includes('Not Found');
  const isExpired = invitation?.expired || invitation?.status === 'expired';
  const isRevoked = invitation?.status === 'revoked';
  const isAlreadyAccepted = invitation?.status === 'accepted';

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
            <span className="text-lg font-semibold tracking-tight">DB90</span>
          </Link>
          {user && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{user.email}</span>
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
            <Card className="border-2 border-amber-500/20">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10">
                  <Clock className="size-8 text-amber-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Invitation Expired</CardTitle>
                  <CardDescription className="text-base">
                    This invitation to join{' '}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>{' '}
                    has expired. Please ask{' '}
                    <span className="font-medium text-foreground">
                      {invitation?.invitedByName}
                    </span>{' '}
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
                    This invitation to join{' '}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>{' '}
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
          {!isLoading && !isNotFound && isAlreadyAccepted && (
            <Card className="border-2 border-green-500/20">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-green-500/10">
                  <CheckCircle2 className="size-8 text-green-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Already a Member</CardTitle>
                  <CardDescription className="text-base">
                    This invitation has already been accepted. You're a member of{' '}
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
            <Card className="border-2 border-green-500/30">
              <CardHeader className="items-center pb-2">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-green-500/10">
                  <CheckCircle2 className="size-8 text-green-500 animate-in zoom-in-50 duration-300" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-center">
                <div className="space-y-2">
                  <CardTitle className="text-xl">Welcome Aboard!</CardTitle>
                  <CardDescription className="text-base">
                    You've successfully joined{' '}
                    <span className="font-medium text-foreground">
                      {invitation?.organization.name}
                    </span>
                    . Redirecting you to your profile...
                  </CardDescription>
                </div>
                <div className="flex justify-center">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
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
                      </span>{' '}
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
                        <h3 className="font-semibold text-lg">
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
                      This invitation expires{' '}
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
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Acme Corp. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
