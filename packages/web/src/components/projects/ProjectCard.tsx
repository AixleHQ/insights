import { Link } from "react-router-dom";
import { MoreHorizontal, GitBranch, Activity, DollarSign, Calendar, Star, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCost, formatCount } from "@/lib/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isGitRemoteMissing } from "@/lib/project-git-remote";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ProjectWithStats } from "@/lib/types";
import { AppRoutes } from "@/lib/routes";

interface ProjectCardProps {
  project: ProjectWithStats;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  isFavorited?: boolean;
  onToggleFavorite?: (project: { id: string; name: string }) => void;
  onClick?: () => void;
  className?: string;
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectCard({ project, onEdit, onDelete, isFavorited, onToggleFavorite, onClick, className }: ProjectCardProps) {
  const showUnlinkedRemote = isGitRemoteMissing(project);

  return (
    <Card
      className={cn("group relative transition-shadow hover:shadow-md", onClick && "cursor-pointer", className)}
      onClick={onClick}
      {...(onClick && {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      })}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Link
              to={AppRoutes.projects.detail(project.id)}
              className="inline-block"
              onClick={(e) => e.stopPropagation()}
            >
              <CardTitle className="text-base font-semibold hover:text-primary hover:underline">
                {project.name}
              </CardTitle>
            </Link>
            {project.description && (
              <CardDescription className="line-clamp-2 text-xs">
                {project.description}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8 transition-opacity", isFavorited ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
                aria-label="Toggle favorite"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite({ id: project.id, name: project.name });
                }}
              >
                <Star
                  className={cn("size-4", isFavorited && "fill-current text-warning")}
                />
              </Button>
            )}
            <Badge variant={project.isActive ? "default" : "secondary"} className="text-xs">
              {project.isActive ? "Active" : "Inactive"}
            </Badge>
            {showUnlinkedRemote && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="cursor-default gap-1 border-warning/40 bg-warning/10 text-xs text-warning-foreground dark:text-warning/80"
                    aria-label="No git remote configured"
                  >
                    <AlertCircle className="size-3 text-warning dark:text-warning" />
                    Unlinked
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  No git remote configured — CLI events won&apos;t be attributed.
                </TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              {/* DropdownMenuContent renders in a Radix portal — menu item clicks do not bubble up through <Card>, so no stopPropagation needed on items */}
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={AppRoutes.projects.detail(project.id)}>View details</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit?.(project.id)}>
                  Edit project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete?.(project.id)}
                >
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="size-3" />
              Events
            </div>
            <p className="font-mono-display text-sm font-medium">
              {formatCount(project.eventCount || 0)}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="size-3" />
              Cost
            </div>
            <p className="font-mono-display text-sm font-medium">
              {formatCost(project.totalCostUsd || 0)}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              Created
            </div>
            <p className="text-sm font-medium">{formatDate(project.createdAt)}</p>
          </div>
        </div>

        {project.repositoryUrl && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {project.repositoryUrl.replace(/^https?:\/\/(github|gitlab|bitbucket)\.com\//, "")}
            </a>
          </div>
        )}

        {project.connectors && project.connectors.length > 0 && (
          <div className="flex items-center gap-1">
            {project.connectors.map((connector) => (
              <Badge key={connector.id} variant="outline" className="text-xs capitalize">
                {connector.provider}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
