import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateOrganization } from "@/hooks/useApi";
import { Button } from "@/components/ui/button";
import { AppRoutes } from "@/lib/routes";

export default function NoActiveOrganization() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { refreshOrganizations } = useOrg();
  const createOrg = useCreateOrganization();
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await createOrg.mutateAsync({ name: orgName.trim(), description: "" });
      await refreshOrganizations(created.id);
      navigate(AppRoutes.dashboard, { replace: true });
    } catch {
      setError("Failed to create organization. Please try again.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        <h1 className="text-2xl font-semibold">No active organization</h1>
        <p className="text-muted-foreground">
          Your organizations are inactive or unavailable. Contact an admin if
          you need access restored.
        </p>

        <form onSubmit={handleCreate} className="space-y-4 text-left">
          <div className="space-y-2">
            <label htmlFor="org-name" className="text-sm font-medium">
              Organization name
            </label>
            <input
              id="org-name"
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="My organization"
            />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={createOrg.isPending}>
            {createOrg.isPending ? "Creating…" : "Create organization"}
          </Button>
        </form>

        <Button variant="ghost" className="w-full" onClick={logout}>
          Log out
        </Button>
      </div>
    </div>
  );
}
