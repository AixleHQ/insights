import { useState } from "react";
import { Routes, Route, Link, useLocation, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertCircle,
  Building2,
  FileSearch,
  Shield,
  Bell,
  Loader2,
  Save,
  Trash2,
  Users,
  Plug,
} from "lucide-react";
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useCurrentUser,
  useProjectMembers,
  type ProjectMember,
} from "@/hooks/useApi";
import { useOrg } from "@/contexts/OrgContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ProjectSecurityTab,
  ProjectSettingsSection,
  ProjectNotFound,
  ProjectRetentionPolicySection,
  ProjectAlertsSection,
  ProjectMembersTab,
  ProjectConnectorsTab,
} from "@/components/project";
import { cn } from "@/lib/utils";
import { isGitRemoteMissing } from "@/lib/project-git-remote";
import { AppRoutes } from "@/lib/routes";

const getNavItems = (id: string, isMemberOfProject: boolean, isProjectOwner: boolean) => [
  { title: "General",          href: AppRoutes.projects.settings(id),                     icon: Building2  },
  ...(isMemberOfProject ? [{ title: "Members",      href: AppRoutes.projects.settingsTab(id, "members"),      icon: Users      }] : []),
  ...(isProjectOwner    ? [{ title: "Integrations", href: AppRoutes.projects.settingsTab(id, "integrations"), icon: Plug       }] : []),
  { title: "Security & Audit", href: AppRoutes.projects.settingsTab(id, "security"),     icon: FileSearch },
  { title: "Policies",         href: AppRoutes.projects.settingsTab(id, "policies"),     icon: Shield     },
  { title: "Alerts",           href: AppRoutes.projects.settingsTab(id, "alerts"),       icon: Bell       },
];

