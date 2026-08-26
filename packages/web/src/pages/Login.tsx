import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppRoutes, isAdminPath, isSafeRedirectPath } from "@/lib/routes";
import { Loader2, Fingerprint } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthLayout } from "@/components/AuthLayout";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirectTarget = searchParams.get("redirect");
  const redirectTarget = isSafeRedirectPath(rawRedirectTarget) ? rawRedirectTarget : null;
  const { isAuthenticated, isLoading, login } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      if (redirectTarget && isAdminPath(redirectTarget)) {
        window.location.assign(redirectTarget);
        return;
      }
      navigate(redirectTarget || AppRoutes.dashboard, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTarget]);

  if (isLoading) {
    return (
      <AuthLayout>
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex w-full max-w-[448px] flex-col items-center gap-12 px-4">
        {/* Tagline */}
        <p className="type-h2 font-medium text-center tracking-tight text-muted-foreground">
          Every <span className="text-foreground">AI Token</span> your team
          <br />
          ever spent. Right Here.
        </p>

        {/* Auth actions */}
        <div className="flex w-full flex-col gap-4">
          {/* Continue with Google — primary */}
          <Button
            type="button"
            size="default"
            className="w-full"
            onClick={() => login(redirectTarget ?? undefined)}
          >
            <GoogleLogo className="mr-2 size-5 shrink-0" />
            Continue with Google
          </Button>

          {/* Continue with Email — tertiary glass */}
          <Button
            type="button"
            size="default"
            variant="outline"
            className="w-full border-border bg-transparent text-foreground/85 backdrop-blur-sm hover:bg-white/5 hover:text-foreground"
            onClick={() => navigate(AppRoutes.loginEmail)}
          >
            Continue with Email
          </Button>

          {/* Continue with Passkey — coming soon */}
          <Button
            type="button"
            size="default"
            variant="outline"
            disabled
            aria-disabled={true}
            className="w-full cursor-not-allowed border-border bg-transparent text-muted-foreground backdrop-blur-sm"
          >
            <Fingerprint className="mr-2 size-4 shrink-0" />
            Continue with Passkey
            <Badge variant="secondary" className="ml-auto text-[10px]">Coming soon</Badge>
          </Button>
        </div>

        {/* Sign up link */}
        <p className="type-body text-center text-muted-foreground">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => navigate(AppRoutes.signup)}
          >
            Sign Up
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
