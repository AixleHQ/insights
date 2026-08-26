import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { AppRoutes, isAdminPath, isSafeRedirectPath } from "@/lib/routes";
import { useAuth } from "@/contexts/AuthContext";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirectTarget = searchParams.get("redirect");
  const redirectTarget = isSafeRedirectPath(rawRedirectTarget) ? rawRedirectTarget : null;
  const { isAuthenticated, isLoading, directLogin } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      if (redirectTarget && isAdminPath(redirectTarget)) {
        window.location.assign(redirectTarget);
        return;
      }
      navigate(redirectTarget || AppRoutes.dashboard, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTarget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await directLogin(email, password);
      if (redirectTarget && isAdminPath(redirectTarget)) {
        window.location.assign(redirectTarget);
        return;
      }
      navigate(redirectTarget || AppRoutes.dashboard, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AuthLayout>
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex w-full max-w-[448px] flex-col gap-12 px-4">
        <p className="type-h2 font-medium text-center tracking-tight text-muted-foreground">
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {formError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="type-caption text-destructive">{formError}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-muted-foreground">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-muted-foreground">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-border bg-transparent pr-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            size="default"
            className="w-full"
            disabled={isSubmitting || !email || !password}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Signing in...</>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

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
