import {
  stringArg,
  toolkit,
  type CardState,
  type Tool,
  type ToolArgs,
  type Toolkit,
} from "@scholarkit/assistant";
import type {
  FoundPaper,
  FoundWork,
  PaperSearch,
} from "@scholarkit/editor/references/lookup";
import { t, tn } from "@scholarkit/i18n";
import {
  authorsShort,
  isOwnWriting,
  KINDS,
  kindLabel,
  statusLabel,
  type Item,
  type Kind,
} from "../binder";
import { CATEGORIES, type Category, type Highlight } from "../highlights";
import { itemOfReference } from "../items";
import { isPaged, isReadable } from "../text";
import { findQuote, PassageIndex, passagesOf, type Passage } from "./passages";

/**
 * The assistant's tools in Binder: it lists and reads the items, searches
 * and reads the sources' text, checks every quote it gives, and proposes
 * properties, notes, highlights, papers, free PDFs and background reading
 * as cards that change nothing until you accept them. Lookups go through
 * our server, never straight to the source. Items the assistant is kept
 * away from don't exist for it.
 */

/** A property a card proposes, as it is now and as it would be. */
export interface PropertyChange {
  field:
    | "kind"
    | "title"
    | "authors"
    | "year"
    | "publishedIn"
    | "publisher"
    | "doi"
    | "tags";
  before: string;
  after: string;
}

/** What a card shows, and what accepting it does. */
export type BinderCard = { state?: CardState; note?: string | null } & (
  | {
      type: "quote";
      n: number;
      path: string;
      /** Such as "Santamouris · 2014 · p. 12". */
      source: string;
      page: number | null;
      quote: string;
    }
  | {
      type: "properties";
      id: number;
      path: string;
      title: string;
      changes: PropertyChange[];
    }
  | { type: "note"; id: number; title: string; markdown: string }
  | {
      type: "highlights";
      id: number;
      path: string;
      title: string;
      highlights: Array<Omit<Highlight, "id">>;
    }
  | {
      type: "papers";
      id: number;
      papers: FoundPaper[];
      /** The ones added to the binder, by their place in the list. */
      added?: number[];
      /** Why adding one failed. */
      notes?: Record<number, string>;
    }
  | { type: "pdf"; id: number; path: string; title: string; doi: string }
  | { type: "reading"; id: number; paths: string[]; titles: string[] }
);

/** What the tools reach in the binder. */
export interface BinderHost {
  /** Every item, the notes and thoughts too. */
  items(): Item[];
  /** Whether the assistant may look at an item: the binder and the item let it. */
  allowed(item: Item): boolean;
  /** The binder's research question; may be empty. */
  question(): string;
  highlights(path: string): Highlight[];
  /** The text of an item's source, by page (an EPUB's by chapter); null without one. */
  pagesOf(item: Item): Promise<string[] | null>;
  /** Papers by their title or authors, through our server. Absent without an account. */
  searchPapers?: (q: string) => Promise<PaperSearch>;
  /** A work by its DOI, arXiv or PubMed ID, through our server. Absent without an account. */
  lookUp?: (kind: "doi" | "arxiv" | "pubmed", id: string) => Promise<FoundWork | null>;
  /** Links to free PDFs of a work, through our server. Absent without an account. */
  freePdfs?: (doi: string) => Promise<string[]>;
  /** Whether the background reader can read an item now. */
  canRead(item: Item): boolean;
}

/** Numbers shared by one conversation: citations and cards. */
export interface Numbering {
  quotes: Array<{ path: string; quote: string; n: number }>;
  cards: number;
}

export const newNumbering = (): Numbering => ({ quotes: [], cards: 0 });

/** Room for one tool's answer, in characters. */
const ROOM = 12_000;
/** At most this many passages a search gives. */
const FOUND = 12;

const KIND_IDS = KINDS.map((kind) => kind.id).filter(
  (id) => id !== "note" && id !== "thought",
);

const objectOf = (properties: Record<string, object>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
});

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });

