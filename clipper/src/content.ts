import { CLIP_MAX_HTML, type ClipHighlight } from "@scholarkit/contracts";
import {
  binderOf,
  hlKey,
  LS,
  newHighlightId,
  oneLine,
  type BgMessage,
  type Captured,
  type CategoryLabel,
  type Mode,
} from "./shared";

/**
 * The content script on a Binder web page (/binder/…): relays clips from the
 * background worker to the app with window.postMessage, and answers capture
 * requests from it. On every other page it is the highlighter: select text,
 * pick a category, and the highlight is kept for when the page is saved.
 */

const APP_SOURCE = "binder-clipper-app";
const PAGE_SOURCE = "binder-clipper";

let appReady = false;
const held: unknown[] = [];
let categories: CategoryLabel[] = [];
let highlightOn = false;

// The app says it is ready, then every held clip goes through.
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  const data = event.data as { source?: unknown; type?: unknown; url?: unknown } | null;
  if (!data || data.source !== APP_SOURCE) return;
  if (data.type === "ready") {
    appReady = true;
    for (const message of held) window.postMessage(message, location.origin);
    held.length = 0;
    void chrome.runtime.sendMessage({ type: "ready", url: location.href });
  } else if (data.type === "done" && typeof data.url === "string") {
    void chrome.runtime.sendMessage({
      type: "app-done",
      url: data.url,
      binder: binderOf(location.href) ?? "",
    });
  }
});

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  if (!message || message.from !== "binder-clipper") return;
  if (message.type === "capture") {
    sendResponse(capture(message.mode));
    return;
  }
  if (message.type === "highlight-mode") {
    highlightOn = message.on;
    if (!highlightOn) hideToolbar();
    return;
  }
  if (message.type === "clip") {
    const forward = { source: PAGE_SOURCE, type: "clip", payload: message.payload };
    if (appReady) window.postMessage(forward, location.origin);
    else held.push(forward);
  }
});

/** The page as the background worker asks for it. */
function capture(mode: Mode): Captured {
  const meta = (name: string) =>
    document.querySelector(`meta[name="${name}" i]`)?.getAttribute("content")?.trim();
  const selection = window.getSelection()?.toString() ?? "";
  return {
    url: location.href,
    title: document.title ?? "",
    author: meta("author") || meta("article:author") || undefined,
    html: document.documentElement.outerHTML.slice(0, CLIP_MAX_HTML),
    text: mode === "selection" ? selection : undefined,
  };
}

// The labels come from the background worker, which reads the app's catalogs.
void chrome.runtime.sendMessage(
  { type: "config" },
  (response?: { categories: CategoryLabel[] }) => {
    categories = response?.categories ?? [];
  },
);

// On a Binder page there is nothing to highlight.
if (!binderOf(location.href)) void startHighlighter();

/** Selecting text with highlight mode on offers the categories in a small toolbar. */
async function startHighlighter() {
  highlightOn = Boolean(
    (await chrome.storage.local.get(LS.highlightMode))[LS.highlightMode],
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[LS.highlightMode]) return;
    highlightOn = Boolean(changes[LS.highlightMode].newValue);
    if (!highlightOn) hideToolbar();
  });

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    ::highlight(binder-claim), mark.binder-clip.binder-claim { background-color: #fde68a; }
    ::highlight(binder-definition), mark.binder-clip.binder-definition { background-color: #bfdbfe; }
    ::highlight(binder-method), mark.binder-clip.binder-method { background-color: #bbf7d0; }
    ::highlight(binder-finding), mark.binder-clip.binder-finding { background-color: #fecaca; }
    ::highlight(binder-quote), mark.binder-clip.binder-quote { background-color: #e9d5ff; }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  // Highlights made earlier on this page, shown again.
  const stored = (await chrome.storage.local.get(hlKey(location.href)))[
    hlKey(location.href)
  ];
  for (const highlight of (stored ?? []) as ClipHighlight[]) addMark(highlight);

  document.addEventListener("mouseup", () => {
    if (!highlightOn) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!selection || selection.isCollapsed || !text || !categories.length) return;
    showToolbar(selection.getRangeAt(0), text);
  });
  document.addEventListener("mousedown", (event) => {
    if (!(event.target as Element | null)?.closest?.("#binder-clipper-toolbar"))
      hideToolbar();
  });
}

// The CSS Custom Highlight API (Chrome 105+, Firefox 140+); where it isn't
// there, highlights are <mark> elements instead.
const highlightApi = typeof Highlight !== "undefined" && "highlights" in CSS;
const marks = new Map<string, Highlight>();

/** Shows the highlight under its category, from its text where the page has it. */
function addMark(highlight: ClipHighlight) {
  const needle = highlight.text.slice(0, 2000);
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const at = node.data.indexOf(needle);
    if (at >= 0) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      ranges.push(range);
      break;
    }
    node = walker.nextNode() as Text | null;
  }
  if (!ranges.length) return;
  if (highlightApi) {
    let mark = marks.get(highlight.category);
    if (!mark) {
      mark = new Highlight();
      marks.set(highlight.category, mark);
      CSS.highlights.set(`binder-${highlight.category}`, mark);
    }
    for (const range of ranges) mark.add(range);
  } else {
    for (const range of ranges) wrapInMark(range, highlight.category);
  }
}

/** Wraps a range in a <mark>, where the Highlight API isn't there. */
function wrapInMark(range: Range, category: string) {
  const mark = document.createElement("mark");
  mark.className = `binder-clip binder-${category}`;
  try {
    range.surroundContents(mark);
  } catch {
    // The range spans elements: wrap what it holds instead.
    mark.append(range.extractContents());
    range.insertNode(mark);
  }
}

let toolbar: ShadowRoot | null = null;

function hideToolbar() {
  (toolbar?.host as HTMLElement | undefined)?.remove();
  toolbar = null;
}

function showToolbar(range: Range, text: string) {
  hideToolbar();
  const host = document.createElement("div");
  host.id = "binder-clipper-toolbar";
  const rect = range.getBoundingClientRect();
  host.style.cssText = `position:fixed;left:${Math.max(8, rect.left)}px;top:${rect.bottom + 6}px;z-index:2147483647;`;
  const shadow = host.attachShadow({ mode: "closed" });
  const bar = document.createElement("div");
  bar.style.cssText =
    "display:flex;gap:2px;background:#fff;border:1px solid #d4d4d4;border-radius:8px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,.18);font:12px/1.4 system-ui,sans-serif;";
  for (const category of categories) {
    const button = document.createElement("button");
    button.textContent = category.label;
    button.style.cssText =
      "border:0;border-radius:6px;background:#f5f5f5;padding:4px 8px;cursor:pointer;white-space:nowrap;";
    button.addEventListener("click", () => {
      void saveHighlight({
        id: newHighlightId(),
        category: category.id as ClipHighlight["category"],
        text: oneLine(text).slice(0, 2000),
      });
      hideToolbar();
      window.getSelection()?.removeAllRanges();
    });
    bar.append(button);
  }
  shadow.append(bar);
  document.documentElement.append(host);
  toolbar = shadow;
}

async function saveHighlight(highlight: ClipHighlight) {
  const key = hlKey(location.href);
  const all = await chrome.storage.local.get([key, LS.lastCategory]);
  const list = ((all[key] ?? []) as ClipHighlight[]).slice(-499);
  list.push(highlight);
  await chrome.storage.local.set({
    [key]: list,
    [LS.lastCategory]: highlight.category,
  });
  addMark(highlight);
}
