import { isDesktop } from "@scholarkit/editor/lib/platform";
import { desktopUpdater } from "@scholarkit/updates/tauri";

/** The desktop app's updater: checks for a new version and installs it. Null in the browser. */
export const updater = isDesktop ? desktopUpdater() : null;

/** Where a new version can be downloaded by hand, when it couldn't be installed. */
export const DOWNLOAD_URL = "https://scholarkit.app/binder";
