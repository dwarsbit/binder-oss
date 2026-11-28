import { readPage, writePage } from "@scholarkit/editor/lib/page-file";
import {
  formatProperties,
  parseProperties,
  type Property,
} from "@scholarkit/editor/lib/properties";
import { baseName, join, parentOf, type Project } from "@scholarkit/editor/lib/paths";
import { t } from "@scholarkit/i18n";

/**
 * A binder: a folder of Markdown files, one per item, with the original
 * files next to them. `docs/format.md` describes the format; this file
 * reads and writes it.
 */

/** The version of the format this Binder writes. */
export const FORMAT = 1;
/** The file that makes a folder a binder and holds its research question. */
export const BINDER_FILE = "binder.md";
/** The folder new items are written to. */
export const ITEMS = "items";

export type Kind =
  | "article"
  | "book"
  | "chapter"
  | "webpage"
  | "lecture"
  | "slides"
  | "note"
  | "thought"
  | "file";

export const KINDS: Array<{ id: Kind; label: string }> = [
  { id: "article", label: t("Article") },
  { id: "book", label: t("Book") },
  { id: "chapter", label: t("Chapter") },
  { id: "webpage", label: t("Web page") },
  { id: "lecture", label: t("Lecture") },
  { id: "slides", label: t("Slides") },
  { id: "note", label: t("Note") },
  { id: "thought", label: t("Thought") },
  { id: "file", label: t("File") },
];

export const kindLabel = (kind: Kind) =>
  KINDS.find((entry) => entry.id === kind)?.label ?? t("Note");

/** Kinds you write yourself, as opposed to sources you read. */
export const isOwnWriting = (kind: Kind) => kind === "note" || kind === "thought";

export type Status = "inbox" | "to-read" | "reading" | "processed" | "set-aside";

export const STATUSES: Array<{ id: Status; label: string }> = [
  { id: "inbox", label: t("Inbox") },
  { id: "to-read", label: t("To read") },
  { id: "reading", label: t("Reading") },
  { id: "processed", label: t("Processed") },
  { id: "set-aside", label: t("Set aside") },
];

export const statusLabel = (status: Status) =>
  STATUSES.find((entry) => entry.id === status)?.label ?? t("Inbox");

const isKind = (value: string): value is Kind =>
  KINDS.some((kind) => kind.id === value);
const isStatus = (value: string): value is Status =>
  STATUSES.some((status) => status.id === value);

/** An item as the app shows it: its file's properties, read. */
export interface Item {
  path: string;
  title: string;
  kind: Kind;
  status: Status | null;
  authors: string[];
  year: string;
  publishedIn: string;
  volume: string;
  issue: string;
  /** The pages, as "45-67". */
  pages: string;
  publisher: string;
  doi: string;
  isbn: string;
  /** The arXiv ID, as `1706.03762`. */
  arxiv: string;
  /** The PubMed ID. */
  pmid: string;
  url: string;
  /** The original file, as a path in the binder. */
  file: string | null;
  /** The `zotero://select/…` link of the item in Zotero. */
  zotero: string;
  tags: string[];
  /** The date it was added, `YYYY-MM-DD`. */
  added: string;
  /** Who added it, in a shared binder: their name. Empty otherwise. */
  addedBy: string;
  /** The notes: the file's body. */
  markdown: string;
  /** False when the assistant is to stay away from the item. */
  assistant: boolean;
}

/** The properties Binder writes, in the order it writes them. */
const KEYS = [
  "kind",
  "status",
  "authors",
  "year",
  "published-in",
  "volume",
  "issue",
  "pages",
  "publisher",
  "doi",
  "isbn",
  "arxiv",
  "pmid",
  "url",
  "file",
  "zotero",
  "zotero-version",
  "tags",
  "added",
  "added-by",
  "assistant",
] as const;
type Key = (typeof KEYS)[number];

const LIST_KEYS = new Set<Key>(["authors", "tags"]);

const text = (properties: Property[], key: string): string => {
  const found = properties.find((p) => p.kind !== "raw" && p.key === key);
  if (!found || found.kind === "raw") return "";
  if (found.kind === "list") return found.value.join(", ");
  return String(found.value).trim();
};

