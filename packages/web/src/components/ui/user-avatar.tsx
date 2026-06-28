import { cn } from "@/lib/utils";

function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

interface UserAvatarProps {
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
  suggested?: boolean;
  showName?: boolean;
  size?: "sm" | "md";
}

export function UserAvatar({
  name,
  email,
  avatarUrl,
  suggested = false,
  showName = true,
  size = "sm",
}: UserAvatarProps) {
  const sizeClass = size === "sm" ? "text-[10px]" : "text-xs";
  const sizePx = size === "sm" ? 24 : 32;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name || email}
          width={sizePx}
          height={sizePx}
          className={cn("rounded-full object-cover shrink-0", suggested && "opacity-60")}
          style={{ width: sizePx, height: sizePx }}
        />
      ) : (
        <div
          className={cn(
            "rounded-full flex items-center justify-center font-semibold shrink-0",
            sizeClass,
            suggested
              ? "border border-dashed border-muted-foreground text-muted-foreground"
              : "bg-primary/10 text-primary"
          )}
          style={{ width: sizePx, height: sizePx }}
        >
          {getInitials(name, email)}
        </div>
      )}
      {showName && (
        <span className={cn("text-sm", suggested && "text-muted-foreground")}>
          {name || email}
        </span>
      )}
    </div>
  );
}
