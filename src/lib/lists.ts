import { readPage, writePage } from "@scholarkit/editor/lib/page-file";
import {
  formatProperties,
  parseProperties,
  type Property,
} from "@scholarkit/editor/lib/properties";
import { FORMAT, type Item, type Kind, type Status } from "./binder";
import { t } from "@scholarkit/i18n";

/**
 * What a saved list keeps: an item passes when it passes every filter
 * that is set. Statuses, kinds and tags pass on any one of theirs.
 */
export interface Filters {
  status?: Status[];
  kind?: Kind[];
  tags?: string[];
  yearFrom?: number;
  yearTo?: number;
  /** Added in the last so many days, counting today. */
  addedWithin?: number;
  /** True: items with an original file. False: items without one. */
  hasFile?: boolean;
  /** Text in an author's name. */
  author?: string;
  /** Text in where the item was published, such as a journal's name. */
  publishedIn?: string;
}

export type Filter = keyof Filters;

/** The filters in the order the filter bar and `binder.md` give them. */
export const FILTERS: Filter[] = [
  "status",
  "kind",
  "tags",
  "yearFrom",
  "yearTo",
  "addedWithin",
  "hasFile",
  "author",
  "publishedIn",
];

/** Each filter's property in `binder.md`. */
const KEYS: Record<Filter, string> = {
  status: "status",
  kind: "kind",
  tags: "tags",
  yearFrom: "year-from",
  yearTo: "year-to",
  addedWithin: "added-within",
  hasFile: "has-file",
  author: "author",
  publishedIn: "published-in",
};

export interface SavedList {
  name: string;
  filters: Filters;
  /** Lines of the list this Binder doesn't know, kept as written. */
  unknown: Property[];
}

/** The lists a binder starts with, until you change one. */
export function defaultLists(): SavedList[] {
  return [
    { name: t("Added this week"), filters: { addedWithin: 7 }, unknown: [] },
    {
      name: t("Ready to read"),
      filters: { status: ["to-read"], hasFile: true },
      unknown: [],
    },
    {
      name: t("Missing a PDF"),
      filters: { kind: ["article", "book", "chapter"], hasFile: false },
      unknown: [],
    },
    {
      name: t("Books and chapters"),
      filters: { kind: ["book", "chapter"] },
      unknown: [],
    },
  ];
}

const LISTS_LINE = /^lists:[ \t]*(.*)$/;
/** A line of a block under a key: indented, or a dash. */
const IN_BLOCK = /^(?:[ \t]+\S|-(?:[ \t]|$))/;

/** Where the `lists` lines are among the front matter's lines: the key and the block under it. */
function findLists(lines: string[]): { at: number; end: number } | null {
  const at = lines.findIndex((line) => LISTS_LINE.test(line));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && (IN_BLOCK.test(lines[end]) || !lines[end].trim())) end++;
  // Blank lines after the block belong to what follows.
  while (end > at + 1 && !lines[end - 1].trim()) end--;
  return { at, end };
}

const number = (property: Property | undefined): number | undefined => {
  if (!property || property.kind === "raw" || property.kind === "list")
    return undefined;
  const value = Number(String(property.value).trim());
  return Number.isFinite(value) ? value : undefined;
};

const words = (property: Property | undefined): string[] | undefined =>
  property?.kind === "list"
    ? property.value
    : property && property.kind !== "raw" && property.kind !== "boolean"
      ? [property.value.trim()].filter(Boolean)
      : undefined;

const text = (property: Property | undefined): string | undefined =>
  property && property.kind !== "raw" && property.kind !== "list"
    ? String(property.value).trim() || undefined
    : undefined;

/** One list from its lines, the dash and the indent taken off. */
function readList(lines: string[]): SavedList | null {
  const properties = parseProperties(lines.join("\n"));
  const get = (key: string) =>
    properties.find((p) => p.kind !== "raw" && p.key === key);
  const name = text(get("name"));
  if (!name) return null;
  const hasFile = get(KEYS.hasFile);
  const filters: Filters = {
    status: words(get(KEYS.status)) as Status[] | undefined,
    kind: words(get(KEYS.kind)) as Kind[] | undefined,
    tags: words(get(KEYS.tags)),
    yearFrom: number(get(KEYS.yearFrom)),
    yearTo: number(get(KEYS.yearTo)),
    addedWithin: number(get(KEYS.addedWithin)),
    hasFile: hasFile?.kind === "boolean" ? hasFile.value : undefined,
    author: text(get(KEYS.author)),
    publishedIn: text(get(KEYS.publishedIn)),
  };
  for (const filter of FILTERS)
    if (filters[filter] === undefined) delete filters[filter];
  const known = new Set(["name", ...Object.values(KEYS)]);
  return {
    name,
    filters,
    unknown: properties.filter((p) => p.kind === "raw" || !known.has(p.key)),
  };
}