const list = (properties: Property[], key: string): string[] => {
  const found = properties.find((p) => p.kind !== "raw" && p.key === key);
  if (!found || found.kind === "raw") return [];
  if (found.kind === "list") return found.value;
  const value = String(found.value).trim();
  return value ? [value] : [];
};

/** A page's title, or its file's name without `.md`. */
const titleOf = (path: string, title: string) =>
  title.trim() || baseName(path).replace(/\.md$/i, "");

/** Whether an `assistant` property keeps the assistant out: `false`, or `off` as typed by hand. */
const keepsOut = (value: string) =>
  ["false", "off", "no"].includes(value.toLowerCase());

/** Reads an item from its file. */
export function readItem(path: string, source: string): Item {
  const page = readPage(source);
  const properties = parseProperties(page.properties);
  const kindText = text(properties, "kind").toLowerCase();
  const kind: Kind = isKind(kindText) ? kindText : "note";
  const statusText = text(properties, "status").toLowerCase();
  const fileText = text(properties, "file");
  return {
    path,
    title: titleOf(path, page.title),
    kind,
    status: isStatus(statusText) ? statusText : null,
    authors: list(properties, "authors"),
    year: text(properties, "year"),
    publishedIn: text(properties, "published-in"),
    volume: text(properties, "volume"),
    issue: text(properties, "issue"),
    pages: text(properties, "pages"),
    publisher: text(properties, "publisher"),
    doi: text(properties, "doi"),
    isbn: text(properties, "isbn"),
    arxiv: text(properties, "arxiv"),
    pmid: text(properties, "pmid"),
    url: text(properties, "url"),
    file: fileText ? join(parentOf(path), fileText) : null,
    zotero: text(properties, "zotero"),
    tags: list(properties, "tags"),
    added: text(properties, "added"),
    addedBy: text(properties, "added-by"),
    markdown: page.markdown,
    assistant: !keepsOut(text(properties, "assistant")),
  };
}

/** What changes in an item's properties: a value, or null to take it out. */
export type ItemChanges = Partial<Record<Key, string | string[] | null>>;

/**
 * An item's file with some properties set or taken out. The other
 * lines of its front matter stay as written, in their place; a new
 * property goes where Binder's order puts it.
 */
export function setProperties(source: string, changes: ItemChanges): string {
  const page = readPage(source);
  let properties = parseProperties(page.properties);
  for (const key of KEYS) {
    if (!(key in changes)) continue;
    const value = changes[key];
    const at = properties.findIndex((p) => p.kind !== "raw" && p.key === key);
    const empty =
      value === null ||
      value === undefined ||
      (Array.isArray(value) ? value.length === 0 : value.trim() === "");
    if (empty) {
      if (at >= 0) properties = properties.filter((_, index) => index !== at);
      continue;
    }
    const next: Property =
      LIST_KEYS.has(key) || Array.isArray(value)
        ? {
            kind: "list",
            key,
            value: (Array.isArray(value) ? value : [value])
              .map((v) => v.trim())
              .filter(Boolean),
          }
        : key === "assistant"
          ? { kind: "boolean", key, value: false }
          : key === "year" && /^\d+$/.test(value)
            ? { kind: "number", key, value }
            : key === "added" && /^\d{4}-\d{2}-\d{2}$/.test(value)
              ? { kind: "date", key, value }
              : { kind: "text", key, value: value.trim() };
    if (at >= 0) {
      properties = properties.map((p, index) => (index === at ? next : p));
      continue;
    }
    // After the last of Binder's properties that comes before it.
    const order = KEYS.indexOf(key);
    let place = 0;
    properties.forEach((p, index) => {
      if (p.kind === "raw") return;
      const known = KEYS.indexOf(p.key as Key);
      if (known >= 0 && known < order) place = index + 1;
    });
    properties = [...properties.slice(0, place), next, ...properties.slice(place)];
  }
  return writePage({ ...page, properties: formatProperties(properties) });
}

