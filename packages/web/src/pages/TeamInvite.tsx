import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useInviteMember } from '@/hooks/useApi';
import { InviteForm, type MemberRole } from '@/components/team';

export function TeamInvite() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const inviteMember = useInviteMember();

  const handleSubmit = async (
    invites: Array<{ email: string; role: MemberRole }>
  ) => {
    if (!currentOrg) return;

    // Send each invite to the API
    for (const invite of invites) {
      await inviteMember.mutateAsync({
        orgId: currentOrg.id,
        email: invite.email,
        role: invite.role,
      });
    }

    // Navigate back to team page on success
    navigate('/team');
  };

  return <InviteForm onSubmit={handleSubmit} />;
}
