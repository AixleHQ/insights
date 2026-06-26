import { cn } from "@/lib/utils"

interface EmptyStateProps {
  title: string
  description?: string
  illustration?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  title,
  description,
  illustration,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-6 rounded-lg border px-16 py-12 text-center",
        className
      )}
    >
      <div className="flex flex-col items-center gap-0">
        {illustration && (
          <div className="w-[160px] shrink-0">{illustration}</div>
        )}
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
