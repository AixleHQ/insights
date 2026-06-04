import { useOrg } from "@/contexts/OrgContext";
import { useCreateInvitation } from "@/hooks/useApi";
import { InviteForm } from "@/components/team";
import type { MemberRole } from "@/contexts/OrgContext";

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const apiError = error as {
      data?: {
        errors?: Record<string, string[]>;
        message?: string;
        error?: string;
      };
    };
    if (apiError.data?.errors) {
      const messages = Object.entries(apiError.data.errors)
        .map(([field, msgs]) => `${field} ${(msgs as string[]).join(", ")}`)
        .join(". ");
      if (messages) return messages;
    }
    if (apiError.data?.message) return apiError.data.message;
    if (apiError.data?.error) return apiError.data.error;
  }
  return "Failed to send invite. Please try again.";
}

export function TeamInvite() {
  const { currentOrg } = useOrg();
  const createInvitation = useCreateInvitation();

  const handleSubmit = async (
    invites: Array<{ email: string; role: MemberRole }>
  ): Promise<Record<string, string | null>> => {
    if (!currentOrg) {
      return Object.fromEntries(invites.map((inv) => [inv.email, "Organization not found"]));
    }

    const settled = await Promise.allSettled(
      invites.map((invite) =>
        createInvitation
          .mutateAsync({
            orgId: currentOrg.id,
            email: invite.email,
            role: invite.role,
          })
          .then(() => ({ email: invite.email, error: null as string | null }))
          .catch((err: unknown) => ({ email: invite.email, error: extractErrorMessage(err) }))
      )
    );

    return Object.fromEntries(
      settled.map((result) => {
        if (result.status === "fulfilled") {
          return [result.value.email, result.value.error];
        }
        // This branch is unreachable: the .catch above ensures all promises fulfill.
        // Included as a type-safe fallback.
        return [result.reason?.email ?? "__unknown__", extractErrorMessage(result.reason)];
      })
    );
  };

  return <InviteForm onSubmit={handleSubmit} />;
}