/** The saved lists in `binder.md`, or the ones a binder starts with. */
export function readLists(source: string | undefined): SavedList[] {
  const lines = readPage(source ?? "").properties.split(/\r?\n/);
  const found = findLists(lines);
  if (!found) return defaultLists();
  const block = lines.slice(found.at + 1, found.end);
  const lists: SavedList[] = [];
  let entry: string[] | null = null;
  let indent = 0;
  const done = () => {
    const list = entry && readList(entry);
    if (list && !lists.some((other) => other.name === list.name)) lists.push(list);
  };
  for (const line of block) {
    const dash = /^([ \t]*)-(?:[ \t]+|$)(.*)$/.exec(line);
    if (dash && (entry === null || dash[1].length <= indent)) {
      done();
      indent = dash[1].length;
      entry = dash[2] ? [dash[2]] : [];
    } else if (entry) {
      entry.push(line.trim() ? line.trim() : "");
    }
  }
  done();
  return lists;
}

/** A list's lines under `lists:`. */
function writeList(list: SavedList): string[] {
  const { filters } = list;
  const properties: Property[] = [{ kind: "text", key: "name", value: list.name }];
  for (const filter of FILTERS) {
    const value = filters[filter];
    const key = KEYS[filter];
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) properties.push({ kind: "list", key, value: [...value] });
    } else if (typeof value === "boolean") {
      properties.push({ kind: "boolean", key, value });
    } else if (typeof value === "number") {
      properties.push({ kind: "number", key, value: String(value) });
    } else {
      properties.push({ kind: "text", key, value });
    }
  }
  return formatProperties([...properties, ...list.unknown])
    .split("\n")
    .map((line, index) => (index === 0 ? `  - ${line}` : line ? `    ${line}` : line));
}

/** `binder.md` with these saved lists. Its other lines stay as written. */
export function writeLists(source: string | undefined, lists: SavedList[]): string {
  const page = readPage(source ?? "");
  let lines = page.properties ? page.properties.split(/\r?\n/) : [];
  if (!lines.some((line) => /^binder:/.test(line)))
    lines = [`binder: ${FORMAT}`, ...lines];
  const block = lists.length ? ["lists:", ...lists.flatMap(writeList)] : ["lists: []"];
  const found = findLists(lines);
  if (found) {
    lines = [...lines.slice(0, found.at), ...block, ...lines.slice(found.end)];
  } else {
    // After the last top-level line, before any blank lines at the end.
    let place = lines.length;
    while (place > 0 && !lines[place - 1].trim()) place--;
    lines = [...lines.slice(0, place), ...block, ...lines.slice(place)];
  }
  return writePage({ ...page, properties: lines.join("\n") });
}

/** A date as `YYYY-MM-DD`, in the local time zone. */
const day = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const holds = (haystack: string, needle: string) =>
  haystack.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());

/** Whether an item passes a list's filters. A list with a filter Binder doesn't know shows nothing. */
export function inList(item: Item, list: SavedList, today = new Date()): boolean {
  const f = list.filters;
  if (list.unknown.some((p) => p.kind !== "raw")) return false;
  if (f.status?.length && !(item.status && f.status.includes(item.status)))
    return false;
  if (f.kind?.length && !f.kind.includes(item.kind)) return false;
  if (f.tags?.length && !f.tags.some((tag) => item.tags.includes(tag))) return false;
  if (f.yearFrom !== undefined || f.yearTo !== undefined) {
    const year = Number.parseInt(item.year, 10);
    if (!Number.isFinite(year)) return false;
    if (f.yearFrom !== undefined && year < f.yearFrom) return false;
    if (f.yearTo !== undefined && year > f.yearTo) return false;
  }
  if (f.addedWithin !== undefined) {
    const first = new Date(today);
    first.setDate(first.getDate() - Math.max(0, Math.floor(f.addedWithin) - 1));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.added) || item.added < day(first))
      return false;
  }
  if (f.hasFile !== undefined && Boolean(item.file) !== f.hasFile) return false;
  if (f.author && !item.authors.some((author) => holds(author, f.author ?? "")))
    return false;
  if (f.publishedIn && !holds(item.publishedIn, f.publishedIn)) return false;
  return true;
}

/** A name no other list has: the one wanted, or with a number after it. */
export function freeListName(
  lists: SavedList[],
  wanted: string,
  except?: string,
): string {
  const taken = new Set(
    lists.filter((list) => list.name !== except).map((list) => list.name.toLowerCase()),
  );
  if (!taken.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; ; n++) {
    const name = `${wanted} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}