function ProjectSettingsNav({
  projectId,
  isMemberOfProject,
  isProjectOwner,
}: {
  projectId: string;
  isMemberOfProject: boolean;
  isProjectOwner: boolean;
}) {
  const location = useLocation();
  const navItems = getNavItems(projectId, isMemberOfProject, isProjectOwner);

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = item.href === AppRoutes.projects.settings(projectId)
          ? location.pathname === item.href
          : location.pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

interface GeneralFormData {
  name: string;
  description: string;
  repository_url: string;
  git_remote_url: string;
  is_active: boolean;
}

function ProjectGeneralSettingsForm({
  projectId,
  defaultValues,
  serverGitRemoteMissing,
}: {
  projectId: string;
  defaultValues: GeneralFormData;
  serverGitRemoteMissing: boolean;
}) {
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();

  const [formData, setFormData] = useState(defaultValues);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleChange = (field: keyof GeneralFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaveError(null);
    try {
      await updateProject.mutateAsync({ id: projectId, data: formData });
      setHasChanges(false);
    } catch {
      setSaveError("Failed to save changes. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      setDeleteError(null);
      try {
        await deleteProject.mutateAsync(projectId);
        navigate(AppRoutes.projects.root);
      } catch {
        setDeleteError("Failed to delete project. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-h4">General</h2>
        <p className="text-sm text-muted-foreground">
          Manage your project's basic information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="type-body-lg">Project Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {serverGitRemoteMissing && (
            <Alert
              className="border-warning/30 bg-warning/10 text-warning-foreground dark:border-warning/25 dark:bg-warning/10 dark:text-warning-foreground [&>svg]:text-warning dark:[&>svg]:text-warning"
            >
              <AlertCircle className="size-4 shrink-0" />
              <AlertDescription className="text-warning-foreground dark:text-warning/80">
                <p className="font-medium text-warning-foreground dark:text-warning/70">
                  CLI events cannot be auto-attributed yet
                </p>
                <p className="mt-1 text-sm text-warning-foreground/90 dark:text-warning/80">
                  Add the Git remote URL below (paste the output of{" "}
                  <code className="rounded bg-warning/15 px-1 py-0.5 font-mono text-xs">git remote get-url origin</code>
                  ) so the Aixle Insights CLI can match events to this project.
                </p>
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="proj-name">Name</Label>
            <Input
              id="proj-name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-description">Description</Label>
            <Input
              id="proj-description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="A brief description of this project"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-repo">Repository URL</Label>
            <Input
              id="proj-repo"
              value={formData.repository_url}
              onChange={(e) => handleChange("repository_url", e.target.value)}
              placeholder="https://github.com/org/repo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-git-remote">Git remote URL (for auto CLI attribution)</Label>
            <Input
              id="proj-git-remote"
              value={formData.git_remote_url}
              onChange={(e) => handleChange("git_remote_url", e.target.value)}
              placeholder="git@github.com:org/repo.git"
            />
            <p className="type-caption text-muted-foreground">
              Paste the output of <code className="font-mono">git remote get-url origin</code> from the repository where
              developers run the CLI. When the CLI runs inside that repo, events are auto-attributed to this project.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="proj-active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleChange("is_active", checked)}
            />
            <Label htmlFor="proj-active">Active</Label>
          </div>
        </CardContent>
      </Card>

      {saveError && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProject.isPending || !hasChanges}>
          {updateProject.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Save className="mr-2 size-4" />
          Save Changes
        </Button>
      </div>

      <ProjectSettingsSection projectId={projectId} />

      <Separator />

      <div>
        <h2 className="type-h4 text-destructive">Danger Zone</h2>
        <p className="text-sm text-muted-foreground">
          Irreversible and destructive actions
        </p>
      </div>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="type-body-lg">Delete Project</CardTitle>
          <CardDescription>
            Once you delete a project, there is no going back. All data associated with this
            project will be permanently deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <Button variant="destructive" onClick={handleDelete} disabled={deleteProject.isPending}>
            {deleteProject.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            <Trash2 className="mr-2 size-4" />
            Delete Project
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectGeneralSettings({
  projectId,
  project,
  isLoading,
}: {
  projectId: string;
  project: ReturnType<typeof useProject>["data"];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (!project) {
    return <ProjectNotFound />;
  }

  const defaultValues: GeneralFormData = {
    name: project.name || "",
    description: project.description || "",
    repository_url: project.repositoryUrl ?? project.repository_url ?? "",
    git_remote_url: project.gitRemoteUrl ?? project.git_remote_url ?? "",
    is_active: project.isActive ?? project.is_active,
  };

  const serverGitRemoteMissing = isGitRemoteMissing(project);

  return (
    <ProjectGeneralSettingsForm
      key={project.id}
      projectId={projectId}
      defaultValues={defaultValues}
      serverGitRemoteMissing={serverGitRemoteMissing}
    />
  );
}

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading: isLoadingProject } = useProject(id || "");
  const { hasRole } = useOrg();
  const { data: me } = useCurrentUser();
  const { data: projectMembers = [] } = useProjectMembers(id ?? "");

  const myMembership = projectMembers.find((m: ProjectMember) => m.userId === me?.id);
  const isProjectOwner = hasRole(["owner"]) || myMembership?.role === "owner";
  const canManageMembers = hasRole(["owner"]);
  const isMemberOfProject = isProjectOwner || !!myMembership;

  if (!id) return null;

  const orgId = project?.organization_id ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link to={AppRoutes.projects.detail(id)}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          {isLoadingProject ? (
            <Skeleton className="h-7 w-48" />
          ) : (
            <h1 className="type-h2">
              {project ? `${project.name} — Settings` : "Settings"}
            </h1>
          )}
          <p className="text-sm text-muted-foreground">
            Manage settings and preferences for this project
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full md:w-48 shrink-0">
          <ProjectSettingsNav
            projectId={id}
            isMemberOfProject={isMemberOfProject}
            isProjectOwner={isProjectOwner}
          />
        </aside>
        <div className="flex-1 min-w-0">
          <Routes>
            <Route index element={<ProjectGeneralSettings projectId={id} project={project} isLoading={isLoadingProject} />} />
            <Route
              path="members"
              element={
                isMemberOfProject ? (
                  <div className="space-y-6">
                    <div>
                      <h2 className="type-h4">Members</h2>
                      <p className="text-sm text-muted-foreground">Manage project member access and roles</p>
                    </div>
                    <ProjectMembersTab
                      projectId={id}
                      orgId={orgId}
                      isProjectOwner={isProjectOwner}
                      canManageMembers={canManageMembers}
                    />
                  </div>
                ) : (
                  <Navigate to={AppRoutes.projects.settings(id)} replace />
                )
              }
            />
            <Route
              path="integrations"
              element={
                isProjectOwner ? (
                  <div className="space-y-6">
                    <div>
                      <h2 className="type-h4">Integrations</h2>
                      <p className="text-sm text-muted-foreground">Connect AI providers and notification services to this project</p>
                    </div>
                    <ProjectConnectorsTab projectId={id} orgId={orgId} />
                  </div>
                ) : (
                  <Navigate to={AppRoutes.projects.settings(id)} replace />
                )
              }
            />
            <Route path="security" element={<ProjectSecurityTab projectId={id} />} />
            <Route path="policies" element={<ProjectRetentionPolicySection projectId={id} />} />
            <Route
              path="alerts"
              element={
                <ProjectAlertsSection
                  projectId={id}
                  orgId={orgId}
                />
              }
            />
            <Route path="*" element={<Navigate to={AppRoutes.projects.settings(id)} replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
