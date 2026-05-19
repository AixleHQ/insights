import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/contexts/OrgContext";

interface InviteFormProps {
  onSubmit: (invites: Array<{ email: string; role: MemberRole }>) => Promise<void>;
  className?: string;
}

interface InviteEntry {
  email: string;
  role: MemberRole;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function InviteForm({ onSubmit, className }: InviteFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [error, setError] = useState("");

  const handleAddInvite = () => {
    if (!email.trim()) {
      setError("Please enter an email address");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (invites.some((inv) => inv.email.toLowerCase() === email.toLowerCase())) {
      setError("This email has already been added");
      return;
    }

    setInvites((prev) => [...prev, { email: email.trim(), role }]);
    setEmail("");
    setError("");
  };

  const handleRemoveInvite = (emailToRemove: string) => {
    setInvites((prev) => prev.filter((inv) => inv.email !== emailToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (invites.length === 0) {
      setError("Please add at least one email address");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(invites);
      navigate("/members");
    } catch (error) {
      console.error("Failed to send invites:", error);
      // Extract specific validation error message if available
      let errorMessage = "Failed to send invites. Please try again.";
      if (error && typeof error === "object" && "data" in error) {
        const apiError = error as { data?: { errors?: Record<string, string[]> } };
        if (apiError.data?.errors) {
          const messages = Object.entries(apiError.data.errors)
            .map(([field, msgs]) => `${field} ${(msgs as string[]).join(", ")}`)
            .join(". ");
          if (messages) {
            errorMessage = messages;
          }
        }
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddInvite();
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/members")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Invite Team Members</h1>
          <p className="text-sm text-muted-foreground">
            Send invitations to join your organization
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add People</CardTitle>
            <CardDescription>
              Enter email addresses and select their role
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  onKeyDown={handleKeyDown}
                  className={cn(error && "border-destructive")}
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <div className="w-32 space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-8">
                <Button type="button" variant="secondary" onClick={handleAddInvite}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {invites.length > 0 && (
              <div className="space-y-2">
                <Label>Pending Invites</Label>
                <div className="rounded-md border p-3 space-y-2">
                  {invites.map((invite) => (
                    <div
                      key={invite.email}
                      className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{invite.email}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {invite.role}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => handleRemoveInvite(invite.email)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Role Permissions</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>
                  <strong>Admin:</strong> Full access, can manage team and settings
                </li>
                <li>
                  <strong>Member:</strong> Can view all data and create projects
                </li>
                <li>
                  <strong>Viewer:</strong> Read-only access to events and dashboards
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/members")}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || invites.length === 0}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send {invites.length > 0 && `(${invites.length})`} Invite
            {invites.length !== 1 && "s"}
          </Button>
        </div>
      </form>
    </div>
  );
}
