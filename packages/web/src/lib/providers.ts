export type IntegrationScope = "org" | "project" | "persona";

export type IntegrationProvider =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "jira"
  | "linear"
  | "slack"
  | "figma"
  | "claude"
  | "claude-code"
  | "anthropic"
  | "openai"
  | "openrouter"
  | "gemini"
  | "cursor"
  | "github_copilot"
  | "google";

export interface ProviderInfo {
  id: IntegrationProvider;
  name: string;
  description: string;
  category: "code" | "project" | "ai" | "design" | "communication";
  features: string[];
  available: boolean;
  comingSoon?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  connectSheet?: "webhook";
  scope: IntegrationScope;
}

export const availableProviders: ProviderInfo[] = [
  // Code Hosting / Version Control
  {
    id: "github",
    name: "GitHub",
    description: "Connect repositories, pull requests, and commits",
    category: "code",
    scope: "project",
    features: [
      "Repository tracking",
      "Pull request events",
      "Commit monitoring",
      "Copilot usage analytics",
    ],
    available: true,
  },
  {
    id: "gitlab",
    name: "GitLab",
    description: "Connect projects, merge requests, and pipelines",
    category: "code",
    scope: "project",
    features: [
      "Project tracking",
      "Merge request events",
      "Pipeline monitoring",
      "CI/CD analytics",
    ],
    available: true,
  },
  {
    id: "bitbucket",
    name: "Bitbucket",
    description: "Connect workspaces, repositories, pull requests, and pipelines",
    category: "code",
    scope: "project",
    features: [
      "Workspace sync",
      "Repository tracking",
      "Pull request events",
      "Commit monitoring",
      "Pipeline monitoring",
    ],
    available: true,
  },

  // Project Management
  {
    id: "jira",
    name: "Jira",
    description: "Connect issues and projects for context",
    category: "project",
    scope: "org",
    features: ["Issue tracking", "Project context", "Sprint monitoring"],
    available: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Connect teams, projects, issues, and cycles",
    category: "project",
    scope: "org",
    features: ["Team sync", "Project context", "Issue throughput", "Cycle monitoring"],
    available: true,
  },

  // AI / LLM Providers
  {
    id: "claude",
    name: "Claude",
    description: "Track Claude API usage and conversations",
    category: "ai",
    scope: "org",
    features: [
      "API usage tracking",
      "Token consumption",
      "Cost analytics",
      "Model usage breakdown",
    ],
    available: false,
    comingSoon: true,
  },
  {
    id: "anthropic",
    name: "Anthropic API",
    description: "Track Anthropic API usage, costs, and model analytics",
    category: "ai",
    scope: "org",
    features: [
      "API key management",
      "Usage monitoring",
      "Cost tracking",
      "Rate limit visibility",
    ],
    available: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Track OpenAI API usage and costs",
    category: "ai",
    scope: "org",
    features: [
      "API usage tracking",
      "GPT model analytics",
      "Token consumption",
      "Cost breakdown",
    ],
    available: true,
    inputPlaceholder: "sk-admin-...",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Multi-model AI gateway tracking",
    category: "ai",
    scope: "org",
    features: [
      "Multi-provider analytics",
      "Model comparison",
      "Cost optimization",
      "Usage patterns",
    ],
    available: true,
  },
  {
    id: "gemini",
    name: "Gemini",
    description: "Track Google Gemini API usage via Aixle Insights AI Gateway — usage is recorded per request, not via API polling",
    category: "ai",
    scope: "org",
    features: [
      "API usage tracking",
      "Model analytics",
      "Token consumption",
      "Cost breakdown",
    ],
    available: true,
  },
  {
    id: "github_copilot",
    name: "GitHub Copilot",
    description: "Track real Copilot seat counts, suggestion acceptance rates, and daily active users via the GitHub API",
    category: "ai",
    scope: "org",
    features: [
      "Seat count & active users",
      "Acceptance rate tracking",
      "Lines suggested vs accepted",
      "Daily sync from GitHub API",
    ],
    available: true,
  },

  // Design
  {
    id: "figma",
    name: "Figma",
    description: "Track AI features in Figma",
    category: "design",
    scope: "org",
    features: [
      "AI plugin usage",
      "Design generation",
      "Collaboration insights",
    ],
    available: false,
    comingSoon: true,
  },

  // Communication
  {
    id: "slack",
    name: "Slack",
    description: "Receive alerts and notifications",
    category: "communication",
    scope: "org",
    features: ["Alert notifications", "Usage summaries", "Bot commands"],
    available: true,
  },
];

export const categoryLabels: Record<ProviderInfo["category"], string> = {
  code: "Code Hosting",
  project: "Project Management",
  ai: "AI Tools",
  design: "Design",
  communication: "Communication",
};
