import {
  clipPayload,
  type ClipPayload,
  type ClipHighlight,
} from "@scholarkit/contracts";
import { startLanguage, t, type CatalogLoaders } from "@scholarkit/i18n";
import de from "../../src/locales/de.json";
import es from "../../src/locales/es.json";
import fr from "../../src/locales/fr.json";
import nl from "../../src/locales/nl.json";
import {
  binderOf,
  DEFAULT_ORIGIN,
  getJSON,
  hlKey,
  LS,
  newHighlightId,
  oneLine,
  setJSON,
  type BgMessage,
  type Captured,
  type CategoryLabel,
  type Mode,
  type ToBg,
} from "./shared";

/**
 * The background worker: the context menus and the popup's Save buttons, the
 * capture of a tab, and the delivery of clips to a Binder web tab, opening
 * one at /binder/<id> when none is open. Clips wait in storage until the tab
 * says it is ready.
 *
 * This file is built as a classic script, so it runs as Chrome's service
 * worker and as Firefox's background script alike: no top-level await, and
 * the catalogs are static imports rather than import.meta.glob.
 */

// The extension's own text, in the languages the app ships.
const catalogs: CatalogLoaders = {
  de: async () => ({ default: de }),
  es: async () => ({ default: es }),
  fr: async () => ({ default: fr }),
  nl: async () => ({ default: nl }),
};
const languageReady = startLanguage({ loaders: catalogs, dev: false });

/** The highlight categories, with the labels the app's catalogs give them. */
const categoryLabels = (): CategoryLabel[] =>
  (
    [
      ["claim", "Claim"],
      ["definition", "Definition"],
      ["method", "Method"],
      ["finding", "Finding"],
      ["quote", "Quote"],
    ] as const
  ).map(([id, label]) => ({ id, label: t(label) }));

chrome.runtime.onInstalled.addListener(() => {
  void languageReady.then(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "save-page",
        title: t("Save page to Binder"),
        contexts: ["page"],
      });
      chrome.contextMenus.create({
        id: "save-selection",
        title: t("Save selection to Binder"),
        contexts: ["selection"],
      });
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  void save(info.menuItemId === "save-selection" ? "selection" : "page", tab.id).then(
    (result) => result,
    () => {},
  );
});

chrome.runtime.onMessage.addListener((message: ToBg, sender, sendResponse) => {
  switch (message.type) {
    case "ready":
      void flushToTab(sender.tab?.id, sender.tab?.url ?? message.url);
      return;
    case "app-done": {
      void removeDone(message.binder, message.url);
      return;
    }
    case "config":
      void languageReady.then(() => sendResponse({ categories: categoryLabels() }));
      return true;
    case "save":
      void save(message.mode).then(sendResponse);
      return true;
    case "binders":
      void listBinders().then(sendResponse);
      return true;
    case "set-binder":
      void setJSON(LS.binder, message.id).then(() => sendResponse({ ok: true }));
      return true;
    case "highlight-mode":
      void setJSON(LS.highlightMode, message.on).then(async () => {
        const tab = await activeTab();
        if (tab?.id) {
          void chrome.tabs
            .sendMessage(tab.id, {
              from: "binder-clipper",
              type: "highlight-mode",
              on: message.on,
            } satisfies BgMessage)
            .catch(() => {});
        }
        sendResponse({ ok: true });
      });
      return true;
    case "state":
      void (async () => {
        sendResponse({
          origin: await getJSON(LS.origin, DEFAULT_ORIGIN),
          binder: await getJSON<string | null>(LS.binder, null),
          highlightMode: await getJSON(LS.highlightMode, false),
        });
      })();
      return true;
  }
});

/** The tab of the window the user is in, where the popup isn't. */
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

/** The account's binders the user can write to, from the server. */
async function listBinders() {
  const origin = await getJSON(LS.origin, DEFAULT_ORIGIN);
  try {
    const response = await fetch(`${origin}/api/projects?app=binder`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as {
      projects: Array<{ id: string; name: string; writable: boolean }>;
    };
    return { ok: true as const, projects: data.projects.filter((p) => p.writable) };
  } catch (error) {
    return { ok: false as const, error: String(error) };
  }
}

/** Asks a tab's content script for the page, injecting it first when it isn't there. */
async function captureFrom(tabId: number, mode: Mode): Promise<Captured | null> {
  const send = () =>
    chrome.tabs.sendMessage(tabId, {
      from: "binder-clipper",
      type: "capture",
      mode,
    } satisfies BgMessage);
  try {
    return (await send()) as Captured;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      return (await send()) as Captured;
    } catch {
      return null;
    }
  }
}

