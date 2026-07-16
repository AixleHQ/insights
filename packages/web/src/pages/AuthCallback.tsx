import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { loginCallback, login, isDeadSessionError } from "../lib/auth";
import { reportAuthError } from "../lib/rollbar";
import { AppRoutes, isSafeRedirectPath } from "@/lib/routes";

/**
 * sessionStorage flag guarding the single automatic retry below, so a persistently
 * failing code exchange can't loop between this page and Keycloak.
 */
const RETRY_FLAG = "auth_callback_retried";

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution in React Strict Mode
    if (hasProcessed.current) {
      return;
    }
    hasProcessed.current = true;

    const handleCallback = async () => {
      try {
        const user = await loginCallback();
        // Success — clear the retry guard so a future genuine failure can retry once.
        sessionStorage.removeItem(RETRY_FLAG);

        // Restore the destination the user was trying to reach before being
        // sent to log in (e.g. an invitation link) — carried through the OIDC
        // `state` param, since React Router's location.state cannot survive
        // the external Keycloak redirect round-trip.
        const destination = isSafeRedirectPath(user.state) ? user.state : AppRoutes.dashboard;

        navigate(destination, { replace: true });
      } catch (err) {
        console.error("[AuthCallback] Error:", err);
        reportAuthError(err, { surface: "AuthCallback" });

        // A dead authorization code (Keycloak `invalid_grant` — typically a transient
        // node/cluster blip during the exchange) is recoverable: a fresh code usually
        // succeeds. Silently retry the login redirect once, guarded by RETRY_FLAG so a
        // persistent failure can't loop, before surfacing the dead-end banner.
        if (isDeadSessionError(err) && !sessionStorage.getItem(RETRY_FLAG)) {
          sessionStorage.setItem(RETRY_FLAG, "1");
          login().catch((retryErr) => {
            reportAuthError(retryErr, { surface: "AuthCallback.retry" });
            setError(retryErr instanceof Error ? retryErr.message : "Authentication failed");
          });
          return;
        }

        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h1 className="type-h3 text-red-800 mb-2">
            Authentication Failed
          </h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(AppRoutes.login)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
      <p className="text-gray-600">Completing sign in...</p>
    </div>
  );
}
