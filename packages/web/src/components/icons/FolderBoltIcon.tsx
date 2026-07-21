import { type SVGProps } from "react";
import { cn } from "@/lib/utils";

export function FolderBoltIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide", className)}
      aria-hidden="true"
      {...props}
    >
      <path d="M13 19h-8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v3.5" />
      <path d="M19 16l-2 3h4l-2 3" />
    </svg>
  );
}
