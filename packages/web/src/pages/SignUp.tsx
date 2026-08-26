import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { AppRoutes } from "@/lib/routes";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export function SignUp() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO: wire to Keycloak self-registration once available (follow-up ticket; not AIX-709 Done)
      setFormError("Account creation is not yet available. Please contact your administrator.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex w-full max-w-[448px] flex-col gap-12 px-4">
        <p className="type-h2 font-medium text-center tracking-tight text-muted-foreground">
          Create your account
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {formError && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <p className="type-caption text-destructive">{formError}</p>
            </div>
          )}

          {/* First + Last name */}
          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="first-name" className="text-muted-foreground">First name</Label>
              <Input
                id="first-name"
                type="text"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                required
                autoComplete="given-name"
                autoFocus
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="last-name" className="text-muted-foreground">Last name</Label>
              <Input
                id="last-name"
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="border-border bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                required
                autoComplete="family-name"
              />
            </div>
          </div>

          {/* Email */}
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
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-muted-foreground">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-border bg-transparent pr-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                required
                autoComplete="new-password"
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

          {/* Confirm Password */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password" className="text-muted-foreground">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-border bg-transparent pr-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirmPassword((v) => !v)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Terms */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="terms"
              checked={termsAccepted}
              onCheckedChange={(checked) => setTermsAccepted(checked === true)}
            />
            <label htmlFor="terms" className="type-caption cursor-pointer text-muted-foreground">
              I agree to the Terms of Service and Privacy Policy
            </label>
          </div>

          <Button
            type="submit"
            size="default"
            className="w-full"
            disabled={!termsAccepted || isSubmitting}
          >
            {isSubmitting ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Creating account...</>
            ) : (
              "Sign up"
            )}
          </Button>
        </form>

        <p className="type-body text-center text-muted-foreground">
          Already have an account?{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => navigate(AppRoutes.loginEmail)}
          >
            Sign In
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