export interface SaveResult {
  ok: boolean;
  error?: "pick" | "page" | "capture";
}

/** Captures the tab and queues a clip for the chosen binder. */
async function save(mode: Mode, tabId?: number): Promise<SaveResult> {
  const origin = await getJSON(LS.origin, DEFAULT_ORIGIN);
  const binder = await getJSON<string | null>(LS.binder, null);
  if (!binder) {
    // No binder chosen yet: open the popup where the browser allows it, else the binder list.
    try {
      await chrome.action.openPopup();
    } catch {
      await chrome.tabs.create({ url: `${origin}/binder/` });
    }
    return { ok: false, error: "pick" };
  }
  const tab = tabId === undefined ? await activeTab() : await chrome.tabs.get(tabId);
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url))
    return { ok: false, error: "page" };
  const captured = await captureFrom(tab.id, mode);
  if (!captured) return { ok: false, error: "capture" };
  const highlights = await getJSON<ClipHighlight[]>(hlKey(captured.url), []);
  if (mode === "selection" && captured.text?.trim()) {
    const category = (await getJSON(
      LS.lastCategory,
      "quote",
    )) as ClipHighlight["category"];
    highlights.push({
      id: newHighlightId(),
      category,
      text: oneLine(captured.text).slice(0, 2000),
    });
    await setJSON(hlKey(captured.url), highlights.slice(-500));
  }
  // The contract the app validates again on the other side.
  const payload = clipPayload.parse({
    kind: mode,
    url: captured.url,
    title: captured.title.slice(0, 300),
    author: captured.author?.slice(0, 300) || undefined,
    html: captured.html,
    text: mode === "selection" ? captured.text?.slice(0, 20_000) : undefined,
    highlights,
    binder,
    at: new Date().toISOString(),
  });
  const queue = await getJSON<ClipPayload[]>(LS.queue, []);
  queue.push(payload);
  await setJSON(LS.queue, queue.slice(-50));
  await deliver(origin);
  return { ok: true };
}

/** Sends queued clips to their binder's tab, opening one where none is open. */
async function deliver(origin: string) {
  const queue = await getJSON<ClipPayload[]>(LS.queue, []);
  if (!queue.length) return;
  const open = await chrome.tabs.query({ url: `${origin}/binder/*` });
  for (const clip of queue) {
    const target = `${origin}/binder/${clip.binder}`;
    const tab = open.find(
      (entry) => entry.id !== undefined && (entry.url ?? "").startsWith(target),
    );
    if (tab?.id !== undefined) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          from: "binder-clipper",
          type: "clip",
          payload: clip,
        } satisfies BgMessage);
        continue;
      } catch {
        // The tab has no content script: leave the clip for its next load.
      }
    }
    await chrome.tabs.create({ url: target });
  }
}

/** Sends the queued clips whose binder is the one a tab just opened. */
async function flushToTab(tabId: number | undefined, url: string) {
  if (tabId === undefined) return;
  const binder = binderOf(url);
  if (!binder) return;
  const queue = await getJSON<ClipPayload[]>(LS.queue, []);
  for (const clip of queue) {
    if (clip.binder !== binder) continue;
    try {
      await chrome.tabs.sendMessage(tabId, {
        from: "binder-clipper",
        type: "clip",
        payload: clip,
      } satisfies BgMessage);
    } catch {
      // The app isn't up yet: the clip stays queued for the app's ready.
    }
  }
}

/** Takes a clip the app says it saved out of the queue. */
async function removeDone(binder: string, url: string) {
  const queue = await getJSON<ClipPayload[]>(LS.queue, []);
  await setJSON(
    LS.queue,
    queue.filter((clip) => !(clip.binder === binder && clip.url === url)),
  );
}
