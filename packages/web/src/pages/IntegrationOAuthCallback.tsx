import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export function IntegrationOAuthCallback() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'integration_oauth_callback',
          code,
          state,
          error: error || errorDescription,
        },
        window.location.origin
      );

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(error ? 'error' : 'success');

      // Close the popup after a short delay
      setTimeout(() => {
        window.close();
      }, 1500);
    } else {
      // If opened directly (not as popup), redirect to integrations
      setStatus('error');
    }
  }, [params]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
      {status === 'processing' && (
        <>
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Completing authorization...</p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle2 className="size-8 text-success" />
          <p className="text-muted-foreground">Authorization successful! Closing...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle className="size-8 text-destructive" />
          <p className="text-muted-foreground">Authorization failed</p>
          <p className="text-sm text-muted-foreground">
            {params.get('error_description') || params.get('error') || 'Please try again'}
          </p>
        </>
      )}
    </div>
  );
}
