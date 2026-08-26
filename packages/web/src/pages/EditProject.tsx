import { useParams, useNavigate } from "react-router-dom";
import { useUpdateProject } from "@/hooks/useApi";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { ProjectForm, type ProjectFormData } from "@/components/projects";
import { ProjectNotFound } from "@/components/project";
import { Skeleton } from "@/components/ui/skeleton";
import { AppRoutes } from "@/lib/routes";

export function EditProject() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, isLoading, isAccessDenied } = useProjectAccess(id || "");
  const updateProject = useUpdateProject();

  const handleSubmit = async (data: ProjectFormData) => {
    if (!id) return;

    await updateProject.mutateAsync({
      id,
      data: {
        name: data.name,
        description: data.description || null,
        repository_url: data.repository_url || null,
        git_remote_url: data.git_remote_url || null,
        is_active: data.is_active,
      },
    });

    navigate(AppRoutes.projects.detail(id));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-9" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (isAccessDenied || !project) {
    return <ProjectNotFound />;
  }

  return (
    <ProjectForm
      isEditing
      initialData={{
        name: project.name,
        description: project.description || "",
        repository_url: project.repositoryUrl ?? project.repository_url ?? "",
        git_remote_url: project.gitRemoteUrl ?? project.git_remote_url ?? "",
        is_active: project.isActive ?? true,
      }}
      onSubmit={handleSubmit}
    />
  );
}