/** An item as the lists show it to the model. */
function line(item: Item): string {
  const parts = [
    `${item.path}`,
    kindLabel(item.kind),
    `"${item.title}"`,
    [authorsShort(item.authors), item.year].filter(Boolean).join(" "),
    item.status ? statusLabel(item.status) : "",
    item.tags.length ? `tags: ${item.tags.join(", ")}` : "",
    item.file && isReadable(item.file) ? "has text" : "no text",
  ];
  return parts.filter(Boolean).join(" | ");
}

/** The source as a quote card names it: "Santamouris · 2014 · p. 12". */
export function sourceLabel(item: Item, page: number | null, unit: "page" | "chapter") {
  const place =
    page === null
      ? ""
      : unit === "chapter"
        ? t("ch. {n}", { n: page })
        : t("p. {n}", { n: page });
  return [authorsShort(item.authors) || item.title, item.year, place]
    .filter(Boolean)
    .join(" · ");
}

const numberArg = (args: ToolArgs, name: string): number | null => {
  const value = args[name];
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && value !== null && value !== "" ? Math.round(n) : null;
};

const listArg = (args: ToolArgs, name: string): string[] | null => {
  const value = args[name];
  if (Array.isArray(value))
    return value
      .map(String)
      .map((v) => v.trim())
      .filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[;,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  return null;
};

export function binderKit(host: BinderHost, numbers: Numbering): Toolkit<BinderCard> {
  // Passages of each source, worked out once per text.
  const passages = new WeakMap<string[], Passage[]>();
  const passagesOfItem = async (item: Item): Promise<Passage[] | null> => {
    const pages = await host.pagesOf(item);
    if (!pages || !item.file) return null;
    let found = passages.get(pages);
    if (!found) {
      found = passagesOf(pages, isPaged(item.file));
      passages.set(pages, found);
    }
    return found;
  };
  const unitOf = (item: Item) =>
    item.file && /\.epub$/i.test(item.file) ? "chapter" : "page";

  /** The item at a path the model gave, when the assistant may look at it. */
  const itemAt = (args: ToolArgs): Item => {
    const path = stringArg(args, "path")?.trim() ?? "";
    const item = host.items().find((entry) => entry.path === path);
    if (!item || !host.allowed(item))
      throw new Error(
        `No item at "${path}" that the assistant may read. Use list_items for the paths.`,
      );
    return item;
  };

  const card = () => ++numbers.cards;

  const titleOf = (args: ToolArgs) => {
    const path = stringArg(args, "path");
    return host.items().find((entry) => entry.path === path)?.title ?? path ?? "";
  };

  const tools: Tool<BinderCard>[] = [
    {
      name: "list_items",
      description:
        "Lists the binder's items: path, kind, title, authors and year, status, tags and whether its source has text to read. Narrow it with a view, a tag or words in the title, authors or notes.",
      parameters: objectOf({
        view: {
          type: "string",
          enum: ["all", "inbox", "reading", "notes"],
          description:
            "inbox: just added; reading: the reading list; notes: your own notes and thoughts; all: everything (default).",
        },
        tag: str("Only items with this tag."),
        words: str("Only items with all these words in the title, authors or notes."),
      }),
      kind: "read",
      run: async (args) => {
        const view = stringArg(args, "view") ?? "all";
        const tag = stringArg(args, "tag")?.trim().toLowerCase();
        const words = (stringArg(args, "words") ?? "")
          .toLowerCase()
          .split(/\s+/)
          .filter(Boolean);
        const shown = host
          .items()
          .filter(host.allowed)
          .filter((item) =>
            view === "inbox"
              ? item.status === "inbox"
              : view === "reading"
                ? item.status !== null && item.status !== "inbox"
                : view === "notes"
                  ? isOwnWriting(item.kind)
                  : true,
          )
          .filter((item) => !tag || item.tags.some((t) => t.toLowerCase() === tag))
          .filter((item) => {
            const text =
              `${item.title} ${item.authors.join(" ")} ${item.markdown}`.toLowerCase();
            return words.every((word) => text.includes(word));
          });
        if (!shown.length) return "No items match.";
        const lines = shown.map(line);
        let out = "";
        for (const [i, text] of lines.entries()) {
          if (out.length + text.length > ROOM) {
            out += `…and ${lines.length - i} more. Narrow the list.`;
            break;
          }
          out += `${text}\n`;
        }
        return out.trim();
      },
      describe: (_args, result) =>
        result.startsWith("No items")
          ? t("Listed the items: none match")
          : t("Listed the items"),
    },
    {
      name: "read_item",
      description:
        "Reads one item: its properties, your notes on it and your highlights in its source.",
      parameters: objectOf({ path: str("The item's path, from list_items.") }, [
        "path",
      ]),
      kind: "read",
      run: async (args) => {
        const item = itemAt(args);
        const properties = [
          `Title: ${item.title}`,
          `Kind: ${kindLabel(item.kind)}`,
          item.authors.length ? `Authors: ${item.authors.join("; ")}` : "",
          item.year ? `Year: ${item.year}` : "",
          item.publishedIn ? `Published in: ${item.publishedIn}` : "",
          item.publisher ? `Publisher: ${item.publisher}` : "",
          item.doi ? `DOI: ${item.doi}` : "",
          item.arxiv ? `arXiv: ${item.arxiv}` : "",
          item.pmid ? `PubMed: ${item.pmid}` : "",
          item.isbn ? `ISBN: ${item.isbn}` : "",
          item.url ? `URL: ${item.url}` : "",
          item.status ? `Status: ${statusLabel(item.status)}` : "",
          item.tags.length ? `Tags: ${item.tags.join(", ")}` : "",
          `Source text: ${item.file && isReadable(item.file) ? "yes" : "none"}`,
        ].filter(Boolean);
        const highlights = host
          .highlights(item.path)
          .map(
            (h) =>
              `- (${h.category}${h.page !== null ? `, ${unitOf(item)} ${h.page}` : ""}) ${h.text}`,
          );
        const notes = item.markdown.trim();
        let out = `${properties.join("\n")}\n\nNotes:\n${notes || "(none)"}`;
        if (highlights.length) out += `\n\nHighlights:\n${highlights.join("\n")}`;
        return out.length > ROOM ? `${out.slice(0, ROOM)}\n[cut]` : out;
      },
      describe: (args) => t("Read “{title}”", { title: titleOf(args) }),
    },
    {
      name: "search_sources",
      description:
        "Finds the passages about a question in the text of the sources (PDFs, EPUBs and kept web pages), the best first. Search all sources, or only some.",
      parameters: objectOf(
        {
          query: str("Words to look for: the question's key terms."),
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Only these items' sources. Leave it out to search them all.",
          },
        },
        ["query"],
      ),
      kind: "read",
      run: async (args) => {
        const query = stringArg(args, "query") ?? "";
        const only = listArg(args, "paths");
        const sources = host
          .items()
          .filter(host.allowed)
          .filter((item) => item.file && isReadable(item.file))
          .filter((item) => !only || only.includes(item.path));
        const all: Array<{ item: Item; passage: Passage }> = [];
        for (const item of sources) {
          for (const passage of (await passagesOfItem(item)) ?? [])
            all.push({ item, passage });
        }
        if (!all.length) return "No source has text to search.";
        // One index over every passage: numbers stay each source's own.
        const index = new PassageIndex(
          all.map((entry, i) => ({ ...entry.passage, n: i })),
        );
        const found = index.search(query, FOUND);
        if (!found.length)
          return `No passage matches "${query}" in ${sources.length} sources.`;
        const out = found.map(({ n }) => {
          const { item, passage } = all[n];
          const place =
            passage.page === null ? "" : `, ${unitOf(item)} ${passage.page}`;
          return `[${item.path}] "${item.title}" (${sourceLabel(item, null, "page")})${place}, passage ${passage.n}:\n${passage.text}`;
        });
        return `Searched ${sources.length} sources.\n\n${out.join("\n\n")}`;
      },
      describe: (_args, result) => {
        const searched = /^Searched (\d+) sources/.exec(result);
        return searched
          ? tn(
              Number(searched[1]),
              "Searched {count} source",
              "Searched {count} sources",
            )
          : t("Searched the sources");
      },
    },
    {
      name: "read_source",
      description:
        "Reads the text of an item's source, by page (an EPUB by chapter), as numbered passages. Read a few pages at a time.",
      parameters: objectOf(
        {
          path: str("The item's path."),
          from: int("The first page or chapter, from 1."),
          to: int("The last page or chapter."),
        },
        ["path"],
      ),
      kind: "read",
      run: async (args) => {
        const item = itemAt(args);
        const all = await passagesOfItem(item);
        if (!all) return `"${item.title}" has no source text.`;
        const from = numberArg(args, "from") ?? 1;
        const to = numberArg(args, "to") ?? Number.MAX_SAFE_INTEGER;
        const shown = all.filter(
          (p) => p.page === null || (p.page >= from && p.page <= to),
        );
        let out = "";
        for (const passage of shown) {
          const head =
            passage.page === null
              ? `Passage ${passage.n}`
              : `${unitOf(item)} ${passage.page}, passage ${passage.n}`;
          const text = `${head}:\n${passage.text}\n\n`;
          if (out.length + text.length > ROOM) {
            const last = passage.page ?? 0;
            out += `[cut: read on from ${unitOf(item)} ${last}]`;
            break;
          }
          out += text;
        }
        const pages = all.reduce((n, p) => Math.max(n, p.page ?? 0), 0);
        return `"${item.title}"${pages ? `, ${pages} ${unitOf(item)}s` : ""}.\n\n${out.trim() || "Nothing on those pages."}`;
      },
      describe: (args) => {
        const from = numberArg(args, "from");
        return from === null
          ? t("Read the source of “{title}”", { title: titleOf(args) })
          : t("Read “{title}” from page {page}", { title: titleOf(args), page: from });
      },
    },
    {
      name: "quote",
      description:
        "Checks a quote against an item's source, word for word, before you use it. Gives the number to cite it by, as [n] after the statement it backs. Quote 5 to 25 words exactly as the source has them.",
      parameters: objectOf(
        {
          path: str("The item's path."),
          quote: str("The words, copied exactly from a passage."),
          passage: int("The passage's number, from search_sources or read_source."),
        },
        ["path", "quote"],
      ),
      kind: "read",
      run: async (args) => {
        const item = itemAt(args);
        const quote = (stringArg(args, "quote") ?? "").trim();
        const all = await passagesOfItem(item);
        if (!all) return `"${item.title}" has no source text to quote.`;
        const found = findQuote(all, quote, numberArg(args, "passage") ?? undefined);
        if (!found)
          return `Not found word for word in "${item.title}". Don't use this quote: read the passage again and copy its words exactly.`;
        // A quote cited before keeps its number, and shows again under this answer.
        const known = numbers.quotes.find(
          (q) => q.path === item.path && q.quote === quote,
        );
        const n = known?.n ?? numbers.quotes.length + 1;
        if (!known) numbers.quotes.push({ path: item.path, quote, n });
        return {
          result: `Checked. Cite it as [${n}].`,
          attachment: {
            type: "quote",
            n,
            path: item.path,
            source: sourceLabel(item, found.page, unitOf(item)),
            page: found.page,
            quote,
          },
        };
      },
      describe: (_args, result) =>
        result.startsWith("Checked")
          ? t("Checked a quote")
          : t("A quote wasn't in the source"),
    },
    {
      name: "propose_properties",
      description:
        "Proposes new properties for an item, as a card the user accepts or dismisses. Give only the properties that change.",
      parameters: objectOf(
        {
          path: str("The item's path."),
          kind: { type: "string", enum: KIND_IDS },
          title: str("The title."),
          authors: {
            type: "array",
            items: { type: "string" },
            description: 'As "Family, Given".',
          },
          year: str("The year."),
          published_in: str("The journal, the book or the website."),
          publisher: str("The publisher."),
          doi: str("The DOI."),
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags to add. Prefer tags the binder uses.",
          },
        },
        ["path"],
      ),
      kind: "propose",
      run: async (args) => {
        const item = itemAt(args);
        const changes: PropertyChange[] = [];
        const set = (
          field: PropertyChange["field"],
          before: string,
          after: string | null,
        ) => {
          if (after !== null && after.trim() && after.trim() !== before)
            changes.push({ field, before, after: after.trim() });
        };
        const kind = stringArg(args, "kind");
        if (kind && (KIND_IDS as string[]).includes(kind))
          set("kind", item.kind, kind as Kind);
        set("title", item.title, stringArg(args, "title"));
        const authors = listArg(args, "authors");
        if (authors?.length)
          set("authors", item.authors.join("; "), authors.join("; "));
        set("year", item.year, stringArg(args, "year"));
        set("publishedIn", item.publishedIn, stringArg(args, "published_in"));
        set("publisher", item.publisher, stringArg(args, "publisher"));
        set("doi", item.doi, stringArg(args, "doi"));
        const tags = (listArg(args, "tags") ?? []).filter(
          (tag) => !item.tags.includes(tag),
        );
        if (tags.length)
          changes.push({ field: "tags", before: "", after: tags.join(", ") });
        if (!changes.length) return "Nothing to change: the item has these properties.";
        const id = card();
        return {
          result: `Proposed as card ${id}. The user accepts or dismisses it.`,
          attachment: {
            type: "properties",
            id,
            path: item.path,
            title: item.title,
            changes,
          },
        };
      },
      describe: (args) =>
        t("Proposed properties for “{title}”", { title: titleOf(args) }),
    },
    {
      name: "propose_note",
      description:
        "Proposes a new note in the binder, as a card the user saves or dismisses: a summary, a comparison of sources, an outline. Keep the [n] citations in it.",
      parameters: objectOf(
        {
          title: str("The note's title."),
          markdown: str("The note, in Markdown."),
        },
        ["title", "markdown"],
      ),
      kind: "propose",
      run: async (args) => {
        const title = (stringArg(args, "title") ?? "").trim() || t("Untitled");
        const markdown = (stringArg(args, "markdown") ?? "").trim();
        if (!markdown) return "The note is empty.";
        const id = card();
        return {
          result: `Proposed as card ${id}. The user saves or dismisses it.`,
          attachment: { type: "note", id, title, markdown: `${markdown}\n` },
        };
      },
      describe: (args) =>
        t("Proposed a note: {title}", { title: stringArg(args, "title") ?? "" }),
    },
    {
      name: "propose_highlights",
      description:
        "Proposes highlights in an item's source, as a card the user keeps or dismisses. Each is a quote copied word for word, which is checked against the source.",
      parameters: objectOf(
        {
          path: str("The item's path."),
          highlights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                quote: str("The words, copied exactly, 5 to 40 words."),
                passage: int("The passage's number."),
                category: {
                  type: "string",
                  enum: CATEGORIES.map((c) => c.id),
                },
              },
              required: ["quote", "category"],
            },
          },
        },
        ["path", "highlights"],
      ),
      kind: "propose",
      run: async (args) => {
        const item = itemAt(args);
        const all = await passagesOfItem(item);
        if (!all) return `"${item.title}" has no source text to highlight.`;
        const asked = Array.isArray(args.highlights)
          ? (args.highlights as Array<Record<string, unknown>>)
          : [];
        const taken = new Set(host.highlights(item.path).map((h) => h.text));
        const kept: Array<Omit<Highlight, "id">> = [];
        let missed = 0;
        for (const entry of asked) {
          const quote = typeof entry.quote === "string" ? entry.quote.trim() : "";
          const found = findQuote(all, quote, numberArg(entry, "passage") ?? undefined);
          if (!found) {
            missed++;
            continue;
          }
          const category = CATEGORIES.some((c) => c.id === entry.category)
            ? (entry.category as Category)
            : "quote";
          if (taken.has(quote)) continue;
          taken.add(quote);
          kept.push({ category, page: found.page, text: quote });
        }
        if (!kept.length)
          return missed
            ? "None of the quotes is in the source word for word. Copy them exactly."
            : "The source has these highlights already.";
        const id = card();
        return {
          result:
            `Proposed ${kept.length} highlights as card ${id}.` +
            (missed
              ? ` ${missed} were left out: not in the source word for word.`
              : ""),
          attachment: {
            type: "highlights",
            id,
            path: item.path,
            title: item.title,
            highlights: kept,
          },
        };
      },
      describe: (args) =>
        t("Proposed highlights in “{title}”", { title: titleOf(args) }),
    },
    {
      name: "read_in_background",
      description:
        "Proposes to read sources in the background, as a card the user starts: for each it proposes properties, a summary for the research question, what to read closely and highlights, next to the item. For many sources at once, such as the inbox.",
      parameters: objectOf(
        {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "The items to read.",
          },
        },
        ["paths"],
      ),
      kind: "propose",
      run: async (args) => {
        const paths = listArg(args, "paths") ?? [];
        const items = host
          .items()
          .filter((item) => paths.includes(item.path) && host.canRead(item));
        if (!items.length)
          return "None of these can be read in the background: they have no source text, or the assistant is kept away.";
        const id = card();
        return {
          result: `Proposed reading ${items.length} sources as card ${id}. The user starts it.`,
          attachment: {
            type: "reading",
            id,
            paths: items.map((item) => item.path),
            titles: items.map((item) => item.title),
          },
        };
      },
      describe: () => t("Proposed reading in the background"),
    },
  ];

  if (host.searchPapers) {
    const search = host.searchPapers;
    tools.push({
      name: "find_papers",
      description:
        "Finds papers by their title, authors or topic words, through Scholarkit's server (OpenAlex). Shows them as cards the user can add to the binder.",
      parameters: objectOf({ query: str("Title words, authors or a topic.") }, [
        "query",
      ]),
      kind: "propose",
      run: async (args) => {
        const query = stringArg(args, "query") ?? "";
        const found = await search(query);
        const papers = found.works.slice(0, 5);
        if (!papers.length) return `No papers found for "${query}".`;
        const list = papers.map((paper, i) => {
          const there = host
            .items()
            .some(
              (item) =>
                (paper.doi && item.doi.toLowerCase() === paper.doi.toLowerCase()) ||
                item.title.toLowerCase() === paper.title.toLowerCase(),
            );
          return `${i + 1}. "${paper.title}" (${authorsShort(paper.author)} ${paper.year})${paper.container ? `, ${paper.container}` : ""}${paper.doi ? `, DOI ${paper.doi}` : ""}${there ? " (in the binder already)" : ""}`;
        });
        const id = card();
        return {
          result: `Shown as card ${id}, where the user can add them:\n${list.join("\n")}`,
          attachment: { type: "papers", id, papers },
        };
      },
      describe: (args) =>
        t("Searched papers for “{query}”", { query: stringArg(args, "query") ?? "" }),
    });
  }

  if (host.lookUp) {
    const lookUp = host.lookUp;
    tools.push({
      name: "look_up_work",
      description:
        "Looks an item up by its DOI, arXiv or PubMed ID through Scholarkit's server, to fill missing or wrong properties. Then propose them with propose_properties.",
      parameters: objectOf({ path: str("The item's path.") }, ["path"]),
      kind: "read",
      run: async (args) => {
        const item = itemAt(args);
        const id: ["doi" | "arxiv" | "pubmed", string] | null = item.doi
          ? ["doi", item.doi]
          : item.arxiv
            ? ["arxiv", item.arxiv]
            : item.pmid
              ? ["pubmed", item.pmid]
              : null;
        if (!id) return `"${item.title}" has no DOI, arXiv or PubMed ID to look up.`;
        const work = await lookUp(id[0], id[1]);
        if (!work) return `No work found for ${id[0]} ${id[1]}.`;
        const found = itemOfReference(work);
        return [
          `Found for ${id[0]} ${id[1]}:`,
          `Title: ${found.title}`,
          `Kind: ${found.kind}`,
          found.authors?.length ? `Authors: ${found.authors.join("; ")}` : "",
          found.year ? `Year: ${found.year}` : "",
          found.publishedIn ? `Published in: ${found.publishedIn}` : "",
          found.publisher ? `Publisher: ${found.publisher}` : "",
          found.doi ? `DOI: ${found.doi}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      },
      describe: (args) => t("Looked up “{title}”", { title: titleOf(args) }),
    });
  }

  if (host.freePdfs) {
    const freePdfs = host.freePdfs;
    tools.push({
      name: "find_free_pdf",
      description:
        "Looks for a free PDF of an item by its DOI, through Scholarkit's server (Unpaywall). Shows a card the user can save it to the item with.",
      parameters: objectOf({ path: str("The item's path.") }, ["path"]),
      kind: "propose",
      run: async (args) => {
        const item = itemAt(args);
        if (item.file) return `"${item.title}" has a file already.`;
        if (!item.doi) return `"${item.title}" has no DOI to look for a free PDF by.`;
        const links = await freePdfs(item.doi);
        if (!links.length) return `No free PDF is known for "${item.title}".`;
        const id = card();
        return {
          result: `Found a free PDF. Shown as card ${id}; the user saves it to the item.`,
          attachment: {
            type: "pdf",
            id,
            path: item.path,
            title: item.title,
            doi: item.doi,
          },
        };
      },
      describe: (args) =>
        t("Looked for a free PDF of “{title}”", { title: titleOf(args) }),
    });
  }

  return toolkit(tools);
}

/** The step running now, as the person reads it. */
export function describeStart(tool: string): string {
  switch (tool) {
    case "list_items":
      return t("Listing the items…");
    case "read_item":
      return t("Reading an item…");
    case "search_sources":
      return t("Searching your sources…");
    case "read_source":
      return t("Reading a source…");
    case "quote":
      return t("Checking a quote…");
    case "find_papers":
      return t("Searching papers…");
    case "look_up_work":
      return t("Looking it up…");
    case "find_free_pdf":
      return t("Looking for a free PDF…");
    default:
      return t("Working…");
  }
}

/** What the assistant is and how it works in Binder. */
export function systemPrompt(question: string, papers: boolean): string {
  return `You are the assistant in Binder, where a researcher keeps the sources of a research project: articles, books, web pages, with their notes and highlights.${question ? ` The research question is: "${question}"` : ""}

How you work:
- Answer from the user's sources. Find passages with search_sources or read_source, then check each quote with the quote tool before you use it, and cite it as [n] right after the statement it backs, with the number the tool gave. Never make up a number, and never cite a quote the tool didn't check.
- When the sources don't say something, say so. Don't fill in from what you know elsewhere, unless the user asks; then say that it isn't from their sources.
- You change nothing yourself. Properties, notes, highlights, papers, free PDFs and background reading are cards the user accepts. Propose them when they help, and say in one sentence what the card does.${papers ? "\n- To find new papers use find_papers; to fill an item's properties, look_up_work then propose_properties." : ""}
- Item paths come from list_items. Some items are kept away from you; they don't show.
- Write plainly, in short sentences, in the user's language. Keep answers short: a few sentences or a short list.`;
}

/** What the next question carries: the open item, a selection in its source. */
export interface AskContext {
  item: Item | null;
  selection: { text: string; page: number | null } | null;
}

/** The user's question as the model reads it, with what it is about. */
export function userMessage(question: string, context: AskContext): string {
  const about: string[] = [];
  if (context.item)
    about.push(
      `The user has "${context.item.title}" open (path: ${context.item.path}).`,
    );
  if (context.selection)
    about.push(
      `They selected this in its source${context.selection.page !== null ? ` on page ${context.selection.page}` : ""}: "${context.selection.text}"`,
    );
  return about.length ? `${about.join(" ")}\n\n${question}` : question;
}