/** The fields of a new item. */
export interface NewItem {
  title: string;
  kind: Kind;
  status?: Status | null;
  authors?: string[];
  year?: string;
  publishedIn?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  doi?: string;
  isbn?: string;
  arxiv?: string;
  pmid?: string;
  url?: string;
  /** The original file's name, next to the item. */
  file?: string;
  zotero?: string;
  zoteroVersion?: number;
  tags?: string[];
  markdown?: string;
  /** Who added it, in a shared binder. */
  addedBy?: string;
}

/** Today as `YYYY-MM-DD`, in the computer's time zone. */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A new item's file. New sources and thoughts start in the inbox; notes have no status. */
export function newItemSource(item: NewItem, added = today()): string {
  const status =
    item.status === undefined ? (item.kind === "note" ? null : "inbox") : item.status;
  const base = writePage({
    title: item.title.trim(),
    properties: "",
    markdown: item.markdown ?? "",
  });
  return setProperties(base, {
    kind: item.kind,
    status,
    authors: item.authors ?? null,
    year: item.year ?? null,
    "published-in": item.publishedIn ?? null,
    volume: item.volume ?? null,
    issue: item.issue ?? null,
    pages: item.pages ?? null,
    publisher: item.publisher ?? null,
    doi: item.doi ?? null,
    isbn: item.isbn ?? null,
    arxiv: item.arxiv ?? null,
    pmid: item.pmid ?? null,
    url: item.url ?? null,
    file: item.file ?? null,
    zotero: item.zotero ?? null,
    "zotero-version":
      item.zoteroVersion === undefined ? null : String(item.zoteroVersion),
    tags: item.tags ?? null,
    added,
    "added-by": item.addedBy ?? null,
  });
}

/** The binder's research question and format version, from `binder.md`. */
export interface BinderInfo {
  format: number;
  question: string;
  /** False when the binder keeps the assistant out. */
  assistant: boolean;
}

export function readBinderInfo(project: Project): BinderInfo {
  const source = project.pages[BINDER_FILE];
  if (source === undefined) return { format: FORMAT, question: "", assistant: true };
  const page = readPage(source);
  const properties = parseProperties(page.properties);
  const version = Number(text(properties, "binder"));
  return {
    format: Number.isInteger(version) && version > 0 ? version : FORMAT,
    question: page.markdown.trim(),
    assistant: !keepsOut(text(properties, "assistant")),
  };
}

/** `binder.md` with the assistant let in or kept out. Its other lines stay as written. */
export function writeBinderAssistant(source: string | undefined, on: boolean): string {
  const page = readPage(source ?? "");
  let properties = parseProperties(page.properties).filter(
    (p) => p.kind === "raw" || p.key !== "assistant",
  );
  if (!properties.some((p) => p.kind !== "raw" && p.key === "binder"))
    properties = [
      { kind: "number", key: "binder", value: String(FORMAT) },
      ...properties,
    ];
  if (!on) {
    const at = properties.findIndex((p) => p.kind !== "raw" && p.key === "binder");
    properties.splice(at + 1, 0, { kind: "boolean", key: "assistant", value: false });
  }
  return writePage({ ...page, properties: formatProperties(properties) });
}

/** `binder.md` with this research question. Its other lines stay as written. */
export function writeBinderInfo(source: string | undefined, question: string): string {
  const page = readPage(source ?? "");
  const properties = parseProperties(page.properties);
  const at = properties.findIndex((p) => p.kind !== "raw" && p.key === "binder");
  const version: Property = { kind: "number", key: "binder", value: String(FORMAT) };
  const next = at >= 0 ? properties : [version, ...properties];
  return writePage({
    title: page.title,
    properties: formatProperties(next),
    markdown: question.trim() ? `${question.trim()}\n` : "",
  });
}

/** Files next to an item that aren't items: its highlights and what the assistant wrote. */
export const isCompanionPath = (path: string) =>
  /\.(?:highlights|assistant)\.md$/i.test(path);

/** Every item of a binder: every Markdown file but `binder.md` and the files next to items. */
export function itemsOf(project: Project): Item[] {
  return Object.entries(project.pages)
    .filter(([path]) => path !== BINDER_FILE && !isCompanionPath(path))
    .map(([path, source]) => readItem(path, source));
}

