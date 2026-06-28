import { AlertCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  icon: Icon = AlertCircle,
  title = "Something went wrong",
  description,
  retryLabel = "Try again",
  onRetry,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6" : "py-12",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-muted",
          compact ? "size-9" : "size-12",
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground",
            compact ? "size-4" : "size-5",
          )}
        />
      </div>
      <h3
        className={cn(
          "mt-3 font-semibold",
          compact ? "text-sm" : "text-base",
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "mt-1 max-w-xs text-muted-foreground",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          size={compact ? "sm" : "default"}
          onClick={onRetry}
          className="mt-4"
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
