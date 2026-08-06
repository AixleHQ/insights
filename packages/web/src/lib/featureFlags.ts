import { config } from "@/lib/config";

// AIX-571: backend score is currently a token-count stub, not a real prompt
// quality assessment. Controlled only via the
// SHOW_PROMPT_INSIGHTS_SECTION_IN_PERSONAL_DASHBOARD container env var
// (Dockerfile.web -> window.__APP_CONFIG__) — set true once the real scorer ships.
export const SHOW_PROMPT_INSIGHTS_SECTION_IN_PERSONAL_DASHBOARD = config.showPromptInsightsSectionInPersonalDashboard === "true";

// AIX-601/AIX-602: catalog governance is exposed but not enforced yet.
// Flip to true in the PR that ships backend catalog enforcement.
export const SHOW_INTEGRATION_CATALOG = false;
