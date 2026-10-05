import type { UserRole } from "@/backend";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { roleLabel } from "@/lib/status";
import { deactivateTestSignIn } from "@/lib/testIdentity";
import { cn } from "@/lib/utils";
import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  ChevronDown,
  Clapperboard,
  FlaskConical,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  UserRound,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Live Production Feed", icon: Activity },
  { to: "/simulation", label: "Simulation Inspector", icon: FlaskConical },
  { to: "/videos", label: "Generated Videos", icon: Clapperboard },
  {
    to: "/optimization",
    label: "Optimization Gate",
    icon: ShieldCheck,
    adminOnly: true,
  },
  { to: "/costs", label: "Cost & Token Tracker", icon: Gauge },
  { to: "/create", label: "Character Creation", icon: UserPlus },
  { to: "/dna", label: "DNA Registry", icon: SlidersHorizontal },
  { to: "/lore", label: "World Lore", icon: ScrollText },
  { to: "/assets", label: "Assets", icon: Boxes },
  {
    to: "/settings/video",
    label: "Video Settings",
    icon: KeyRound,
    adminOnly: true,
  },
];

export interface LayoutProps {
  userRole: UserRole;
  isAdmin: boolean;
}

function NavLinks({
  onNavigate,
  isAdmin,
}: {
  onNavigate?: () => void;
  isAdmin: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const active =
          item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            data-ocid={`nav.${item.to === "/" ? "feed" : item.to.slice(1)}.link`}
            className={cn(
              "group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.adminOnly ? (
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Admin
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Layout({ userRole, isAdmin }: LayoutProps) {
  const { identity, clear } = useInternetIdentity();
  const queryClient = useQueryClient();

  const principal = identity?.getPrincipal().toString() ?? "";
  const shortPrincipal = principal
    ? `${principal.slice(0, 5)}…${principal.slice(-3)}`
    : "unknown";

  const handleSignOut = () => {
    // Clear the persisted test-only activation first so a tester who signed in
    // via the test path returns to the real sign-in gate. No-op when the flag
    // is off, so the production sign-out flow is unchanged.
    deactivateTestSignIn();
    clear();
    queryClient.clear();
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card shadow-panel">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                data-ocid="nav.open_modal_button"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-card p-4">
              <div className="mb-6 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                  <Activity className="size-4" />
                </span>
                <span className="font-display text-sm font-semibold tracking-tight">
                  Project Omnish
                </span>
              </div>
              <NavLinks isAdmin={isAdmin} />
            </SheetContent>
          </Sheet>

          <Link
            to="/"
            className="flex items-center gap-2.5"
            data-ocid="nav.home.link"
          >
            <span className="flex size-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
              <Activity className="size-4" />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block font-display text-sm font-semibold tracking-tight text-foreground">
                Project Omnish
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Control Room
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-2 md:flex">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-status-running animate-live-blink"
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Systems nominal
              </span>
            </span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-md"
                  data-ocid="auth.open_modal_button"
                >
                  <UserRound className="size-4" />
                  <span className="hidden font-mono text-xs sm:inline">
                    {shortPrincipal}
                  </span>
                  <ChevronDown className="size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{shortPrincipal}</span>
                  <StatusBadge
                    label={roleLabel(userRole)}
                    tone={isAdmin ? "running" : "queued"}
                  />
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleSignOut}
                  data-ocid="auth.sign_out_button"
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar p-4 lg:block">
          <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Workspace
          </p>
          <NavLinks isAdmin={isAdmin} />
        </aside>

        <main className="min-w-0 flex-1 bg-background">
          <Outlet />
        </main>
      </div>

      <footer className="border-t border-border bg-card px-4 py-3 lg:px-6">
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          © {new Date().getFullYear()}. Built with love using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
