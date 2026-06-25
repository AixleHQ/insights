import * as React from "react"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export interface SearchBarProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  shortcutHint?: string
  className?: string
}

function SearchBar({
  placeholder = "Search...",
  value,
  onChange,
  shortcutHint,
  className,
}: SearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      onChange("")
      inputRef.current?.blur()
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn("pl-8", value ? "pr-8" : shortcutHint ? "sm:pr-14" : "")}
      />
      {value ? (
        <button
          type="button"
          onClick={() => { onChange(""); inputRef.current?.focus() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : shortcutHint ? (
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground select-none">
          {shortcutHint}
        </kbd>
      ) : null}
    </div>
  )
}

export { SearchBar }
