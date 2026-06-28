import { FullPageError } from "@/components/FullPageError";
import illustration from "@/assets/illustrations/500.svg";

interface ServerErrorProps {
  onRetry?: () => void;
}

export function ServerError({ onRetry }: ServerErrorProps) {
  return (
    <FullPageError
      illustration={illustration}
      title="Something went wrong"
      description="An unexpected error occurred. You can try again, or head back to the dashboard."
      actions={[
        ...(onRetry ? [{ label: "Try again", onClick: onRetry }] : []),
        { label: "Back to dashboard", href: "/", variant: "outline" as const },
      ]}
    />
  );
}
