import Link from "next/link";
import { RecoveryScreen, recoveryPrimary } from "@/components/RecoveryScreen";
import { APP_NAME } from "@/lib/branding";

/* Every notFound() — a deleted project or chat — and every unmatched URL.
 *
 * The framework's default 404 has no links, and the installed app has no Back
 * button, so it was a dead end. The likeliest way in is a notification for a
 * chat deleted since it fired: LaunchNormalizer deliberately leaves those
 * launches (`?n=1`) alone. `/` is Home. */
export default function NotFound() {
  return (
    <RecoveryScreen
      title="This page isn’t here"
      body="The project or chat may have been deleted, or the link is out of date."
      actions={
        <Link href="/" className={recoveryPrimary}>
          Back to {APP_NAME}
        </Link>
      }
    />
  );
}
