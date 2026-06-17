import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FullPageErrorAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline";
}

interface FullPageErrorProps {
  illustration: string;
  title: string;
  description: string;
  actions?: FullPageErrorAction[];
  className?: string;
}

export function FullPageError({
  illustration,
  title,
  description,
  actions,
  className,
}: FullPageErrorProps) {
  return (
    <div
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-0">
        <img
          src={illustration}
          alt=""
          aria-hidden="true"
          className="w-[160px] shrink-0"
        />
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actions.map((action, i) => {
            const isPrimary = (action.variant ?? "default") === "default";
            if (action.href) {
              return (
                <Button
                  key={i}
                  asChild
                  variant={isPrimary ? "default" : "outline"}
                >
                  <a href={action.href}>{action.label}</a>
                </Button>
              );
            }
            return (
              <Button
                key={i}
                variant={isPrimary ? "default" : "outline"}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
