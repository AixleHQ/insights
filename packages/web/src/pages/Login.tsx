import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { AppRoutes, isSafeRedirectPath } from "@/lib/routes";
import { Loader2, Mail, Fingerprint } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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

const DOTS = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  top: `${Math.floor((i * 37 + 11) % 95)}%`,
  left: `${Math.floor((i * 53 + 7) % 95)}%`,
  delay: `${((i * 0.47) % 4).toFixed(2)}s`,
  duration: `${(3 + (i * 0.31) % 4).toFixed(2)}s`,
  size: i % 3 === 0 ? 3 : 2,
}));

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawRedirectTarget = searchParams.get("redirect");
  const redirectTarget = isSafeRedirectPath(rawRedirectTarget) ? rawRedirectTarget : null;
  const { isAuthenticated, isLoading, login, directLogin } = useAuth();

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTarget || AppRoutes.dashboard, { replace: true });
    }
  }, [isAuthenticated, navigate, redirectTarget]);

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await directLogin(email, password);
      navigate(redirectTarget || AppRoutes.dashboard, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      // Force dark tokens — login is always dark per Figma design
      <div className="dark flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    // Force dark tokens — login is always dark per Figma design
    <div className="dark relative flex min-h-svh items-center justify-center overflow-hidden bg-background">
      {/* Particle background */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        {DOTS.map((dot) => (
          <span
            key={dot.id}
            className="absolute rounded-full bg-muted-foreground/30"
            style={{
              top: dot.top,
              left: dot.left,
              width: dot.size,
              height: dot.size,
              animation: `float-dot ${dot.duration} ${dot.delay} ease-in-out infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm px-4">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <span className="font-mono-display type-h2 text-primary-foreground">AI</span>
          </div>
          <div>
            <h1 className="type-h2 text-foreground">Aixle Insights</h1>
            <p className="mt-1 type-body leading-snug text-muted-foreground">
              Every AI Token your team ever spent.<br />Right Here.
            </p>
          </div>
        </div>

        {/* Auth buttons */}
        <div className="space-y-3">
          {formError && (
            <div className="rounded-lg border border-red-800/50 bg-red-950/50 p-3">
              <p className="text-sm text-red-400">{formError}</p>
            </div>
          )}

          {/* Google */}
          <Button
            type="button"
            size="lg"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/80"
            onClick={() => login(redirectTarget ?? undefined)}
          >
            <GoogleLogo className="mr-2 size-5" />
            Continue with Google
          </Button>

          {/* Email toggle */}
          {!showEmailForm ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full border-border bg-transparent text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              onClick={() => setShowEmailForm(true)}
            >
              <Mail className="mr-2 size-4" />
              Continue with Email
            </Button>
          ) : (
            <form onSubmit={handleDirectLogin} className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-foreground/70">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-border bg-input text-foreground placeholder:text-muted-foreground"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-foreground/70">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-border bg-input text-foreground placeholder:text-muted-foreground"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowEmailForm(false); setFormError(null); }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="flex-1"
                  disabled={isSubmitting || !email || !password}
                >
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 size-4 animate-spin" />Signing in...</>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Passkey — coming soon */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled
            aria-disabled={true}
            className="w-full cursor-not-allowed border-border bg-transparent text-muted-foreground"
          >
            <Fingerprint className="mr-2 size-4" />
            Continue with Passkey
            <Badge variant="secondary" className="ml-auto text-[10px]">Coming soon</Badge>
          </Button>
        </div>

        {/* Sign up */}
        <p className="mt-6 text-center type-body text-muted-foreground">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="text-foreground/70 underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign Up
          </button>
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground/60">
          <Link
            to={AppRoutes.legal.terms}
            state={{ from: AppRoutes.login }}
            className="hover:text-muted-foreground underline-offset-4 hover:underline"
          >
            Terms of Service
          </Link>
          {" · "}
          <Link
            to={AppRoutes.legal.privacy}
            state={{ from: AppRoutes.login }}
            className="hover:text-muted-foreground underline-offset-4 hover:underline"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
