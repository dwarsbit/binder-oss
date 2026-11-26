import { strFromU8, unzipSync, type Unzipped } from "fflate";
import { KEEP } from "./webpage";

/**
 * An EPUB, read in the app: its chapters in reading order, its table of
 * contents and what it says about itself. The reader shows one chapter at
 * a time, and a chapter is to an EPUB what a page is to a PDF: highlights
 * and links count chapters from 1, in the order of the book's spine.
 */

export interface EpubChapter {
  /** The chapter's file in the book. */
  path: string;
  /** Its title from the table of contents, or its first heading; empty when it has none. */
  title: string;
}

export interface EpubContentsEntry {
  title: string;
  /** The chapter it opens, from 1. */
  chapter: number;
  /** How deep it sits in the table of contents, from 0. */
  depth: number;
}

export interface EpubBook {
  title: string;
  /** The authors as the book names them, usually “Given Family”. */
  authors: string[];
  publisher: string;
  year: string;
  isbn: string;
  language: string;
  chapters: EpubChapter[];
  contents: EpubContentsEntry[];
  /** The book's files, by path. */
  files: Unzipped;
}

/** Why an EPUB can't be opened. */
export class EpubError extends Error {
  constructor(
    readonly reason: "locked" | "broken",
    message: string,
  ) {
    super(message);
  }
}

const XML = "application/xml";

const parseXml = (text: string) => new DOMParser().parseFromString(text, XML);

/** Elements by their local name, whatever their namespace prefix. */
const byName = (root: Document | Element, name: string): Element[] =>
  [...root.getElementsByTagName("*")].filter((element) => element.localName === name);

const textOf = (element: Element | undefined) =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

/** The folder of a path in the book, with a slash, or empty at the top. */
const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

