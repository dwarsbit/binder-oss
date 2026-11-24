import type { ClipHighlight, ClipPayload } from "@scholarkit/contracts";

/**
 * What the clipper's parts share: the storage keys, the messages between the
 * background worker, the content script and the popup, and the address a
 * page's highlights are stored under.
 */

/** Where the Scholarkit server the clips go to runs, unless the user sets another. */
export const DEFAULT_ORIGIN = "https://app.scholarkit.app";

/** Keys in chrome.storage.local. */
export const LS = {
  origin: "origin",
  binder: "binder",
  queue: "queue",
  highlightMode: "highlightMode",
  lastCategory: "lastCategory",
} as const;

/** What the user asked to save: the page, or the selected text. */
export type Mode = "page" | "selection";

/** A message from the background worker to a content script. */
export type BgMessage =
  | { from: "binder-clipper"; type: "clip"; payload: ClipPayload }
  | { from: "binder-clipper"; type: "capture"; mode: Mode }
  | { from: "binder-clipper"; type: "highlight-mode"; on: boolean };

/** A message from a content script or the popup to the background worker. */
export type ToBg =
  | { type: "ready"; url: string }
  | { type: "app-done"; url: string; binder: string }
  | { type: "config" }
  | { type: "save"; mode: Mode }
  | { type: "binders" }
  | { type: "set-binder"; id: string }
  | { type: "highlight-mode"; on: boolean }
  | { type: "state" };

/** What a content script sends back on a capture request. */
export interface Captured {
  url: string;
  title: string;
  author?: string;
  html?: string;
  text?: string;
}

/** A highlight category with its label, as the toolbar shows it. */
export interface CategoryLabel {
  id: string;
  label: string;
}

/**
 * The binder id in a /binder/projects/<id> address, or null. /binder/<id>, the address from
 * before the move, still counts: a server that hasn't moved yet uses it.
 */
export function binderOf(url: string): string | null {
  const found =
    /\/binder\/projects\/([^/?#]+)/.exec(url) ??
    /\/binder\/(?!projects(?:[/?#]|$))([^/?#]+)/.exec(url);
  return found ? decodeURIComponent(found[1]) : null;
}

/** The address as a page's highlights are stored under it: no fragment, no trailing slash. */
export function clipUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** The highlights of a page, under their storage key. */
export const hlKey = (url: string) => `hl:${clipUrlKey(url)}`;

/** One line of text: what a highlight keeps of a selection. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** A new id for a highlight. */
export function newHighlightId(): string {
  return Math.random().toString(36).slice(2, 8).padEnd(6, "0");
}

export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  const all = await chrome.storage.local.get(key);
  return (all[key] as T | undefined) ?? fallback;
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export type { ClipHighlight, ClipPayload };
