export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "project.create": "Project Created",
  "project.delete": "Project Deleted",
  "settings.create": "Settings Created",
  "settings.update": "Settings Updated",
  "settings.delete": "Settings Deleted",
  "retention.update": "Retention Policy Updated",
  "alert.update": "Alert Thresholds Updated",
  "connector.create": "Connector Created",
  "connector.update": "Connector Updated",
  "connector.delete": "Connector Deleted",
  "connector.test": "Connector Tested",
  "connector.sync": "Connector Synced",
  "notification_route.create": "Notification Route Created",
  "notification_route.update": "Notification Route Updated",
  "notification_route.delete": "Notification Route Deleted",
  "tool_account.create": "API Token Created",
  "tool_account.update": "API Token Updated",
  "tool_account.delete": "API Token Revoked",
  "tool_account.regenerate": "API Token Regenerated",
  "member.invited": "Member Invited",
  "member.role_changed": "Role Changed",
  "member.removed": "Member Removed",
  "impersonation.started": "Impersonation Started",
  "impersonation.ended": "Impersonation Ended",
  // Admin scope actions (Rails action_name + explicit named actions)
  "impersonate": "Admin: Impersonation",
  "batch_delete": "Admin: Batch Delete",
  "create": "Admin: Create",
  "update": "Admin: Update",
  "destroy": "Admin: Delete",
  "index": "Admin: View Records",
  "show": "Admin: View Record",
};

/** Actions stored on organization/project audit log tables (excludes admin-only actions). */
export const SCOPE_AUDIT_ACTION_KEYS = [
  "project.create",
  "project.delete",
  "settings.create",
  "settings.update",
  "settings.delete",
  "retention.update",
  "alert.update",
  "connector.create",
  "connector.update",
  "connector.delete",
  "connector.test",
  "connector.sync",
  "notification_route.create",
  "notification_route.update",
  "notification_route.delete",
  "tool_account.create",
  "tool_account.update",
  "tool_account.delete",
  "tool_account.regenerate",
  "member.invited",
  "member.role_changed",
  "member.removed",
  "impersonation.started",
  "impersonation.ended",
] as const;

export const SCOPE_AUDIT_ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  ...SCOPE_AUDIT_ACTION_KEYS.map((value) => ({
    value,
    label: AUDIT_ACTION_LABELS[value],
  })),
];

export const AUDIT_ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];

export function getAuditActionLabel(action: string, scope?: string): string {
  if (scope === "admin") {
    return AUDIT_ACTION_LABELS[action] ?? `Admin: ${action.replace(/_/g, " ")}`;
  }
  return AUDIT_ACTION_LABELS[action] ?? action;
}
