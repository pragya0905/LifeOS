import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { secondaryButton } from "./ui";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${
    isActive
      ? "text-sage"
      : "text-ink-muted hover:text-ink dark:text-fog-muted dark:hover:text-cream"
  }`;

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal">
      <header className="border-b border-stone dark:border-stone-dark">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="font-display mr-1 text-lg font-medium text-ink dark:text-cream">
              LifeOs
            </span>
            <NavLink to="/dashboard" className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/tasks" className={linkClass}>
              Tasks
            </NavLink>
            <NavLink to="/journal" className={linkClass}>
              Journal
            </NavLink>
            <NavLink to="/medications" className={linkClass}>
              Medications
            </NavLink>
            <NavLink to="/logs" className={linkClass}>
              Logs
            </NavLink>
            <NavLink to="/cycle" className={linkClass}>
              Cycle
            </NavLink>
            <NavLink to="/routines" className={linkClass}>
              Routines
            </NavLink>
            <NavLink to="/insights" className={linkClass}>
              Insights
            </NavLink>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted dark:text-fog-muted">{user?.email}</span>
            <button onClick={() => signOut()} className={secondaryButton}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
