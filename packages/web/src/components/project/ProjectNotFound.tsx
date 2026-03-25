import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProjectNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <p className="text-muted-foreground">Project not found</p>
      <Button asChild variant="link" className="mt-2">
        <Link to="/projects">
          <ArrowLeft className="mr-2 size-4" />
          Back to projects
        </Link>
      </Button>
    </div>
  );
}
