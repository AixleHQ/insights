import { useEffect } from "react";
import { getUserManager } from "../lib/auth";

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
      });
  }, []);

  return null;
}
