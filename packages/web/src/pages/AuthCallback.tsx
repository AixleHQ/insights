import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { loginCallback } from "../lib/auth";
import { AppRoutes, isSafeRedirectPath } from "@/lib/routes";

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

        // Restore the destination the user was trying to reach before being
        // sent to log in (e.g. an invitation link) — carried through the OIDC
        // `state` param, since React Router's location.state cannot survive
        // the external Keycloak redirect round-trip.
        const destination = isSafeRedirectPath(user.state) ? user.state : AppRoutes.dashboard;

        navigate(destination, { replace: true });
      } catch (err) {
        console.error("[AuthCallback] Error:", err);
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
