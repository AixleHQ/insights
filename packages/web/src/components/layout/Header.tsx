import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Search, Command, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Breadcrumbs } from './Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command as CommandPrimitive,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

// Mock notifications for UI demonstration
const mockNotifications = [
  {
    id: '1',
    title: 'Cost threshold exceeded',
    description: 'API costs exceeded $500 this month',
    time: '5m ago',
    read: false,
    type: 'alert',
  },
  {
    id: '2',
    title: 'New team member',
    description: 'John joined your organization',
    time: '1h ago',
    read: false,
    type: 'info',
  },
  {
    id: '3',
    title: 'Sync completed',
    description: 'GitHub connector synced 45 repositories',
    time: '2h ago',
    read: true,
    type: 'success',
  },
];

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Search or run commands</DialogDescription>
        </DialogHeader>
        <CommandPrimitive className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:size-5">
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Quick Actions">
              <CommandItem>
                <Search className="mr-2 size-4" />
                <span>Search events...</span>
              </CommandItem>
              <CommandItem>
                <span className="mr-2">+</span>
                <span>New project</span>
              </CommandItem>
              <CommandItem>
                <span className="mr-2">+</span>
                <span>Add connector</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              <CommandItem>Dashboard</CommandItem>
              <CommandItem>Events</CommandItem>
              <CommandItem>Projects</CommandItem>
              <CommandItem>Connectors</CommandItem>
              <CommandItem>Team</CommandItem>
              <CommandItem>Settings</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function Notifications() {
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8">
          <Bell className="size-4" />
          <NotificationBadge count={unreadCount} />
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {unreadCount} new
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {mockNotifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          mockNotifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex cursor-pointer flex-col items-start gap-1 p-3"
            >
              <div className="flex w-full items-start justify-between gap-2">
                <span
                  className={`text-sm font-medium ${
                    !notification.read ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {notification.title}
                </span>
                {!notification.read && (
                  <div className="size-2 rounded-full bg-primary" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {notification.description}
              </span>
              <span className="text-xs text-muted-foreground/60">
                {notification.time}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center">
          <Link to="/notifications" className="w-full text-center text-sm">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} className="size-8">
      {theme === 'light' ? (
        <Moon className="size-4" />
      ) : (
        <Sun className="size-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export function Header() {
  const [commandOpen, setCommandOpen] = useState(false);

  // Keyboard shortcut for command palette
  useState(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  });

  return (
    <>
      <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 md:px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4 hidden md:block" />

        <div className="hidden md:block">
          <Breadcrumbs />
        </div>

        <div className="ml-auto flex items-center gap-1 md:gap-2">
          <Button
            variant="outline"
            className="relative h-8 w-8 md:w-64 lg:w-80 justify-center md:justify-start rounded-md bg-muted/50 text-sm font-normal text-muted-foreground shadow-none"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="size-4 md:mr-2" />
            <span className="hidden md:inline-flex">Search...</span>
            <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 lg:flex">
              <span className="text-xs">
                <Command className="size-3" />
              </span>
              K
            </kbd>
          </Button>

          <ThemeToggle />
          <Notifications />
        </div>
      </header>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
