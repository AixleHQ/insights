import { useState } from "react";
import {
  Mail,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserPlus,
  Send,
  Copy,
  Check,
} from "lucide-react";
import { useOrg } from "@/contexts/OrgContext";
import {
  useInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  useResendInvitation,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Invitation, InvitationStatus, MemberRole } from "@/lib/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return "Expired";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return `${days} days`;
  return formatDate(dateString);
}

function getStatusIcon(status: InvitationStatus) {
  switch (status) {
    case "pending":
      return <Clock className="size-4" />;
    case "accepted":
      return <CheckCircle2 className="size-4" />;
    case "revoked":
      return <XCircle className="size-4" />;
    case "expired":
      return <AlertTriangle className="size-4" />;
    default:
      return null;
  }
}

function getStatusVariant(
  status: InvitationStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending":
      return "default";
    case "accepted":
      return "secondary";
    case "revoked":
      return "destructive";
    case "expired":
      return "outline";
    default:
      return "outline";
  }
}

function getRoleBadgeVariant(role: MemberRole): "default" | "secondary" | "outline" {
  switch (role) {
    case "owner":
      return "default";
    case "member":
      return "secondary";
    default:
      return "outline";
  }
}

function InvitationRow({
  invitation,
  onRevoke,
  onResend,
  isRevoking,
  isResending,
}: {
  invitation: Invitation;
  onRevoke: () => void;
  onResend: () => void;
  isRevoking: boolean;
  isResending: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isPending = invitation.status === "pending";
  const inviteUrl = `${window.location.origin}/invitations/${invitation.id}`;

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TableRow className="group">
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{invitation.email}</span>
          <span className="type-caption text-muted-foreground">
            Invited {formatDate(invitation.createdAt)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={getRoleBadgeVariant(invitation.role)} className="capitalize">
          {invitation.role}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={getStatusVariant(invitation.status)} className="gap-1 capitalize">
          {getStatusIcon(invitation.status)}
          {invitation.status}
        </Badge>
      </TableCell>
      <TableCell className="hidden sm:table-cell text-muted-foreground">
        {isPending ? (
          <span
            className={`${
              new Date(invitation.expiresAt) <= new Date()
                ? "text-destructive"
                : ""
            }`}
          >
            {formatRelativeDate(invitation.expiresAt)}
          </span>
        ) : invitation.status === "accepted" ? (
          <span>{formatDate(invitation.acceptedAt!)}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground">
        {invitation.invitedBy.name || invitation.invitedBy.email}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {isPending && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={handleCopyLink}
                    >
                      {copied ? (
                        <Check className="size-4 text-green-500" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copied ? "Copied!" : "Copy invite link"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={onResend}
                      disabled={isResending}
                    >
                      {isResending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Resend invitation email</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <AlertDialog>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={isRevoking}
                        >
                          {isRevoking ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Revoke invitation</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to revoke the invitation sent to{" "}
                      <span className="font-medium text-foreground">
                        {invitation.email}
                      </span>
                      ? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onRevoke}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Revoke Invitation
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (email: string, role: MemberRole) => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    onSubmit(email.trim(), role);
  };

  // Reset form when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setEmail("");
      setRole("member");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation email to add someone to your organization.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">
                  <div className="flex flex-col items-start">
                    <span>Member</span>
                    <span className="type-caption text-muted-foreground">
                      View dashboards and contribute to projects
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="viewer">
                  <div className="flex flex-col items-start">
                    <span>Viewer</span>
                    <span className="type-caption text-muted-foreground">
                      Read-only access to organization data
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !email.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 size-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InvitationsManagement() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id || "";

  // Fetch all invitations
  const { data: invitations, isLoading } = useInvitations(orgId);

  // Mutations
  const createInvitation = useCreateInvitation();
  const revokeInvitation = useRevokeInvitation();
  const resendInvitation = useResendInvitation();

  // Dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Track which invitations are being processed
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());
  const [resendingIds, setResendingIds] = useState<Set<string>>(new Set());

  // Current tab filter
  const [statusFilter, setStatusFilter] = useState<"all" | InvitationStatus>("all");

  const handleCreateInvitation = async (email: string, role: MemberRole) => {
    setInviteError(null);
    try {
      await createInvitation.mutateAsync({ orgId, email, role });
      setInviteDialogOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send invitation";
      setInviteError(message);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    setRevokingIds((prev) => new Set(prev).add(invitationId));
    try {
      await revokeInvitation.mutateAsync({ orgId, invitationId });
    } catch (err) {
      console.error("Failed to revoke invitation:", err);
    } finally {
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitationId);
        return next;
      });
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    setResendingIds((prev) => new Set(prev).add(invitationId));
    try {
      await resendInvitation.mutateAsync({ orgId, invitationId });
    } catch (err) {
      console.error("Failed to resend invitation:", err);
    } finally {
      setResendingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitationId);
        return next;
      });
    }
  };

  // Filter invitations by status
  const filteredInvitations = invitations?.filter(
    (inv) => statusFilter === "all" || inv.status === statusFilter
  );

  // Count by status
  const counts = {
    all: invitations?.length || 0,
    pending: invitations?.filter((i) => i.status === "pending").length || 0,
    accepted: invitations?.filter((i) => i.status === "accepted").length || 0,
    revoked: invitations?.filter((i) => i.status === "revoked").length || 0,
    expired: invitations?.filter((i) => i.status === "expired").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="type-h2">Team Invitations</h1>
          <p className="text-muted-foreground">
            Invite team members and manage pending invitations.
          </p>
        </div>
        <InviteDialog
          open={inviteDialogOpen}
          onOpenChange={setInviteDialogOpen}
          onSubmit={handleCreateInvitation}
          isSubmitting={createInvitation.isPending}
          error={inviteError}
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <UserPlus className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Invitations</CardTitle>
              <CardDescription>
                {counts.pending > 0
                  ? `${counts.pending} pending invitation${counts.pending === 1 ? "" : "s"}`
                  : "No pending invitations"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <TabsList className="mb-4 w-full flex-wrap sm:w-auto sm:flex-nowrap">
              <TabsTrigger value="all" className="gap-1.5">
                All
                <Badge variant="secondary" className="ml-1 size-5 rounded-full p-0 text-xs">
                  {counts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-1.5">
                Pending
                {counts.pending > 0 && (
                  <Badge variant="default" className="ml-1 size-5 rounded-full p-0 text-xs">
                    {counts.pending}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="accepted">Accepted</TabsTrigger>
              <TabsTrigger value="revoked">Revoked</TabsTrigger>
              <TabsTrigger value="expired">Expired</TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredInvitations && filteredInvitations.length > 0 ? (
                <div className="rounded-lg border overflow-x-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          {statusFilter === "accepted" ? "Accepted" : "Expires"}
                        </TableHead>
                        <TableHead className="hidden md:table-cell">Invited By</TableHead>
                        <TableHead className="w-[100px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvitations.map((invitation) => (
                        <InvitationRow
                          key={invitation.id}
                          invitation={invitation}
                          onRevoke={() => handleRevokeInvitation(invitation.id)}
                          onResend={() => handleResendInvitation(invitation.id)}
                          isRevoking={revokingIds.has(invitation.id)}
                          isResending={resendingIds.has(invitation.id)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                  <Mail className="mb-3 size-10 text-muted-foreground/50" />
                  <h3 className="font-medium">No invitations</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {statusFilter === "all"
                      ? "You haven't sent any invitations yet."
                      : `No ${statusFilter} invitations.`}
                  </p>
                  {statusFilter === "all" && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setInviteDialogOpen(true)}
                    >
                      <Plus className="mr-2 size-4" />
                      Send First Invitation
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
