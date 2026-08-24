import { APP_NAME } from "@/lib/branding";
import { SettingsView } from "./SettingsView";
import pkg from "../../../package.json";

// Not AppShell: settings needs neither the project rail nor the "new project"
// button, and pretending it is a thread would give it a project title it has
// no project for.
export const dynamic = "force-dynamic";

export const metadata = { title: `Settings — ${APP_NAME}` };

export default function SettingsPage() {
  return <SettingsView version={pkg.version} />;
}
