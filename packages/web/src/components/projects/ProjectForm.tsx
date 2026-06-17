import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";

export interface ProjectFormData {
  name: string;
  description?: string;
  repository_url?: string;
  git_remote_url?: string;
  is_active: boolean;
}

interface ProjectFormProps {
  initialData?: ProjectFormData;
  isEditing?: boolean;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  className?: string;
}

export function ProjectForm({
  initialData,
  isEditing = false,
  onSubmit,
  className,
}: ProjectFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ProjectFormData>(
    initialData || {
      name: "",
      description: "",
      repository_url: "",
      git_remote_url: "",
      is_active: true,
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Project name is required";
    } else if (formData.name.length < 2) {
      newErrors.name = "Project name must be at least 2 characters";
    }

    if (formData.repository_url && !isValidUrl(formData.repository_url)) {
      newErrors.repository_url = "Please enter a valid URL";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);
    setGeneralError(null);
    try {
      await onSubmit(formData);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const data = error.data as { errors?: Record<string, string[]> } | null;
        if (data?.errors) {
          const fieldErrors: Record<string, string> = {};
          for (const [field, messages] of Object.entries(data.errors)) {
            fieldErrors[field] = messages[0];
          }
          setErrors(fieldErrors);
        } else {
          setGeneralError("The server rejected the request. Please check your inputs.");
        }
      } else {
        setGeneralError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = <K extends keyof ProjectFormData>(
    field: K,
    value: ProjectFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")} aria-label="Back to projects">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="type-h3">
            {isEditing ? "Edit Project" : "New Project"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEditing
              ? "Update your project settings"
              : "Create a new project to track AI tool usage"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="type-body-lg">Project Details</CardTitle>
            <CardDescription>
              Basic information about your project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Project Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="my-project"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={cn(errors.name && "border-destructive")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="A brief description of the project"
                value={formData.description || ""}
                onChange={(e) => updateField("description", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="repository_url">Repository URL</Label>
              <Input
                id="repository_url"
                placeholder="https://github.com/org/repo"
                value={formData.repository_url || ""}
                onChange={(e) => updateField("repository_url", e.target.value)}
                className={cn(errors.repository_url && "border-destructive")}
              />
              {errors.repository_url && (
                <p className="text-xs text-destructive">{errors.repository_url}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="git_remote_url">Git remote URL (for auto CLI attribution)</Label>
              <Input
                id="git_remote_url"
                placeholder="git@github.com:org/repo.git"
                value={formData.git_remote_url || ""}
                onChange={(e) => updateField("git_remote_url", e.target.value)}
              />
              <p className="type-caption text-muted-foreground">
                Paste the output of <code className="font-mono">git remote get-url origin</code> from the repository where
                developers run the CLI. When the CLI runs inside that repo, events are auto-attributed to this project.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active
                </Label>
                <p className="type-caption text-muted-foreground">
                  Enable event tracking for this project
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => updateField("is_active", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {generalError && (
          <p className="mt-4 text-sm text-destructive" role="alert">{generalError}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/projects")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Create Project"}
          </Button>
        </div>
      </form>
    </div>
  );
}
