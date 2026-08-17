import DataExport from "../components/DataExport";
import PwaSettings from "../components/PwaSettings";
import { page, pageTitle } from "../components/ui";

export default function Settings() {
  return (
    <div className={page}>
      <h1 className={pageTitle}>Settings</h1>
      <div className="flex flex-col gap-6">
        <PwaSettings />
        <DataExport />
      </div>
    </div>
  );
}
