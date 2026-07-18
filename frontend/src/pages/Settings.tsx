import PwaSettings from "../components/PwaSettings";
import { page, pageTitle } from "../components/ui";

export default function Settings() {
  return (
    <div className={page}>
      <h1 className={pageTitle}>Settings</h1>
      <PwaSettings />
    </div>
  );
}
