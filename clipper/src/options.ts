import { startLanguage, t, type Catalog, type CatalogLoaders } from "@scholarkit/i18n";
import { DEFAULT_ORIGIN, LS, setJSON, getJSON } from "./shared";

/**
 * The options page: the address of the Scholarkit server the clips go to.
 * Another address than the default needs its own permission, which is asked
 * for here, and a content script registered for its /binder pages.
 */

const files = import.meta.glob<{ default: Catalog }>("../../src/locales/*.json");
const catalogs: CatalogLoaders = Object.fromEntries(
  Object.entries(files)
    .map(([path, load]) => [/([\w-]+)\.json$/.exec(path)?.[1] ?? "", load] as const)
    .filter(([code]) => code !== "" && code !== "en"),
);
await startLanguage({ loaders: catalogs, dev: false });

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");
const originInput = $<HTMLInputElement>("origin");

const say = (text: string, error = false) => {
  status.textContent = text;
  status.className = error ? "error" : "";
};

async function registerContentScript(origin: string) {
  const registration = {
    id: "binder-web",
    matches: [`${origin}/binder/*`],
    js: ["content.js"],
    runAt: "document_idle" as const,
    persistAcrossSessions: true,
  };
  try {
    await chrome.scripting.registerContentScripts([registration]);
  } catch {
    await chrome.scripting
      .unregisterContentScripts({ ids: ["binder-web"] })
      .catch(() => {});
    await chrome.scripting.registerContentScripts([registration]);
  }
}

async function main() {
  $("title").textContent = t("Binder Clipper settings");
  $("origin-label").textContent = t("Scholarkit server");
  $("save").textContent = t("Save");
  $("note").textContent = t(
    "Clips go to the Binder web app of this server. For a server of your own, its address, such as https://scholarkit.example.com.",
  );
  originInput.value = await getJSON(LS.origin, DEFAULT_ORIGIN);

  $("save").addEventListener("click", () => {
    let url: URL;
    try {
      url = new URL(originInput.value.trim());
    } catch {
      say(t("That isn't an address."), true);
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      say(t("That isn't an address."), true);
      return;
    }
    const origin = url.origin;
    void (async () => {
      if (origin !== DEFAULT_ORIGIN) {
        const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
        if (!granted) {
          say(
            t("The permission wasn't given, so clips can't reach that server."),
            true,
          );
          return;
        }
        await registerContentScript(origin);
      } else {
        await chrome.scripting
          .unregisterContentScripts({ ids: ["binder-web"] })
          .catch(() => {});
      }
      await setJSON(LS.origin, origin);
      say(t("Saved."));
    })();
  });
}

void main();
