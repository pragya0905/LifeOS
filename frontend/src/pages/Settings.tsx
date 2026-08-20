import DataExport from "../components/DataExport";
import DeleteAccount from "../components/DeleteAccount";
import Profile from "../components/Profile";
import PwaSettings from "../components/PwaSettings";
import ThemeToggle from "../components/ThemeToggle";
import { page, pageTitle, sectionLabel } from "../components/ui";

export default function Settings() {
  return (
    <div className={page}>
      <h1 className={pageTitle}>Settings</h1>

      <p className={`mb-2 ${sectionLabel}`}>Preferences</p>
      <div className="mb-8 flex flex-col gap-6">
        <Profile />
        <ThemeToggle />
        <PwaSettings />
      </div>

      <p className={`mb-2 ${sectionLabel}`}>Data</p>
      <div className="mb-8 flex flex-col gap-6">
        <DataExport />
      </div>

      <p className={`mb-2 ${sectionLabel}`}>Account</p>
      <div className="flex flex-col gap-6">
        <DeleteAccount />
      </div>
    </div>
  );
}
