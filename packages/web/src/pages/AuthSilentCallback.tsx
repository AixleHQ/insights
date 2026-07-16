import { useEffect } from "react";
import { getUserManager } from "../lib/auth";
import { reportAuthError } from "../lib/rollbar";

/**
 * Loaded inside a hidden iframe by oidc-client-ts during silent token renewal.
 * Must call signinSilentCallback() so the parent frame receives the new token
 * via postMessage and resolves the signinSilent() promise.
 */
export function AuthSilentCallback() {
  useEffect(() => {
    getUserManager()
      .signinSilentCallback()
      .catch((err) => {
        console.error("[AuthSilentCallback] signinSilentCallback failed:", err);
        // Headless (runs in the hidden renew iframe) — report for observability and let
        // the parent frame's silent-renew-error handling drive any state change.
        reportAuthError(err, { surface: "AuthSilentCallback" });
      });
  }, []);

  return null;
}
