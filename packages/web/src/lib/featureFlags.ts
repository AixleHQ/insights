import { config } from "@/lib/config";

// AIX-571: backend score is currently a token-count stub, not a real prompt
// quality assessment. Controlled only via the SHOW_PROMPT_INSIGHTS container
// env var (Dockerfile.web -> window.__APP_CONFIG__) — set true once the real
// scorer ships.
export const SHOW_PROMPT_INSIGHTS = config.showPromptInsights === "true";
