import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Home,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  Moon,
  NotebookPen,
  Pill,
  Plus,
  Receipt,
  ScrollText,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import type { UserProfile } from "../types";
import OnlineStatusBadge from "./OnlineStatusBadge";
import { Icon } from "./Icon";
import { BottomSheet } from "./BottomSheet";
import { QuickAddSheet, type QuickAddTarget } from "./QuickAddSheet";
import { CommandPalette } from "./CommandPalette";

const TABS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/dashboard", label: "Today", icon: Home },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/routines", label: "Routines", icon: ListChecks },
  { to: "/assistant", label: "Assistant", icon: MessageCircle },
];

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  links: NavItem[];
}

// Browse: things you look back through. Track: numeric/health logs with their own trend
// views. You: account-level pages. (Journal/Wishes dropped off the primary tab row in
// Phase 2 — their single most common action now lives in the global quick-add sheet.)
const MORE_GROUPS: NavGroup[] = [
  {
    label: "Browse",
    links: [
      { to: "/journal", label: "Journal", icon: NotebookPen },
      { to: "/wishes", label: "Wishes", icon: Target },
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/logs", label: "Logs", icon: ScrollText },
      { to: "/meal-plan", label: "Meal Plan", icon: UtensilsCrossed },
    ],
  },
  {
    label: "Track",
    links: [
      { to: "/medications", label: "Medications", icon: Pill },
      { to: "/budget", label: "Budget", icon: Receipt },
      { to: "/cycle", label: "Cycle", icon: Moon },
      { to: "/insights", label: "Insights", icon: TrendingUp },
    ],
  },
  {
    label: "You",
    links: [
      { to: "/settings", label: "Settings", icon: SettingsIcon },
      { to: "/help", label: "Help", icon: HelpCircle },
    ],
  },
];

const MORE_ROUTES = MORE_GROUPS.flatMap((g) => g.links.map((l) => l.to));

