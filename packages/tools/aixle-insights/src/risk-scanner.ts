export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ScanResult {
  risk_level: RiskLevel;
  risk_score: number;
  risk_categories: string[];
  scannable: true;
}

interface PatternCategory {
  patterns: RegExp[];
  weight: number;
}

const CATEGORIES: Record<string, PatternCategory> = {
  secrets: {
    weight: 3,
    patterns: [
      /AKIA[0-9A-Z]{16}/gi,                          // AWS Access Key
      /ghp_[A-Za-z0-9]{36}/gi,                        // GitHub personal access token
      /gho_[A-Za-z0-9]{36}/gi,                        // GitHub OAuth token
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi, // JWT
    ],
  },
  pii_high: {
    weight: 3,
    patterns: [
      /\b\d{3}-\d{2}-\d{4}\b/g,                      // SSN
      /* eslint-disable-next-line security/detect-unsafe-regex -- Flagged for
         `{3}` inside `(?:…)?`. Every branch is a fixed-length digit run
         anchored by \b, so the match is bounded and cannot backtrack
         super-linearly. */
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g, // Credit card
    ],
  },
  pii_standard: {
    weight: 1,
    patterns: [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi, // Email
      /* eslint-disable-next-line security/detect-unsafe-regex -- Flagged for
         `?` nested in `?`. All quantified groups are fixed-length digit or
         separator classes anchored by \b; matching is bounded. */
      /\b(?:\+?1[-.\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, // Phone
    ],
  },
};

const THRESHOLDS = { medium: 1, high: 3, critical: 5 };

export function scanText(text: string): ScanResult {
  let risk_score = 0;
  const risk_categories: string[] = [];

  for (const [categoryName, { patterns, weight }] of Object.entries(CATEGORIES)) {
    let categoryMatches = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        categoryMatches += matches.length;
      }
    }
    if (categoryMatches > 0) {
      risk_score += weight * categoryMatches;
      risk_categories.push(categoryName);
    }
  }

  let risk_level: RiskLevel = "low";
  if (risk_score >= THRESHOLDS.critical) {
    risk_level = "critical";
  } else if (risk_score >= THRESHOLDS.high) {
    risk_level = "high";
  } else if (risk_score >= THRESHOLDS.medium) {
    risk_level = "medium";
  }

  return {
    risk_level,
    risk_score,
    risk_categories,
    scannable: true,
  };
}
