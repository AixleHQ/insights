import { useOrg } from "@/contexts/OrgContext";
import { useCreateInvitation } from "@/hooks/useApi";
import { InviteForm, type MemberRole } from "@/components/team";

export function TeamInvite() {
  const { currentOrg } = useOrg();
  const createInvitation = useCreateInvitation();

  const handleSubmit = async (
    invites: Array<{ email: string; role: MemberRole }>
  ) => {
    if (!currentOrg) return;

    // Send each invite to the API
    for (const invite of invites) {
      await createInvitation.mutateAsync({
        orgId: currentOrg.id,
        email: invite.email,
        role: invite.role,
      });
    }
  };

  return <InviteForm onSubmit={handleSubmit} />;
}
