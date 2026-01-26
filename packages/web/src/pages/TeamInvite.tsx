import { useOrg } from '@/contexts/OrgContext';
import { InviteForm, type MemberRole } from '@/components/team';

export function TeamInvite() {
  const { currentOrg: _currentOrg } = useOrg();

  const handleSubmit = async (
    invites: Array<{ email: string; role: MemberRole }>
  ) => {
    // In production, this would be a real API call
    // await api.post(`/organizations/${currentOrg?.id}/members/invite`, { invites });
    console.log('Sending invites:', invites);
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  return <InviteForm onSubmit={handleSubmit} />;
}
