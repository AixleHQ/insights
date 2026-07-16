import { cn } from "@/lib/utils";

export interface ContentPanelProps {
  title: string;
  content?: string | null;
  /** Message shown when there is no content. Defaults to "No content available". */
  emptyMessage?: string;
  className?: string;
  preClassName?: string;
}

/**
 * Renders event content in a scrollable code block. When content is absent it
 * shows a graceful dashed placeholder instead of an empty <pre>.
 */
export function ContentPanel({
  title,
  content,
  emptyMessage = "No content available",
  className,
  preClassName,
}: ContentPanelProps) {
  const hasContent = typeof content === "string" && content.trim().length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="type-label">{title}</h4>
      {hasContent ? (
        <pre
          className={cn(
            "max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs",
            preClassName
          )}
        >
          <code className="whitespace-pre-wrap break-all">{content}</code>
        </pre>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      )}
    </div>
  );
}