const SIDEBAR_COLLAPSED_KEY = "lifeos_sidebar_collapsed";

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const { request } = useApi();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTarget, setQuickAddTarget] = useState<QuickAddTarget | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hideCycle, setHideCycle] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed);
  const moreActive = MORE_ROUTES.some((r) => location.pathname.startsWith(r));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // best-effort
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let ignore = false;
    request<UserProfile>("/profile")
      .then((profile) => {
        if (!ignore) setHideCycle(profile.sex === "male");
      })
      .catch(() => {
        // Nav just shows Cycle by default if this fails — not critical to render.
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moreGroups = hideCycle
    ? MORE_GROUPS.map((group) => ({
        ...group,
        links: group.links.filter((l) => l.to !== "/cycle"),
      }))
    : MORE_GROUPS;

  function openQuickAdd(target?: QuickAddTarget) {
    setQuickAddTarget(target);
    setQuickAddOpen(true);
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-ink-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-bloom focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-paper-card"
      >
        Skip to main content
      </a>

      {/* Mobile header — hidden at md+, where the sidebar carries branding instead */}
      <header className="sticky top-0 z-30 border-b border-stone bg-paper/90 backdrop-blur dark:border-stone-dark dark:bg-ink-bg/90 md:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <span className="font-display text-lg font-semibold tracking-tight text-ink dark:text-paper">
            LifeOs
          </span>
          <div className="flex items-center gap-2.5">
            <OnlineStatusBadge />
            <span className="hidden text-xs text-ink-muted dark:text-mist-muted sm:inline">
              {user?.email}
            </span>
          </div>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-stone bg-paper-card dark:border-stone-dark dark:bg-ink-bg-card md:flex ${
          sidebarCollapsed ? "w-[4.5rem]" : "w-56"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-stone px-4 py-4 dark:border-stone-dark">
          {!sidebarCollapsed && (
            <span className="font-display text-lg font-semibold tracking-tight text-ink dark:text-paper">
              LifeOs
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
          >
            <Icon icon={sidebarCollapsed ? ChevronRight : ChevronLeft} size={16} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Primary">
          {TABS.map(({ to, label, icon }) => (
            <SidebarLink key={to} to={to} label={label} icon={icon} collapsed={sidebarCollapsed} />
          ))}
          <button
            type="button"
            onClick={() => openQuickAdd()}
            className={`mt-1 flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium text-paper-card transition-colors hover:bg-bloom-light ${
              sidebarCollapsed ? "justify-center" : ""
            } bg-bloom`}
          >
            <Icon icon={Plus} size={18} />
            {!sidebarCollapsed && "Quick add"}
          </button>

          {moreGroups.map((group) => (
            <div key={group.label} className="mt-4">
              {!sidebarCollapsed && (
                <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted dark:text-mist-muted">
                  {group.label}
                </p>
              )}
              {group.links.map(({ to, label, icon }) => (
                <SidebarLink key={to} to={to} label={label} icon={icon} collapsed={sidebarCollapsed} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-stone p-3 dark:border-stone-dark">
          {!sidebarCollapsed && (
            <p className="mb-2 truncate px-1 text-xs text-ink-muted dark:text-mist-muted">{user?.email}</p>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className={`flex min-h-10 w-full items-center gap-2 rounded-control px-3 text-sm font-medium text-alert transition-colors hover:bg-alert-soft dark:hover:bg-alert-soft-dark ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            {!sidebarCollapsed && "Log out"}
            {sidebarCollapsed && "Out"}
          </button>
        </div>
      </aside>

      <main
        id="main-content"
        className={`pb-24 md:pb-8 ${sidebarCollapsed ? "md:pl-[4.5rem]" : "md:pl-56"}`}
      >
        <Outlet />
      </main>

      {/* Mobile bottom tab bar — hidden at md+, where the sidebar is the primary nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone bg-paper-card/95 backdrop-blur md:hidden dark:border-stone-dark dark:bg-ink-bg-card/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-1">
          {TABS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  isActive ? "text-bloom" : "text-ink-muted dark:text-mist-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon icon={icon} size={21} strokeWidth={isActive ? 2.2 : 1.7} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
              moreActive || moreOpen ? "text-bloom" : "text-ink-muted dark:text-mist-muted"
            }`}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <Icon icon={LayoutGrid} size={21} strokeWidth={moreActive || moreOpen ? 2.2 : 1.7} />
            More
          </button>
        </div>
      </nav>

      {/* Global quick-add FAB — every authenticated mobile screen, floating above the tab
          bar, bottom-right, clear of the tab bar's own hit area and safe-area aware. Hidden
          at md+, where the sidebar's "Quick add" row and Cmd+K cover the same actions. */}
      <button
        type="button"
        onClick={() => openQuickAdd()}
        aria-label="Quick add"
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-bloom text-paper-card shadow-raised transition-colors hover:bg-bloom-light md:hidden dark:shadow-raised-dark"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)" }}
      >
        <Icon icon={Plus} size={26} />
      </button>

      {/* More sheet */}
      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)}>
        <span className="mb-4 block text-sm text-ink-muted dark:text-mist-muted">{user?.email}</span>
        <div className="max-h-[60vh] overflow-y-auto">
          {moreGroups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted dark:text-mist-muted">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "border-bloom bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light"
                          : "border-stone text-ink hover:bg-stone/40 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40"
                      }`
                    }
                  >
                    <Icon icon={link.icon} size={16} />
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-4 w-full rounded-xl border border-stone px-3.5 py-2.5 text-left text-sm font-medium text-alert transition-colors hover:bg-alert-soft dark:border-stone-dark dark:hover:bg-alert-soft-dark"
        >
          Log out
        </button>
      </BottomSheet>

      <QuickAddSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialTarget={quickAddTarget}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onQuickAdd={openQuickAdd}
        hideCycle={hideCycle}
      />
    </div>
  );
}

function SidebarLink({
  to,
  label,
  icon,
  collapsed,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors ${
          collapsed ? "justify-center" : ""
        } ${
          isActive
            ? "bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light"
            : "text-ink-muted hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
        }`
      }
    >
      <Icon icon={icon} size={18} />
      {!collapsed && label}
    </NavLink>
  );
}
