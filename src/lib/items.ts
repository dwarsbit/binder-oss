import type { Reference, ReferenceType } from "@scholarkit/editor/references/reference";
import type { FoundWork, Lookup } from "@scholarkit/editor/references/lookup";
import { writePage } from "@scholarkit/editor/lib/page-file";
import type { Project } from "@scholarkit/editor/lib/paths";
import {
  BINDER_FILE,
  isOwnWriting,
  itemsOf,
  kindLabel,
  statusLabel,
  type Item,
  type Kind,
  type NewItem,
  type Status,
} from "./binder";
import { inList, type SavedList } from "./lists";
import { t } from "@scholarkit/i18n";

/** What the lists show: the inbox, the reading list, the notes, a saved list, or the items with a tag. */
export type View =
  | { kind: "inbox" }
  | { kind: "reading" }
  | { kind: "notes" }
  | { kind: "list"; name: string }
  | { kind: "tag"; tag: string };

/** The statuses on the reading list, in the order of its board's columns. */
export const READING: Status[] = ["to-read", "reading", "processed", "set-aside"];

export const viewKey = (view: View) =>
  view.kind === "tag"
    ? `tag:${view.tag}`
    : view.kind === "list"
      ? `list:${view.name}`
      : view.kind;

export function viewOfKey(key: string | null): View {
  if (key?.startsWith("tag:")) return { kind: "tag", tag: key.slice(4) };
  if (key?.startsWith("list:")) return { kind: "list", name: key.slice(5) };
  if (key === "reading" || key === "notes") return { kind: key };
  return { kind: "inbox" };
}

export const viewTitle = (view: View) =>
  view.kind === "inbox"
    ? t("Inbox")
    : view.kind === "reading"
      ? t("Reading list")
      : view.kind === "notes"
        ? t("Notes")
        : view.kind === "list"
          ? view.name
          : view.tag;

/** Whether an item shows in a view. A saved list's filters come from `lists`. */
export function inView(item: Item, view: View, lists: SavedList[] = []): boolean {
  switch (view.kind) {
    case "inbox":
      return item.status === "inbox";
    case "reading":
      return (
        item.status !== null && item.status !== "inbox" && !isOwnWriting(item.kind)
      );
    // Every note and thought, also those still in the inbox.
    case "notes":
      return isOwnWriting(item.kind);
    case "list": {
      const list = lists.find((entry) => entry.name === view.name);
      return list ? inList(item, list) : false;
    }
    case "tag":
      return item.tags.includes(view.tag);
  }
}

/** How many items are in the inbox, on the reading list and among the notes. */
export function viewCounts(
  items: Item[],
): Record<"inbox" | "reading" | "notes", number> {
  const count = (view: View) => items.filter((item) => inView(item, view)).length;
  return {
    inbox: count({ kind: "inbox" }),
    reading: count({ kind: "reading" }),
    notes: count({ kind: "notes" }),
  };
}

const KINDS_OF: Record<ReferenceType, Kind> = {
  article: "article",
  conference: "article",
  book: "book",
  thesis: "book",
  report: "book",
  chapter: "chapter",
  webpage: "webpage",
  other: "article",
};

/** A new item from a work found in Zotero or by its DOI, ISBN, arXiv or PubMed ID. */
export function itemOfReference(ref: Reference | FoundWork): NewItem {
  const ids = "arxiv" in ref ? ref : null;
  return {
    title: ref.title.trim() || t("Untitled"),
    kind: KINDS_OF[ref.type],
    authors: ref.author.length ? ref.author : ref.editor,
    year: ref.year,
    publishedIn: ref.container,
    volume: ref.volume,
    issue: ref.issue,
    pages: ref.pages,
    publisher: ref.publisher,
    doi: ref.doi,
    isbn: ids?.isbn || undefined,
    arxiv: ids?.arxiv || undefined,
    pmid: ids?.pmid || undefined,
    url: ref.url,
  };
}

/** The item a binder has already for a work looked up by this ID, if any. */
export function sameWork(
  items: Item[],
  kind: Lookup["kind"],
  id: string,
): Item | undefined {
  const lower = id.toLowerCase();
  return items.find((item) => {
    switch (kind) {
      case "doi":
        return (
          item.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() === lower
        );
      case "isbn":
        return item.isbn.replace(/[\s-]/g, "").toUpperCase() === id;
      case "arxiv":
        return item.arxiv.replace(/v\d+$/, "").toLowerCase() === lower;
      case "pubmed":
        return item.pmid === id;
    }
  });
}

/** A web page's title from its address alone: "example.org/library/where-students-read". */
export function titleOfUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, "");
    const last = path.slice(path.lastIndexOf("/") + 1).replace(/\.[a-z0-9]+$/i, "");
    const words = last.replace(/[-_+]+/g, " ").trim();
    const host = parsed.hostname.replace(/^www\./, "");
    return words ? `${words[0].toUpperCase()}${words.slice(1)}` : host;
  } catch {
    return url.trim();
  }
}

/** An address as typed: "example.org/x" is "https://example.org/x"; null when it is none. */
export function urlOf(text: string): string | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname.includes(".") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The binder's items as pages for the search: each item's details go
 * on a line before its notes, so a search finds an author, a journal,
 * a DOI or a tag as well as a word in the notes.
 */
export function searchablePages(project: Project): Record<string, string> {
  const pages: Record<string, string> = {};
  for (const item of itemsOf(project)) {
    const details = [
      item.authors.join("; "),
      item.year,
      item.publishedIn,
      item.publisher,
      item.doi,
      item.isbn,
      item.arxiv,
      item.pmid,
      item.url,
      kindLabel(item.kind),
      item.status ? statusLabel(item.status) : "",
      item.tags.join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
    pages[item.path] = writePage({
      title: item.title,
      properties: "",
      markdown: `${details}\n\n${item.markdown}`,
    });
  }
  delete pages[BINDER_FILE];
  return pages;
}
