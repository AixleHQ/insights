import { Link } from "react-router-dom";
import { MoreHorizontal, Star, AlertCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { FolderBoltIcon } from "@/components/icons";

interface ProjectCardProps {
  project: ProjectWithStats;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  canManage?: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: (project: { id: string; name: string }) => void;
  onClick?: () => void;
  className?: string;
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1">
      <span className="font-mono-display type-caption text-muted-foreground">{label}</span>
      <span className="font-mono-display type-caption font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}

export function ProjectCard({ project, onEdit, onDelete, canManage = false, isFavorited, onToggleFavorite, onClick, className }: ProjectCardProps) {
  const showUnlinkedRemote = isGitRemoteMissing(project);
  const detailHref = AppRoutes.projects.detail(project.id);

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between gap-4 overflow-hidden p-5 transition-all duration-200 hover:shadow-md",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {/* Stretched link — primary keyboard/a11y navigation target; mouse clicks are handled by the Card onClick above */}
      <Link
        to={detailHref}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`View ${project.name}`}
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Decorative corner trace */}
      <svg
        className="absolute right-0 top-0 text-border/50"
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <path d="M48 0 L48 18 Q48 24 42 24 L24 24" stroke="currentColor" strokeWidth="1" />
        <path d="M48 0 L48 10 Q48 16 42 16 L32 16" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      </svg>

      {/* Star — absolute to card, above stretched link */}
      {onToggleFavorite && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-8 top-3 z-20 size-7 transition-opacity",
            isFavorited ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          aria-label="Toggle favorite"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite({ id: project.id, name: project.name });
          }}
        >
          <Star className={cn("size-3.5", isFavorited && "fill-current text-warning")} />
        </Button>
      )}

      {/* Header: icon + name */}
      <div className="relative z-10 flex items-start gap-2 pr-8">
        <div className="flex min-w-0 items-center gap-2">
          <FolderBoltIcon className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="type-label truncate font-medium text-foreground">
            {project.name}
          </h3>
          {showUnlinkedRemote && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle
                  className="size-3.5 shrink-0 text-warning"
                  aria-label="No git remote configured"
                />
              </TooltipTrigger>
              <TooltipContent>
                No git remote configured — CLI events won&apos;t be attributed.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Footer: stats + actions */}
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatBadge label="Events" value={formatCount(project.eventCount || 0)} />
          <StatBadge label="Cost" value={formatCost(project.totalCostUsd || 0)} />
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-3.5" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            {/* DropdownMenuContent renders in a Radix portal — menu item clicks do not bubble up through <Card>, so no stopPropagation needed on items */}
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={AppRoutes.projects.detail(project.id)}>View details</Link>
              </DropdownMenuItem>
              {canManage && (
                <>
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
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            asChild
          >
            <Link to={detailHref} tabIndex={-1} aria-hidden="true">
              <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
