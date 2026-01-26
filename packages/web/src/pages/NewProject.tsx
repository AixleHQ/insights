import { useOrg } from '@/contexts/OrgContext';
import { ProjectForm, type ProjectFormData } from '@/components/projects';

export function NewProject() {
  const { currentOrg: _currentOrg } = useOrg();

  const handleSubmit = async (data: ProjectFormData) => {
    // In production, this would be a real API call
    // await api.post(`/organizations/${currentOrg?.id}/projects`, data);
    console.log('Creating project:', data);
    await new Promise((resolve) => setTimeout(resolve, 500));
  };

  return <ProjectForm onSubmit={handleSubmit} />;
}
