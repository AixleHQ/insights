// AIX-571: backend score is currently a token-count stub, not a real prompt
// quality assessment. Set VITE_SHOW_PROMPT_INSIGHTS=true once the real scorer ships.
export const SHOW_PROMPT_INSIGHTS = import.meta.env.VITE_SHOW_PROMPT_INSIGHTS === "true";
