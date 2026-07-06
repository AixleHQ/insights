import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Plus, X } from "lucide-react";
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
import { AppRoutes } from "@/lib/routes";
import type { MemberRole } from "@/contexts/OrgContext";

interface InviteFormProps {
  onSubmit: (invites: Array<{ email: string; role: MemberRole }>) => Promise<Record<string, string | null>>;
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
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [sentEmails, setSentEmails] = useState<string[]>([]);

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
    setInviteErrors((prev) => {
      const next = { ...prev };
      delete next[emailToRemove];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let effectiveInvites = invites;

    if (email.trim()) {
      if (!isValidEmail(email)) {
        setError("Please enter a valid email address");
        return;
      }
      const duplicate = invites.find((inv) => inv.email.toLowerCase() === email.toLowerCase());
      if (duplicate) {
        setError("This email is already in the invite list");
        return;
      }
      const newEntry = { email: email.trim(), role };
      effectiveInvites = [...invites, newEntry];
      setInvites(effectiveInvites);
      setEmail("");
    }

    if (effectiveInvites.length === 0) {
      setError("Please add at least one email address");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setInviteErrors({});
    setSentEmails([]);
    try {
      const results = await onSubmit(effectiveInvites);

      const errors: Record<string, string> = {};
      const sent: string[] = [];

      for (const [inviteEmail, errMsg] of Object.entries(results)) {
        if (errMsg !== null) {
          errors[inviteEmail] = errMsg;
        } else {
          sent.push(inviteEmail);
        }
      }

      const hasErrors = Object.keys(errors).length > 0;

      if (hasErrors) {
        setInviteErrors(errors);
        setInvites((prev) => prev.filter((inv) => errors[inv.email] !== undefined));
        setSentEmails(sent);
      } else {
        navigate("/members");
      }
    } catch (err) {
      console.error("Failed to send invites:", err);
      setError("Failed to send invites. Please try again.");
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

  const pendingEmailIsNew =
    email.trim().length > 0 &&
    isValidEmail(email) &&
    !invites.some((inv) => inv.email.toLowerCase() === email.trim().toLowerCase());
  const hasInvites = invites.length > 0 || pendingEmailIsNew;
  const effectiveCount = invites.length + (pendingEmailIsNew ? 1 : 0);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(AppRoutes.members.root)}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="type-h3">Invite Team Members</h1>
          <p className="text-sm text-muted-foreground">
            Send invitations to join your organization
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="type-body-lg">Add People</CardTitle>
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
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-8">
                <Button type="button" variant="secondary" onClick={handleAddInvite} disabled={isSubmitting}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            {invites.length > 0 && (
              <div className="space-y-2">
                <Label>Pending Invites</Label>
                <div className="rounded-md border p-3 space-y-2">
                  {invites.map((invite) => (
                    <div key={invite.email} className="space-y-1">
                      <div
                        className={cn(
                          "flex items-center justify-between rounded-md px-3 py-2",
                          inviteErrors[invite.email]
                            ? "bg-destructive/10 border border-destructive/30"
                            : "bg-muted/50"
                        )}
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
                          disabled={isSubmitting}
                          onClick={() => handleRemoveInvite(invite.email)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                      {inviteErrors[invite.email] && (
                        <p className="text-xs text-destructive px-1">
                          {inviteErrors[invite.email]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sentEmails.length > 0 && (
              <div className="space-y-2">
                <Label className="text-green-600 dark:text-green-500">Sent Successfully</Label>
                <div className="rounded-md border border-green-200 dark:border-green-800 p-3 space-y-1">
                  {sentEmails.map((sentEmail) => (
                    <div key={sentEmail} className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 px-3 py-2">
                      <CheckCircle2 className="size-3.5 shrink-0 text-green-600 dark:text-green-500" />
                      <span className="text-sm">{sentEmail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">Role Permissions</p>
              <ul className="mt-2 space-y-1 type-caption text-muted-foreground">
                <li>
                  <strong>Owner:</strong> Full access — manage members, settings, and all projects
                </li>
                <li>
                  <strong>Member:</strong> View dashboards and contribute to projects
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
            onClick={() => navigate(AppRoutes.members.root)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !hasInvites}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send {effectiveCount > 0 && `(${effectiveCount})`} Invite
            {effectiveCount !== 1 && "s"}
          </Button>
        </div>
      </form>
    </div>
  );
}
