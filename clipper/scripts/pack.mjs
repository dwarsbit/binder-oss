// Writes the clipper's manifests after the vite builds: dist-clipper for
// Chrome and Edge (a service worker), dist-clipper-firefox for Firefox (a
// background script, and the settings Gecko asks for). The version comes
// from the app's package.json, so it never drifts.
//
//   node clipper/scripts/pack.mjs
//
// Load dist-clipper unpacked in Chrome or Edge, dist-clipper-firefox as a
// temporary add-on in Firefox (about:debugging).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../../dist-clipper", import.meta.url));
const firefox = fileURLToPath(new URL("../../dist-clipper-firefox", import.meta.url));
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

const shared = {
  manifest_version: 3,
  name: "Binder Clipper",
  description: "Save pages and highlights from the web to your Binder.",
  version,
  permissions: ["storage", "scripting", "activeTab", "contextMenus"],
  host_permissions: ["https://app.scholarkit.app/*"],
  optional_host_permissions: [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
  ],
  action: { default_popup: "popup.html", default_title: "Binder Clipper" },
  options_page: "options.html",
  content_scripts: [
    {
      matches: ["https://app.scholarkit.app/binder/*"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
};

writeFileSync(
  `${out}/manifest.json`,
  `${JSON.stringify(
    {
      ...shared,
      background: { service_worker: "background.js" },
    },
    null,
    2,
  )}\n`,
);

rmSync(firefox, { recursive: true, force: true });
mkdirSync(firefox, { recursive: true });
cpSync(out, firefox, { recursive: true });
writeFileSync(
  `${firefox}/manifest.json`,
  `${JSON.stringify(
    {
      ...shared,
      background: { scripts: ["background.js"] },
      browser_specific_settings: {
        gecko: { id: "clipper@scholarkit.app", strict_min_version: "128.0" },
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Clipper ${version} packed: ${out} (Chrome), ${firefox} (Firefox)`);
