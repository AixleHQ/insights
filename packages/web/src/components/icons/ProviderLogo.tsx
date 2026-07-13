import React from "react";
import { cn } from "@/lib/utils";

const logoMap: Record<string, string> = {
  // Code hosting / Version control
  github: "/logos/github.svg",
  gitlab: "/logos/gitlab.svg",
  bitbucket: "/logos/bitbucket.svg",

  // Project management
  jira: "/logos/jira.svg",
  linear: "/logos/linear.svg",

  // AI / LLM providers
  claude: "/logos/claude.svg",
  anthropic: "/logos/anthropic.svg",
  "claude-code": "/logos/claude-code.svg",
  openai: "/logos/openai.svg",
  openrouter: "/logos/openrouter.svg",
  copilot: "/logos/copilot.svg",

  // Tool account aliases (backend uses underscores which normalize to hyphens)
  "github-copilot": "/logos/copilot.svg",
  "github_copilot": "/logos/copilot.svg",
  gemini: "/logos/google.svg",
  "anthropic-api": "/logos/anthropic.svg",
  "openai-api": "/logos/openai.svg",
  "openrouter-api": "/logos/openrouter.svg",
  "gemini-api": "/logos/google.svg",

  // Editors / IDEs
  cursor: "/logos/cursor.svg",
  windsurf: "/logos/windsurf.svg",
  aider: "/logos/aider.svg",
  continue: "/logos/continue.svg",
  cody: "/logos/cody.svg",
  tabnine: "/logos/tabnine.svg",
  "amazon-q": "/logos/amazon-q.svg",
  custom: "/logos/custom.svg",

  // Design
  figma: "/logos/figma.svg",

  // Auth / Identity
  google: "/logos/google.svg",

  // Communication
  slack: "/logos/slack.svg",
};

// Background colors for provider icons
const providerColors: Record<string, string> = {
  github: "bg-[#24292f]",
  gitlab: "bg-[#fc6d26]",
  bitbucket: "bg-[#0052cc]",
  jira: "bg-[#0052cc]",
  linear: "bg-[#5e6ad2]",
  claude: "bg-[#d97757]",
  anthropic: "bg-[#d97757]",
  "claude-code": "bg-[#1a1a1a]",
  openai: "bg-[#10a37f]",
  openrouter: "bg-[#6366f1]",
  copilot: "bg-[#000000]",
  "github-copilot": "bg-[#24292f]",
  "github_copilot": "bg-[#24292f]",
  gemini: "bg-[#4285f4]",
  "anthropic-api": "bg-[#d97757]",
  "openai-api": "bg-[#10a37f]",
  "openrouter-api": "bg-[#6366f1]",
  "gemini-api": "bg-[#4285f4]",
  cursor: "bg-[#000000]",
  windsurf: "bg-[#0ea5e9]",
  aider: "bg-[#7c3aed]",
  continue: "bg-[#1e1e2e]",
  cody: "bg-[#a305f1]",
  tabnine: "bg-[#6b4ef6]",
  "amazon-q": "bg-[#232f3e]",
  custom: "bg-[#6b7280]",
  figma: "bg-gradient-to-br from-[#f24e1e] via-[#a259ff] to-[#1abcfe]",
  google: "bg-white",
  slack: "bg-[#4a154b]",
};

interface ProviderLogoProps {
  provider: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showBackground?: boolean;
  fallback?: React.ReactNode;
}

export function ProviderLogo({
  provider,
  className,
  size = "md",
  showBackground = false,
  fallback,
}: ProviderLogoProps) {
  const normalizedProvider = provider.toLowerCase().replace(/[\s_]+/g, "-");
  const logoPath = logoMap[normalizedProvider];

  const sizeClasses = {
    sm: "size-4",
    md: "size-6",
    lg: "size-8",
  };

  const containerSizeClasses = {
    sm: "size-6",
    md: "size-10",
    lg: "size-12",
  };

  if (!logoPath) {
    if (fallback) return <>{fallback}</>;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg bg-muted font-medium uppercase",
          showBackground ? containerSizeClasses[size] : sizeClasses[size],
          className
        )}
      >
        {provider.charAt(0)}
      </span>
    );
  }

  const logoElement = (
    <img
      src={logoPath}
      alt={`${provider} logo`}
      className={cn("shrink-0 object-contain", sizeClasses[size], !showBackground && className)}
    />
  );

  if (showBackground) {
    const bgColor = providerColors[normalizedProvider] || "bg-muted";
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg text-white",
          containerSizeClasses[size],
          bgColor,
          className
        )}
      >
        {logoElement}
      </div>
    );
  }

  return logoElement;
}

// eslint-disable-next-line react-refresh/only-export-components
export { logoMap, providerColors };
