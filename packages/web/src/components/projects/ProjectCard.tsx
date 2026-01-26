import { Link } from 'react-router-dom';
import { MoreHorizontal, GitBranch, Activity, DollarSign, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  repository_url?: string;
  is_active: boolean;
  event_count: number;
  total_cost_usd: number;
  last_event_at?: string;
  created_at: string;
  connectors?: Array<{
    id: string;
    provider: string;
  }>;
}

interface ProjectCardProps {
  project: ProjectData;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function ProjectCard({ project, onEdit, onDelete, className }: ProjectCardProps) {
  return (
    <Card className={cn('group relative transition-shadow hover:shadow-md', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Link
              to={`/projects/${project.id}`}
              className="inline-block"
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
            <Badge variant={project.is_active ? 'default' : 'secondary'} className="text-xs">
              {project.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to={`/projects/${project.id}`}>View details</Link>
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
              {project.event_count.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="size-3" />
              Cost
            </div>
            <p className="font-mono-display text-sm font-medium">
              {formatCurrency(project.total_cost_usd)}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              Created
            </div>
            <p className="text-sm font-medium">{formatDate(project.created_at)}</p>
          </div>
        </div>

        {project.repository_url && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            <a
              href={project.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-foreground hover:underline"
            >
              {project.repository_url.replace(/^https?:\/\/(github|gitlab|bitbucket)\.com\//, '')}
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
