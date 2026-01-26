import { AlertTriangle, X } from 'lucide-react';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { Button } from '@/components/ui/button';

export function ImpersonationBar() {
  const { isImpersonating, impersonatorEmail, stopImpersonation } = useImpersonation();

  if (!isImpersonating) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4" />
          <span className="text-sm font-medium">
            Impersonation Mode
            {impersonatorEmail && (
              <span className="ml-1 font-normal">
                (Admin: {impersonatorEmail})
              </span>
            )}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={stopImpersonation}
          className="h-7 gap-1 text-amber-950 hover:bg-amber-600 hover:text-amber-950"
        >
          <X className="size-3" />
          Stop Impersonating
        </Button>
      </div>
    </div>
  );
}
