import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { useCreateProject } from '@/hooks/useApi';
import { ProjectForm, type ProjectFormData } from '@/components/projects';

export function NewProject() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const createProject = useCreateProject();

  const handleSubmit = async (data: ProjectFormData) => {
    if (!currentOrg) return;

    const project = await createProject.mutateAsync({
      orgId: currentOrg.id,
      data: {
        name: data.name,
        description: data.description || null,
        repository_url: data.repository_url || null,
        is_active: data.is_active ?? true,
      },
    });

    // Navigate to the new project
    navigate(`/projects/${project.id}`);
  };

  return <ProjectForm onSubmit={handleSubmit} />;
}