/** A path in the book from an href in a file at `from`; null when it leads out of the book. */
export function resolvePath(from: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/")) return null;
  const parts = folderOf(from).split("/").filter(Boolean);
  for (const raw of href.split("#")[0].split("/")) {
    let part: string;
    try {
      part = decodeURIComponent(raw);
    } catch {
      part = raw;
    }
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

/** A file of the book as text; empty when it isn't there. */
const fileText = (files: Unzipped, path: string) =>
  files[path] ? strFromU8(files[path]) : "";

/**
 * Whether the book's text is encrypted. A font may be: books obfuscate
 * the fonts they embed, which hides nothing of the text.
 */
function isLocked(files: Unzipped): boolean {
  const source = fileText(files, "META-INF/encryption.xml");
  if (!source) return Boolean(files["META-INF/rights.xml"]);
  const doc = parseXml(source);
  return byName(doc, "CipherReference").some((reference) => {
    const uri = reference.getAttribute("URI") ?? "";
    return !/\.(ttf|otf|woff2?)$/i.test(uri);
  });
}

/** The table of contents of an EPUB 3 book, from its navigation document. */
function navContents(
  files: Unzipped,
  navPath: string,
): Array<[string, string, number]> {
  const source = fileText(files, navPath);
  if (!source) return [];
  const doc = new DOMParser().parseFromString(source, "text/html");
  const nav =
    [...doc.querySelectorAll("nav")].find((element) =>
      /\btoc\b/.test(
        `${element.getAttribute("epub:type") ?? ""} ${element.getAttribute("role") ?? ""} ${element.id}`,
      ),
    ) ?? doc.querySelector("nav");
  const list = nav?.querySelector("ol, ul");
  if (!list) return [];
  const entries: Array<[string, string, number]> = [];
  const walk = (ol: Element, depth: number) => {
    for (const li of ol.children) {
      if (li.localName !== "li") continue;
      const link = li.querySelector(":scope > a, :scope > span > a");
      const href = link?.getAttribute("href");
      const title = textOf(link ?? li.querySelector(":scope > span") ?? undefined);
      if (href && title) {
        const path = resolvePath(navPath, href);
        if (path) entries.push([path, title, depth]);
      }
      const nested = li.querySelector(":scope > ol, :scope > ul");
      if (nested) walk(nested, depth + 1);
    }
  };
  walk(list, 0);
  return entries;
}

/** The table of contents of an EPUB 2 book, from its NCX file. */
function ncxContents(
  files: Unzipped,
  ncxPath: string,
): Array<[string, string, number]> {
  const source = fileText(files, ncxPath);
  if (!source) return [];
  const doc = parseXml(source);
  const map = byName(doc, "navMap")[0];
  if (!map) return [];
  const entries: Array<[string, string, number]> = [];
  const walk = (parent: Element, depth: number) => {
    for (const point of parent.children) {
      if (point.localName !== "navPoint") continue;
      const label = textOf(byName(point, "text")[0]);
      const src = byName(point, "content")[0]?.getAttribute("src");
      const path = src ? resolvePath(ncxPath, src) : null;
      if (label && path) entries.push([path, label, depth]);
      walk(point, depth + 1);
    }
  };
  walk(map, 0);
  return entries;
}

/** The first heading of a chapter, for one the table of contents leaves out. */
function headingOf(source: string): string {
  const doc = new DOMParser().parseFromString(source, "text/html");
  return textOf(doc.querySelector("h1, h2, h3") ?? undefined).slice(0, 120);
}

/** The year in a date such as “2018-03-01”. */
const yearOf = (date: string) => /\b(1[5-9]\d\d|20\d\d)\b/.exec(date)?.[1] ?? "";

/** An ISBN among the book's identifiers, without hyphens. */
function isbnOf(identifiers: string[]): string {
  for (const raw of identifiers) {
    const digits = raw.replace(/^urn:isbn:/i, "").replace(/[\s-]/g, "");
    if (/^(97[89]\d{10}|\d{9}[\dXx])$/.test(digits)) return digits.toUpperCase();
  }
  return "";
}

/** Opens an EPUB from its bytes. Throws an EpubError when it can't. */
export function openEpub(bytes: ArrayBuffer): EpubBook {
  let files: Unzipped;
  try {
    files = unzipSync(new Uint8Array(bytes));
  } catch {
    throw new EpubError("broken", "not a zip");
  }
  if (isLocked(files)) throw new EpubError("locked", "encrypted");
  const container = parseXml(fileText(files, "META-INF/container.xml"));
  const opfPath = byName(container, "rootfile")[0]?.getAttribute("full-path");
  const opfSource = opfPath ? fileText(files, opfPath) : "";
  if (!opfPath || !opfSource) throw new EpubError("broken", "no package");
  const opf = parseXml(opfSource);

  const manifest = new Map<
    string,
    { path: string; type: string; properties: string }
  >();
  for (const item of byName(opf, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const path = href ? resolvePath(opfPath, href) : null;
    if (id && path)
      manifest.set(id, {
        path,
        type: item.getAttribute("media-type") ?? "",
        properties: item.getAttribute("properties") ?? "",
      });
  }
  const spine = byName(opf, "spine")[0];
  const chapterPaths = byName(opf, "itemref")
    .filter((ref) => ref.getAttribute("linear") !== "no")
    .map((ref) => manifest.get(ref.getAttribute("idref") ?? "")?.path)
    .filter((path): path is string => Boolean(path && files[path]));
  if (!chapterPaths.length) throw new EpubError("broken", "no chapters");

  const nav = [...manifest.values()].find((item) =>
    item.properties.split(/\s+/).includes("nav"),
  );
  const ncx =
    manifest.get(spine?.getAttribute("toc") ?? "") ??
    [...manifest.values()].find((item) => item.type === "application/x-dtbncx+xml");
  let entries = nav ? navContents(files, nav.path) : [];
  if (!entries.length && ncx) entries = ncxContents(files, ncx.path);

  const chapterOf = new Map(chapterPaths.map((path, i) => [path, i + 1]));
  const contents: EpubContentsEntry[] = [];
  for (const [path, title, depth] of entries) {
    const chapter = chapterOf.get(path);
    if (chapter) contents.push({ title, chapter, depth });
  }
  const chapters = chapterPaths.map((path, i) => ({
    path,
    title:
      contents.find((entry) => entry.chapter === i + 1)?.title ??
      headingOf(fileText(files, path)),
  }));

  const meta = (name: string) => byName(opf, name).map(textOf).filter(Boolean);
  return {
    title: meta("title")[0] ?? "",
    authors: meta("creator"),
    publisher: meta("publisher")[0] ?? "",
    year: yearOf(meta("date")[0] ?? ""),
    isbn: isbnOf(meta("identifier")),
    language: meta("language")[0] ?? "",
    chapters,
    contents,
    files,
  };
}

/** Images a chapter may show, by their extension. */
const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export interface ChapterLinks {
  /** An address for an image of the book, such as a blob: URL; null leaves it out. */
  image: (path: string, type: string) => string | null;
}

/**
 * A copy of `node` with only the elements a chapter keeps: the text's
 * structure, its images, and links that say where they go.
 */
function clean(
  node: Node,
  doc: Document,
  book: EpubBook,
  from: string,
  links: ChapterLinks,
): Node[] {
  if (node.nodeType === 3) return [doc.createTextNode(node.textContent ?? "")];
  if (node.nodeType !== 1) return [];
  const element = node as Element;
  const name = element.localName.toLowerCase();
  if (
    [
      "script",
      "style",
      "template",
      "iframe",
      "object",
      "embed",
      "form",
      "head",
    ].includes(name)
  )
    return [];
  if (name === "img" || name === "image") {
    const href =
      element.getAttribute("src") ??
      element.getAttribute("href") ??
      element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
      "";
    const path = resolvePath(from, href);
    const type = IMAGE_TYPES[(path ?? "").split(".").pop()?.toLowerCase() ?? ""];
    const url = path && type && book.files[path] ? links.image(path, type) : null;
    if (!url) return [];
    const img = doc.createElement("img");
    img.setAttribute("src", url);
    img.setAttribute("alt", element.getAttribute("alt") ?? "");
    return [img];
  }
  const children = [...element.childNodes].flatMap((child) =>
    clean(child, doc, book, from, links),
  );
  if (name === "svg") return children.filter((child) => child.nodeName === "IMG");
  if (!KEEP.has(name)) {
    // A block that isn't kept still breaks the text, as on screen.
    if (
      ["div", "section", "aside", "header", "footer", "nav"].includes(name) &&
      children.length
    ) {
      const block = doc.createElement("div");
      block.append(...children);
      return [block];
    }
    return children;
  }
  const copy = doc.createElement(name);
  if (name === "a") {
    const href = element.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) {
      copy.setAttribute("href", href);
    } else {
      const path = resolvePath(from, href);
      const chapter = path ? book.chapters.findIndex((c) => c.path === path) + 1 : 0;
      if (chapter > 0) copy.setAttribute("data-chapter", String(chapter));
    }
  }
  for (const attribute of ["colspan", "rowspan", "start"]) {
    const value = element.getAttribute(attribute);
    if (value && /^\d+$/.test(value)) copy.setAttribute(attribute, value);
  }
  copy.append(...children);
  return [copy];
}

/** The body of a chapter's file, parsed as XHTML, or as HTML when it isn't well formed. */
function bodyOf(source: string): Element | null {
  const xhtml = new DOMParser().parseFromString(source, "application/xhtml+xml");
  if (!xhtml.getElementsByTagName("parsererror").length) {
    const body = byName(xhtml, "body")[0];
    if (body) return body;
  }
  return new DOMParser().parseFromString(source, "text/html").body;
}

/** A chapter, as HTML to show: its text, headings, lists, tables, notes and images. */
export function chapterHtml(
  book: EpubBook,
  chapter: number,
  links: ChapterLinks,
): string {
  const entry = book.chapters[chapter - 1];
  if (!entry) return "";
  const body = bodyOf(fileText(book.files, entry.path));
  if (!body) return "";
  const out = document.implementation.createHTMLDocument("");
  const article = out.createElement("article");
  article.append(
    ...[...body.childNodes].flatMap((child) =>
      clean(child, out, book, entry.path, links),
    ),
  );
  return article.innerHTML;
}

/** The text of every chapter, for search and the assistant; a block ends in a line break. */
export function chapterTexts(book: EpubBook): string[] {
  return book.chapters.map((entry) => {
    const body = bodyOf(fileText(book.files, entry.path));
    if (!body) return "";
    const doc = body.ownerDocument;
    const copy = doc.importNode(body, true) as Element;
    for (const element of [...copy.getElementsByTagName("*")]) {
      const name = element.localName;
      if (["script", "style", "head"].includes(name)) element.remove();
      else if (
        [
          "p",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "blockquote",
          "pre",
          "tr",
          "dt",
          "dd",
          "figcaption",
          "br",
          "div",
        ].includes(name)
      )
        element.append(doc.createTextNode("\n"));
    }
    return copy.textContent ?? "";
  });
}

/** The authors as Binder writes them, “Family, Given”, from names such as “Mira de Boer”. */
export function authorsOf(book: EpubBook): string[] {
  return book.authors.map((name) => {
    if (name.includes(",")) return name;
    const words = name.split(/\s+/);
    if (words.length < 2) return name;
    // Particles such as “de”, “van der” and “von” go with the family name.
    let at = words.length - 1;
    while (
      at > 1 &&
      /^(de|der|den|van|von|da|di|du|la|le|del|della|ten|ter)$/i.test(words[at - 1])
    )
      at--;
    return `${words.slice(at).join(" ")}, ${words.slice(0, at).join(" ")}`;
  });
}
