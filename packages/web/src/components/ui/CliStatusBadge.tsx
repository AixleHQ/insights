import { CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CliStatusBadgeProps {
  connected: boolean | undefined;
  className?: string;
}

export function CliStatusBadge({ connected, className }: CliStatusBadgeProps) {
  if (connected === undefined) return null;

  if (connected) {
    return (
      <Badge variant="outline" className={cn("gap-1 text-xs", className)}>
        <CheckCircle2 className="size-3 text-emerald-500" />
        Connected
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("gap-1 text-xs cursor-default", className)}>
          <AlertCircle className="size-3 text-amber-500" />
          Not set up
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        User needs to run db90 login to start sending events
      </TooltipContent>
    </Tooltip>
  );
}
