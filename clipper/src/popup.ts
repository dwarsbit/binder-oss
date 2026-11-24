import { startLanguage, t, type Catalog, type CatalogLoaders } from "@scholarkit/i18n";
import type { Mode, ToBg } from "./shared";

/**
 * The toolbar popup: pick the binder clips go to, save the page or the
 * selection, and switch highlight mode on for the page.
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
const binderSelect = $<HTMLSelectElement>("binder");

const say = (text: string, error = false) => {
  status.textContent = text;
  status.className = error ? "error" : "";
};

function send<M extends ToBg>(message: M): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

async function refreshBinders(selected: string | null) {
  binderSelect.textContent = "";
  const empty = document.createElement("option");
  empty.value = "";
  binderSelect.append(empty);
  const result = (await send({ type: "binders" })) as
    | { ok: true; projects: Array<{ id: string; name: string }> }
    | { ok: false; error: string };
  if (!result.ok) {
    empty.textContent = t("Can't reach the server.");
    say(t("Sign in on the server first."), true);
    return;
  }
  for (const project of result.projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    binderSelect.append(option);
  }
  empty.textContent = result.projects.length
    ? t("Choose a binder")
    : t("No binders yet. Make one in Binder.");
  if (selected && result.projects.some((p) => p.id === selected)) {
    binderSelect.value = selected;
  }
}

async function main() {
  $("binder-label").textContent = t("Save to binder");
  $("save-page").textContent = t("Save page");
  $("save-selection").textContent = t("Save selection");
  $("highlight-mode-label").textContent = t("Highlight on this page");
  $("options-link").textContent = t("Clipper settings");

  const state = (await send({ type: "state" })) as {
    binder: string | null;
    highlightMode: boolean;
  };
  await refreshBinders(state.binder);
  $<HTMLInputElement>("highlight-mode").checked = state.highlightMode;

  binderSelect.addEventListener("change", () => {
    void send({ type: "set-binder", id: binderSelect.value });
    say("");
  });
  $("highlight-mode").addEventListener("change", (event) => {
    void send({
      type: "highlight-mode",
      on: (event.target as HTMLInputElement).checked,
    });
  });
  for (const [id, mode] of [
    ["save-page", "page"],
    ["save-selection", "selection"],
  ] as Array<[string, Mode]>) {
    $(id).addEventListener("click", () => {
      say(t("Saving…"));
      void send({ type: "save", mode }).then((result) => {
        const answer = result as { ok: boolean; error?: string } | undefined;
        if (answer?.ok) {
          say(t("Saved. It appears in the binder in a moment."));
        } else if (answer?.error === "pick") {
          say(t("Choose a binder first."), true);
        } else if (answer?.error === "page") {
          say(t("This page can't be clipped."), true);
        } else {
          say(t("Reload the page and try again."), true);
        }
      });
    });
  }
  $("options-link").addEventListener("click", (event) => {
    event.preventDefault();
    void chrome.runtime.openOptionsPage();
  });
}

void main();
