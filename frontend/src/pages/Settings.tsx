import DataExport from "../components/DataExport";
import DeleteAccount from "../components/DeleteAccount";
import Profile from "../components/Profile";
import PwaSettings from "../components/PwaSettings";
import ThemeToggle from "../components/ThemeToggle";
import { page, pageTitle } from "../components/ui";

export default function Settings() {
  return (
    <div className={page}>
      <h1 className={pageTitle}>Settings</h1>
      <div className="flex flex-col gap-6">
        <Profile />
        <ThemeToggle />
        <PwaSettings />
        <DataExport />
        <DeleteAccount />
      </div>
    </div>
  );
}
