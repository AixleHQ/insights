import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-sm text-warning"
    >
      <WifiOff className="size-4" aria-hidden="true" />
      <span className="font-medium">You're offline.</span>
      <span className="text-muted-foreground">Some data may be out of date.</span>
    </div>
  );
}