/**
 * A file or folder name made from a title: readable, and safe on
 * macOS, Windows and Linux. As Cursive names its pages.
 */
export function fileNameFor(title: string): string {
  const name = title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  if (!name || /^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) return "Untitled";
  return name;
}

/** A file's extension, lower case with its dot: ".pdf". Empty when it has none. */
export function extensionOf(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return dot > 0
    ? base
        .slice(dot)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, "")
    : "";
}

const taken = (project: Project, path: string) => {
  const lower = path.toLowerCase();
  return (
    Object.keys(project.pages).some((p) => p.toLowerCase() === lower) ||
    project.folders.some((f) => f.toLowerCase() === lower) ||
    (project.files ?? []).some((f) => f.toLowerCase() === lower)
  );
};

/**
 * A free name for an item in `dir`: "Screen or paper", then "Screen or
 * paper 2". Free for its Markdown file and, with `extension`, for its
 * original file too. `except` is an item path that may be reused.
 */
export function freeItemPath(
  project: Project,
  title: string,
  extension = "",
  dir = ITEMS,
  except?: string,
): { path: string; file: string | null } {
  const stem = fileNameFor(title);
  const own = (path: string) => path.toLowerCase() === except?.toLowerCase();
  const ownFile = (path: string) =>
    except !== undefined &&
    path.toLowerCase() === except.replace(/\.md$/i, extension).toLowerCase();
  for (let n = 1; ; n++) {
    const name = n === 1 ? stem : `${stem} ${n}`;
    const path = join(dir, `${name}.md`);
    const file = extension ? join(dir, `${name}${extension}`) : null;
    const pathFree = own(path) || !taken(project, path);
    const fileFree = !file || ownFile(file) || !taken(project, file);
    if (pathFree && fileFree) return { path, file };
  }
}

/** Kinds a file is taken for, by its extension. */
export function kindOfFile(name: string): Kind {
  const extension = extensionOf(name);
  if ([".ppt", ".pptx", ".key", ".odp"].includes(extension)) return "slides";
  if ([".epub", ".mobi", ".djvu"].includes(extension)) return "book";
  if ([".pdf"].includes(extension)) return "article";
  if ([".html", ".htm", ".mhtml", ".webarchive"].includes(extension)) return "webpage";
  return "file";
}

/** A title from a file's name: "okafor_brandt-2021.pdf" reads "okafor brandt 2021". */
export function titleOfFile(name: string): string {
  const base = baseName(name);
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A thought's title: its first line, cut at a word near 80 characters. */
export function thoughtTitle(text: string): string {
  const line = text.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (line.length <= 80) return line;
  const cut = line.slice(0, 80);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}

/** "Okafor, Nkem" and "Brandt, Sofie" read "Okafor and Brandt"; three or more "Okafor et al." */
export function authorsShort(authors: string[]): string {
  const family = authors.map((name) => name.split(",")[0].trim()).filter(Boolean);
  if (family.length === 0) return "";
  if (family.length === 1) return family[0];
  if (family.length === 2)
    return t("{first} and {second}", { first: family[0], second: family[1] });
  return t("{first} et al.", { first: family[0] });
}

/** The line under an item's title in a list: "Okafor and Brandt · 2021 · Article". */
export function itemByline(item: Item): string {
  return [authorsShort(item.authors), item.year, kindLabel(item.kind)]
    .filter(Boolean)
    .join(" · ");
}

/** Items in the order lists show them: the newest first, then by title. */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title),
  );
}

/** Every tag in the binder, with how many items carry it, by name. */
export function tagCounts(items: Item[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of new Set(item.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/** A Zotero item's link, as `zotero` keeps it. `library` is `local`, `users/…` or `groups/…`. */
export function zoteroLink(library: string, key: string): string {
  const group = /^groups\/(\d+)$/.exec(library);
  return group
    ? `zotero://select/groups/${group[1]}/items/${key}`
    : `zotero://select/library/items/${key}`;
}

/** The Zotero item key of a `zotero://select/…` link. */
export function zoteroKeyOf(link: string): string | null {
  return /\/items\/([A-Z0-9]+)$/i.exec(link.trim())?.[1] ?? null;
}
