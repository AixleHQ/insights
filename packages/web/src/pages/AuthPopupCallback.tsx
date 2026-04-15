import { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { User } from "oidc-client-ts";
import { getUserManager } from "../lib/auth";
import { config } from "../lib/config";

const keycloakConfig = {
  url: config.keycloakUrl,
  realm: config.keycloakRealm,
  clientId: config.keycloakClientId,
};

// Storage key for PKCE verifier - must match Login.tsx
const PKCE_VERIFIER_KEY = "pkce_code_verifier";

/**
 * This page handles the OAuth callback when authentication is done via popup.
 * It completes the token exchange with PKCE and sends a postMessage to the opener window.
 */
export function AuthPopupCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authorization code from the URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const errorParam = params.get("error");
        const errorDescription = params.get("error_description");

        if (errorParam) {
          throw new Error(errorDescription || errorParam);
        }

        if (!code) {
          throw new Error("No authorization code received");
        }

        // Get the PKCE code verifier from the opener's sessionStorage
        // Since we're in a popup, we need to access the opener's storage
        let codeVerifier: string | null = null;

        if (window.opener) {
          try {
            // Try to get from opener's sessionStorage
            codeVerifier = window.opener.sessionStorage.getItem(PKCE_VERIFIER_KEY);
          } catch {
            // Cross-origin access might be blocked, try our own storage as fallback
            codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
          }
        } else {
          codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
        }

        if (!codeVerifier) {
          throw new Error("PKCE code verifier not found");
        }

        // Exchange the code for tokens with PKCE
        const tokenUrl = `${keycloakConfig.url}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`;
        const redirectUri = `${window.location.origin}/auth/popup-callback`;

        const response = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: keycloakConfig.clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error_description || "Token exchange failed");
        }

        const tokenResponse = await response.json();

        // Parse the ID token to get user info
        const idTokenParts = tokenResponse.id_token.split(".");
        const idTokenPayload = JSON.parse(atob(idTokenParts[1]));

        // Create a User object compatible with oidc-client-ts
        const user = new User({
          access_token: tokenResponse.access_token,
          token_type: tokenResponse.token_type || "Bearer",
          id_token: tokenResponse.id_token,
          refresh_token: tokenResponse.refresh_token,
          profile: {
            sub: idTokenPayload.sub,
            iss: idTokenPayload.iss,
            aud: idTokenPayload.aud,
            exp: idTokenPayload.exp,
            iat: idTokenPayload.iat,
            email: idTokenPayload.email,
            name: idTokenPayload.name,
            preferred_username: idTokenPayload.preferred_username,
            email_verified: idTokenPayload.email_verified,
            picture: idTokenPayload.picture,
          },
          expires_at: Math.floor(Date.now() / 1000) + tokenResponse.expires_in,
          scope: tokenResponse.scope,
          session_state: tokenResponse.session_state,
        });

        // Store the user in the UserManager
        const manager = getUserManager();
        await manager.storeUser(user);

        setStatus("success");

        // Clean up PKCE verifier
        try {
          if (window.opener) {
            window.opener.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
          }
        } catch {
          // Ignore cross-origin errors
        }
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);

        // Notify opener window of success
        if (window.opener) {
          window.opener.postMessage({ type: "keycloak-auth-success" }, window.location.origin);
          // Close the popup after a short delay
          setTimeout(() => window.close(), 1000);
        } else {
          // Not a popup, redirect directly
          window.location.href = "/";
        }
      } catch (error) {
        console.error("Auth callback error:", error);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Authentication failed");

        // Notify opener window of error
        if (window.opener) {
          window.opener.postMessage({
            type: "keycloak-auth-error",
            error: error instanceof Error ? error.message : "Authentication failed"
          }, window.location.origin);
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4">
        {status === "processing" && (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Completing sign in...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="mx-auto size-8 text-green-500" />
            <p className="text-sm text-muted-foreground">Sign in successful!</p>
            <p className="text-xs text-muted-foreground">This window will close automatically...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto size-8 text-destructive" />
            <p className="text-sm text-destructive">Sign in failed</p>
            {errorMessage && (
              <p className="text-xs text-muted-foreground">{errorMessage}</p>
            )}
            <button
              onClick={() => window.close()}
              className="text-xs text-primary hover:underline"
            >
              Close this window
            </button>
          </>
        )}
      </div>
    </div>
  );
}
