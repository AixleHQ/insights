import { Link } from "react-router-dom";
import { Mail, ChevronDown } from "lucide-react";
import { useCheckPendingInvitations } from "@/hooks/useApi";
import { AppRoutes } from "@/lib/routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PendingInvitationsBanner() {
  const { data: pendingInvitations } = useCheckPendingInvitations();

  if (!pendingInvitations?.length) return null;

  if (pendingInvitations.length === 1) {
    const invitation = pendingInvitations[0];
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-2 bg-primary/10 px-4 py-2 text-sm text-primary"
      >
        <Mail className="size-4" aria-hidden="true" />
        <span className="font-medium">
          You have a pending invitation to {invitation.organization.name}.
        </span>
        <Link to={AppRoutes.invitation(invitation.token)} className="underline underline-offset-4">
          View invitation
        </Link>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-primary/10 px-4 py-2 text-sm text-primary"
    >
      <Mail className="size-4" aria-hidden="true" />
      <span className="font-medium">
        You have {pendingInvitations.length} pending invitations.
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 underline underline-offset-4">
          View invitations
          <ChevronDown className="size-3" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuLabel>Pending invitations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {pendingInvitations.map((invitation) => (
            <DropdownMenuItem key={invitation.id} asChild>
              <Link to={AppRoutes.invitation(invitation.token)}>{invitation.organization.name}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
