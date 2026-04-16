export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "settings.create": "Settings Created",
  "settings.update": "Settings Updated",
  "settings.delete": "Settings Deleted",
  "connector.create": "Connector Created",
  "connector.update": "Connector Updated",
  "connector.delete": "Connector Deleted",
  "connector.test": "Connector Tested",
  "connector.sync": "Connector Synced",
  "member.invited": "Member Invited",
  "member.role_changed": "Role Changed",
  "member.removed": "Member Removed",
  "impersonation.started": "Impersonation Started",
  "impersonation.ended": "Impersonation Ended",
};

export const AUDIT_ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  ...Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => ({ value, label })),
];
