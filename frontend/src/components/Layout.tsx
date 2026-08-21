import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useApi } from "../api/useApi";
import { useAuth } from "../auth/AuthContext";
import type { UserProfile } from "../types";
import OnlineStatusBadge from "./OnlineStatusBadge";

const TABS = [
  { to: "/dashboard", label: "Home", icon: IconHome },
  { to: "/tasks", label: "Tasks", icon: IconTasks },
  { to: "/journal", label: "Journal", icon: IconJournal },
  { to: "/wishes", label: "Wishes", icon: IconWishes },
] as const;

const MORE_GROUPS = [
  {
    label: "Track",
    links: [
      { to: "/calendar", label: "Calendar" },
      { to: "/medications", label: "Medications" },
      { to: "/logs", label: "Logs" },
      { to: "/budget", label: "Budget" },
      { to: "/cycle", label: "Cycle" },
      { to: "/routines", label: "Routines" },
      { to: "/insights", label: "Insights" },
    ],
  },
  {
    label: "Account",
    links: [
      { to: "/settings", label: "Settings" },
      { to: "/help", label: "Help" },
    ],
  },
];

const MORE_ROUTES = MORE_GROUPS.flatMap((g) => g.links.map((l) => l.to));

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconTasks({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <path d="M8.5 12.3l2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconJournal({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v13H8.5A2.5 2.5 0 0 1 6 17.5v-13Z"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinejoin="round"
      />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} strokeLinecap="round" />
    </svg>
  );
}
function IconWishes({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19.3s-7-4.35-7-9.55A4.13 4.13 0 0 1 12 7.1a4.13 4.13 0 0 1 7 2.65c0 5.2-7 9.55-7 9.55Z"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.7}
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.14 : 0}
      />
    </svg>
  );
}
function IconMore({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
      <rect x="13" y="13" width="6.5" height="6.5" rx="1.6" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} />
    </svg>
  );
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const { request } = useApi();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [hideCycle, setHideCycle] = useState(false);
  const moreActive = MORE_ROUTES.some((r) => location.pathname.startsWith(r));

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

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

  return (
    <div className="min-h-screen bg-paper dark:bg-ink-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-bloom focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-paper-card"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-stone bg-paper/90 backdrop-blur dark:border-stone-dark dark:bg-ink-bg/90">
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

      <main id="main-content" className="pb-24">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone bg-paper-card/95 backdrop-blur dark:border-stone-dark dark:bg-ink-bg-card/95"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-1">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium transition-colors ${
                  isActive
                    ? "text-bloom"
                    : "text-ink-muted dark:text-mist-muted"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium transition-colors ${
              moreActive || moreOpen ? "text-bloom" : "text-ink-muted dark:text-mist-muted"
            }`}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <IconMore active={moreActive || moreOpen} />
            More
          </button>
        </div>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm dark:bg-ink-bg/70"
          />
          <div className="animate-fade-in-up relative w-full max-w-2xl rounded-t-3xl border border-b-0 border-stone bg-paper-card p-5 pb-8 dark:border-stone-dark dark:bg-ink-bg-card">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone dark:bg-stone-dark" />
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-ink-muted dark:text-mist-muted">{user?.email}</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-stone/40 dark:text-mist-muted dark:hover:bg-stone-dark/40"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
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
                        `rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                          isActive
                            ? "border-bloom bg-bloom-soft text-bloom dark:bg-bloom-soft-dark dark:text-bloom-light"
                            : "border-stone text-ink hover:bg-stone/40 dark:border-stone-dark dark:text-paper dark:hover:bg-stone-dark/40"
                        }`
                      }
                    >
                      {link.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => signOut()}
              className="mt-2 w-full rounded-xl border border-stone px-3.5 py-2.5 text-left text-sm font-medium text-alert transition-colors hover:bg-alert-soft dark:border-stone-dark dark:hover:bg-alert-soft-dark"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
