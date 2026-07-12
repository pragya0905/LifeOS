import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${
    isActive
      ? "text-indigo-600"
      : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
  }`;

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-700">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-6">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
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
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
