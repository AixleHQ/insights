import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Grid, List, Search } from "lucide-react";
import { toast } from "sonner";
import { useOrg } from "@/contexts/OrgContext";
import { useProjects, useDeleteProject } from "@/hooks/useApi";
import { useFavorites } from "@/hooks/useFavorites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCardSkeleton } from "@/components/ui/skeletons";
import { ProjectCard } from "@/components/projects";
import { cn } from "@/lib/utils";
import { AppRoutes } from "@/lib/routes";
import { getApiErrorMessage } from "@/lib/api";

type ViewMode = "grid" | "list";

export function Projects() {
  const { currentOrg, currentRole } = useOrg();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const { toggleFavorite, favorites } = useFavorites();
  const favoritedIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);
  const isFavorite = (id: string) => favoritedIds.has(id);

  const { data: projects, isLoading } = useProjects(currentOrg?.id || "");
  const deleteProject = useDeleteProject();

  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    return projects.filter((project) =>
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      project.description?.toLowerCase().includes(search.toLowerCase())
    );
  }, [projects, search]);

  const handleEdit = (id: string) => {
    navigate(AppRoutes.projects.edit(id));
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this project?")) {
      try {
        await deleteProject.mutateAsync(id);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to delete project. Please try again."));
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="type-h2">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage your projects and track AI tool usage
          </p>
        </div>
        {currentRole === "owner" && (
          <Button asChild className="w-full sm:w-auto">
            <Link to={AppRoutes.projects.new}>
              <Plus className="mr-2 size-4" />
              New Project
            </Link>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center rounded-md border self-start">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 rounded-none rounded-l-md"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="size-4" />
            <span className="sr-only">Grid view</span>
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 rounded-none rounded-r-md"
            onClick={() => setViewMode("list")}
          >
            <List className="size-4" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div
          className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid md:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col"
          )}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
          <p className="text-muted-foreground">
            {search ? "No projects found" : "No projects yet"}
          </p>
          {search ? (
            <Button
              variant="link"
              className="mt-2"
              onClick={() => setSearch("")}
            >
              Clear search
            </Button>
          ) : currentRole === "owner" ? (
            <Button asChild variant="link" className="mt-2">
              <Link to={AppRoutes.projects.new}>Create your first project</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid md:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col"
          )}
        >
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canManage={currentRole === "owner"}
              isFavorited={isFavorite(project.id)}
              onToggleFavorite={toggleFavorite}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
