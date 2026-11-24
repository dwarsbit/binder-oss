import { clipPayload, type ClipPayload } from "@scholarkit/contracts";
import { newHighlightId, type Category, type Highlight } from "./highlights";

/**
 * Clips from the Binder browser extension (`clipper/`): a web page saved into
 * the open binder. The extension's content script relays its messages to this
 * window with window.postMessage; everything is validated here before use.
 */

/** The marker on messages from the extension's content script. */
export const CLIP_SOURCE = "binder-clipper";
/** The marker on messages to the extension's content script. */
export const CLIP_APP_SOURCE = "binder-clipper-app";

/** A clip payload that passed the contract, or null. */
export function parseClip(data: unknown): ClipPayload | null {
  const parsed = clipPayload.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Two addresses for the same page: same host, path without a trailing slash, no fragment. */
export function sameUrl(a: string, b: string): boolean {
  const normalize = (value: string) => {
    try {
      const url = new URL(value);
      url.hash = "";
      url.pathname = url.pathname.replace(/\/+$/, "");
      return `${url.protocol}//${url.host}${url.pathname}${url.search}`;
    } catch {
      return value.trim();
    }
  };
  return normalize(a) === normalize(b);
}

/** A clip's highlights as the app keeps them: same ids where free, new ids where taken. */
export function clipHighlights(
  clip: ClipPayload,
  taken: Iterable<string> = [],
): Highlight[] {
  const used = new Set(taken);
  return clip.highlights.map((highlight) => {
    let id = highlight.id;
    while (used.has(id)) id = newHighlightId(used);
    used.add(id);
    return {
      id,
      category: highlight.category as Category,
      page: null,
      text: highlight.text,
    };
  });
}

/**
 * Subscribes to clips for the open binder `binderId`. The extension's content
 * script posts each clip once this app says it is ready. Returns an
 * unsubscribe. Where no extension runs (the desktop app, the demo) nothing
 * ever arrives.
 */
export function subscribeClips(
  binderId: string,
  onClip: (clip: ClipPayload) => void,
): () => void {
  const listener = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as {
      source?: unknown;
      type?: unknown;
      payload?: unknown;
    } | null;
    if (!data || data.source !== CLIP_SOURCE || data.type !== "clip") return;
    const clip = parseClip(data.payload);
    if (!clip || clip.binder !== binderId) return;
    onClip(clip);
    window.postMessage(
      { source: CLIP_APP_SOURCE, type: "done", url: clip.url },
      window.location.origin,
    );
  };
  window.addEventListener("message", listener);
  // The content script holds clips back until the app says it is ready.
  window.postMessage(
    { source: CLIP_APP_SOURCE, type: "ready" },
    window.location.origin,
  );
  return () => window.removeEventListener("message", listener);
}
