import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  ListTree,
  ScanText,
  Search,
  Sparkles,
  TextQuote,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@scholarkit/editor/lib/cn";
import { openExternal } from "@scholarkit/editor/lib/platform";
import { boxesOf, rangeOf, textMap } from "@/lib/dom-text";
import {
  CATEGORIES,
  categoryLabel,
  oneLine,
  placeMark,
  unitOf,
  type Category,
  type Highlight,
  type Unit,
} from "@/lib/highlights";
import {
  chapterHtml,
  chapterTexts,
  EpubError,
  openEpub,
  type EpubContentsEntry,
} from "@/lib/epub";
import {
  defaultTextLanguages,
  RecognizeError,
  recognizeText,
  scanStateOf,
  TEXT_LANGUAGES,
  textLanguagesLabel,
  type Recognizing,
  type ScanState,
} from "@/lib/ocr";
import { openPdf, pageText, type PdfDocument } from "@/lib/pdf";
import { loadTextLanguages, saveTextLanguages } from "@/lib/prefs";
import { htmlPages, isEpub, isPaged, isPdf, matchesIn } from "@/lib/text";
import { keptArticle } from "@/lib/webpage";
import { t } from "@scholarkit/i18n";

/** Where the reader goes: a page, a highlight, a passage, or a text to find. */
export interface ReaderTarget {
  page: number | null;
  highlight: string | null;
  find: string | null;
  /** The words of a passage, from a link the assistant wrote. */
  passage: string | null;
  /** Counts the requests: the same place asked for twice is gone to twice. */
  nonce: number;
}

/** What is found in the source: the query, and the match shown. */
interface Finding {
  query: string;
  /** The page of the match shown, and which match on that page it is. */
  page: number | null;
  nth: number;
}

/** A place to scroll to once its page is drawn. */
interface Pending {
  page: number | null;
  highlight: string | null;
  find: boolean;
}
/** A place asked for: each request has its own id, and is gone to once. */
type Request = Pending & { id: number };

/** Scrolls an element; outside the components, which only read the DOM. */
const scrollElement = (element: Element, top: number) => {
  element.scrollTop = top;
};

const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
/** The widest a page is drawn at 100%, in CSS pixels. */
const FIT_MAX = 860;

/** A highlight as drawn: a class of its own for proposed highlights and passages. */
type Marked = Highlight & { className?: string };

/** The id a passage from a link is drawn under. */
const PASSAGE = "passage";
/** Proposed highlights are drawn under their id with this before it. */
const PROPOSED = "proposed:";

/** Draws the highlights and what is found on one page of the source. */
function paintMarks(
  page: Element,
  textRoot: Element,
  highlights: Marked[],
  finding: Finding | null,
  pageNumber: number | null,
) {
  let layer = page.querySelector(":scope > .marks");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "marks";
    page.prepend(layer);
    // Under the text, over the drawn page.
    const canvas = page.querySelector(":scope > canvas");
    if (canvas) canvas.after(layer);
  }
  layer.replaceChildren();
  const map = textMap(textRoot);
  const add = (range: Range | null, className: string, id?: string) => {
    if (!range) return;
    boxesOf(range, page).forEach((box) => {
      const mark = document.createElement("div");
      mark.className = className;
      mark.style.left = `${box.left}px`;
      mark.style.top = `${box.top}px`;
      mark.style.width = `${box.width}px`;
      mark.style.height = `${box.height}px`;
      if (id) mark.dataset.highlight = id;
      layer.append(mark);
    });
  };
  for (const highlight of highlights) {
    if (highlight.page !== pageNumber) continue;
    add(
      rangeOf(textRoot, highlight.text, 0, map),
      highlight.className ?? `hl-mark hl-${highlight.category}`,
      highlight.id,
    );
  }
  if (finding?.query) {
    for (let nth = 0; nth < 500; nth++) {
      const range = rangeOf(textRoot, finding.query, nth, map);
      if (!range) break;
      const current = finding.page === pageNumber && finding.nth === nth;
      add(range, current ? "hl-mark hl-find hl-find-current" : "hl-mark hl-find");
    }
  }
}

/** Scrolls to what `pending` asks for on a page just drawn; true when done. */
function reach(page: Element, pending: Pending): boolean {
  const target = pending.highlight
    ? page.querySelector(`.marks [data-highlight="${CSS.escape(pending.highlight)}"]`)
    : pending.find
      ? page.querySelector(".marks .hl-find-current")
      : null;
  if (target) {
    target.scrollIntoView({ block: "center" });
    if (pending.highlight) {
      const marks = page.querySelectorAll(
        `.marks [data-highlight="${CSS.escape(pending.highlight)}"]`,
      );
      for (const mark of marks) {
        mark.classList.remove("flash");
        void (mark as HTMLElement).offsetWidth;
        mark.classList.add("flash");
      }
    }
    return true;
  }
  return !pending.highlight && !pending.find;
}

interface SourceProps {
  bytes: ArrayBuffer;
  zoom: number;
  highlights: Marked[];
  finding: Finding | null;
  /** Where to go, once: a page and maybe a highlight or the match shown. */
  request: Request | null;
  scroller: React.RefObject<HTMLDivElement | null>;
  onPage: (page: number) => void;
  onPages: (pages: number) => void;
  onError: (message: string) => void;
  /** A PDF once it is open, and null when it closes. */
  onDocument?: (doc: PdfDocument | null) => void;
}

/** A PDF, page under page, drawn as the pages come into view. */
function PdfSource(props: SourceProps) {
  const { bytes, zoom, scroller, request } = props;
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [sizes, setSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [width, setWidth] = useState(0);
  const shells = useRef<Array<HTMLDivElement | null>>([]);
  const drawn = useRef(new Map<number, { scale: number; cancel: () => void }>());
  const near = useRef(new Set<number>());
  // The last request gone to, and the page a request waits on to be drawn.
  const done = useRef(0);
  const waiting = useRef<number | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    let cancelled = false;
    let opened: PdfDocument | null = null;
    openPdf(bytes)
      .then(async (loaded) => {
        opened = loaded;
        const found: Array<{ width: number; height: number }> = [];
        for (let n = 1; n <= loaded.numPages; n++) {
          const viewport = (await loaded.getPage(n)).getViewport({ scale: 1 });
          found.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        // A new file, such as one with recognized text, draws every page again.
        for (const page of drawn.current.values()) page.cancel();
        drawn.current.clear();
        setSizes(found);
        setDoc(loaded);
        latest.current.onPages(loaded.numPages);
        latest.current.onDocument?.(loaded);
      })
      .catch(() => {
        if (!cancelled) latest.current.onError(t("This PDF can't be read."));
      });
    return () => {
      cancelled = true;
      latest.current.onDocument?.(null);
      void opened?.loadingTask.destroy();
    };
  }, [bytes]);

  // The page width follows the window.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [scroller]);

  const widest = Math.max(1, ...sizes.map((size) => size.width));
  const fit = Math.min(Math.max(width - 48, 200), FIT_MAX) / widest;
  const scale = fit * zoom;

  /** Draws a page: the picture, its text to select, and the marks. */
  const draw = useRef<(n: number) => void>(() => {});
  useEffect(() => {
    draw.current = (n: number) => {
      const shell = shells.current[n - 1];
      if (!doc || !shell) return;
      const had = drawn.current.get(n);
      if (had?.scale === scale) return;
      had?.cancel();
      let cancelled = false;
      let task: { cancel: () => void } | null = null;
      drawn.current.set(n, {
        scale,
        cancel: () => {
          cancelled = true;
          task?.cancel();
        },
      });
      void (async () => {
        const page = await doc.getPage(n);
        if (cancelled) return;
        const lib = await import("pdfjs-dist");
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        const render = page.render({
          canvas,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        task = render;
        const text = document.createElement("div");
        text.className = "textLayer";
        const layer = new lib.TextLayer({
          textContentSource: page.streamTextContent(),
          container: text,
          viewport,
        });
        await Promise.all([render.promise, layer.render()]).catch(() => {
          cancelled = true;
        });
        if (cancelled) return;
        shell.replaceChildren(canvas, text);
        const { highlights, finding, request } = latest.current;
        paintMarks(shell, text, highlights, finding, n);
        if (request && request.id !== done.current && waiting.current === n) {
          if (reach(shell, request)) done.current = request.id;
        }
      })();
    };
  });

  const undraw = (n: number) => {
    drawn.current.get(n)?.cancel();
    drawn.current.delete(n);
    shells.current[n - 1]?.replaceChildren();
  };

  // Pages are drawn near the view and let go far from it.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !doc) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) {
            near.current.add(n);
            draw.current(n);
          } else {
            near.current.delete(n);
            undraw(n);
          }
        }
      },
      { root, rootMargin: "1500px 0px" },
    );
    for (const shell of shells.current) if (shell) observer.observe(shell);
    return () => observer.disconnect();
  }, [doc, sizes, scroller]);

  // A new zoom draws the pages in view again, keeping the place.
  const place = useRef<{ page: number; offset: number } | null>(null);
  useLayoutEffect(() => {
    const root = scroller.current;
    const kept = place.current;
    if (root && kept) {
      const shell = shells.current[kept.page - 1];
      if (shell)
        scrollElement(root, shell.offsetTop + kept.offset * shell.offsetHeight);
    }
    for (const n of near.current) draw.current(n);
  }, [scale, scroller]);

  // The marks follow the highlights and what is found.
  useEffect(() => {
    for (const n of drawn.current.keys()) {
      const shell = shells.current[n - 1];
      const text = shell?.querySelector(".textLayer");
      if (shell && text) paintMarks(shell, text, props.highlights, props.finding, n);
    }
  }, [props.highlights, props.finding]);

  // Going to a page: there at once, then to the highlight or match once drawn.
  useEffect(() => {
    const root = scroller.current;
    if (!request || request.id === done.current || !root || !doc) return;
    const n = Math.min(Math.max(request.page ?? 1, 1), doc.numPages);
    const shell = shells.current[n - 1];
    if (!shell) return;
    if (drawn.current.get(n)?.scale === scale && shell.querySelector(".textLayer")) {
      if (reach(shell, request)) {
        done.current = request.id;
        return;
      }
    }
    // To the page; once it is drawn, the mark is centered.
    scrollElement(root, shell.offsetTop - 16);
    if (!request.highlight && !request.find) done.current = request.id;
    else waiting.current = n;
  }, [request, doc, scroller, scale]);

  // The page in view is the one across the middle of the window.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const onScroll = () => {
      const line = root.scrollTop + root.clientHeight / 2;
      let page = 1;
      for (let i = 0; i < shells.current.length; i++) {
        const shell = shells.current[i];
        if (shell && shell.offsetTop <= line) page = i + 1;
      }
      const shell = shells.current[page - 1];
      if (shell)
        place.current = {
          page,
          offset: (root.scrollTop - shell.offsetTop) / Math.max(1, shell.offsetHeight),
        };
      latest.current.onPage(page);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [scroller]);

  if (!doc)
    return (
      <p className="p-6 text-[13px] text-muted-foreground">{t("Opening the PDF…")}</p>
    );
  return (
    <div className="pdf-pages">
      {sizes.map((size, i) => (
        <div
          key={i}
          ref={(element) => {
            shells.current[i] = element;
          }}
          className="pdf-page"
          data-page={i + 1}
          aria-label={t("Page {number}", { number: i + 1 })}
          style={
            {
              width: `${Math.floor(size.width * scale)}px`,
              height: `${Math.floor(size.height * scale)}px`,
              "--total-scale-factor": scale,
              "--scale-round-x": "1px",
              "--scale-round-y": "1px",
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A kept web page, as text to read. */
function HtmlSource(props: SourceProps) {
  const { bytes, zoom, highlights, finding, request } = props;
  const done = useRef(0);
  const page = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const kept = useMemo(() => keptArticle(new TextDecoder().decode(bytes)), [bytes]);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useLayoutEffect(() => {
    if (article.current) article.current.innerHTML = kept.html;
    latest.current.onPages(1);
    latest.current.onPage(1);
  }, [kept]);

  useEffect(() => {
    const shell = page.current;
    const text = article.current;
    if (!shell || !text) return;
    const paint = () => {
      paintMarks(shell, text, latest.current.highlights, latest.current.finding, null);
      const wanted = latest.current.request;
      if (wanted && wanted.id !== done.current && reach(shell, wanted))
        done.current = wanted.id;
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(text);
    return () => observer.disconnect();
  }, [kept, highlights, finding, zoom, request]);

  return (
    <div ref={page} className="html-page" style={{ fontSize: `${16 * zoom}px` }}>
      {/^https?:\/\//i.test(kept.url) && (
        <p className="html-source">
          {t("Kept from")}{" "}
          <a
            href={kept.url}
            onClick={(event) => {
              event.preventDefault();
              openExternal(kept.url);
            }}
          >
            {kept.url.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}
      <article
        ref={article}
        className="html-article"
        onClick={(event) => {
          const link = (event.target as Element).closest("a[href]");
          if (!link) return;
          event.preventDefault();
          const href = link.getAttribute("href");
          if (href && window.getSelection()?.isCollapsed) openExternal(href);
        }}
      />
    </div>
  );
}

/** Where a chapter of an EPUB leads on: the one before it, and the one after. */
function ChapterTurn({
  chapter,
  titles,
  onChapter,
}: {
  chapter: number;
  titles: string[];
  onChapter: (chapter: number) => void;
}) {
  const before = chapter > 1 ? chapter - 1 : null;
  const after = chapter < titles.length ? chapter + 1 : null;
  if (!before && !after) return null;
  const name = (n: number) => titles[n - 1] || t("Chapter {number}", { number: n });
  return (
    <nav className="epub-turn" aria-label={t("Chapters")}>
      {before ? (
        <button type="button" onClick={() => onChapter(before)}>
          <ChevronLeft className="size-3.5 flex-none" aria-hidden />
          <span className="truncate">{name(before)}</span>
        </button>
      ) : (
        <span />
      )}
      {after && (
        <button type="button" className="justify-end" onClick={() => onChapter(after)}>
          <span className="truncate">{t("Next: {title}", { title: name(after) })}</span>
          <ChevronRight className="size-3.5 flex-none" aria-hidden />
        </button>
      )}
    </nav>
  );
}

/** What the reader's bar shows of an EPUB: its chapters and its table of contents. */
export interface BookOutline {
  titles: string[];
  contents: EpubContentsEntry[];
}

/** An EPUB, one chapter at a time, as text to read. */
function EpubSource(
  props: SourceProps & { onOutline: (outline: BookOutline) => void },
) {
  const { bytes, zoom, highlights, finding, request, scroller } = props;
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const book = useMemo(() => {
    try {
      return openEpub(bytes);
    } catch (error) {
      return error instanceof EpubError && error.reason === "locked" ? "locked" : null;
    }
  }, [bytes]);
  const [chapter, setChapter] = useState(() => Math.max(request?.page ?? 1, 1));
  const done = useRef(0);
  const page = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    if (book === "locked")
      latest.current.onError(
        t("This book is locked with DRM, so Binder can't open it."),
      );
    else if (!book) latest.current.onError(t("This EPUB can't be read."));
    else {
      latest.current.onPages(book.chapters.length);
      latest.current.onOutline({
        titles: book.chapters.map((c) => c.title),
        contents: book.contents,
      });
    }
  }, [book]);

  // The chapter shown, with its images from the book.
  const shown = useMemo(() => {
    if (!book || book === "locked") return null;
    const urls: string[] = [];
    const html = chapterHtml(book, chapter, {
      image: (path, type) => {
        const url = URL.createObjectURL(
          new Blob([book.files[path] as BlobPart], { type }),
        );
        urls.push(url);
        return url;
      },
    });
    return { html, urls };
  }, [book, chapter]);
  useEffect(
    () => () => shown?.urls.forEach((url) => URL.revokeObjectURL(url)),
    [shown],
  );

  const turn = setChapter;

  // A place asked for in another chapter: that chapter first.
  const [seenRequest, setSeenRequest] = useState<number | null>(null);
  if (request && request.id !== seenRequest && book && book !== "locked") {
    setSeenRequest(request.id);
    const wanted = Math.min(Math.max(request.page ?? chapter, 1), book.chapters.length);
    if (wanted !== chapter) setChapter(wanted);
  }

  useLayoutEffect(() => {
    if (article.current) article.current.innerHTML = shown?.html ?? "";
    const root = scroller.current;
    if (root) scrollElement(root, 0);
    latest.current.onPage(chapter);
  }, [shown, chapter, scroller]);

  useEffect(() => {
    const shell = page.current;
    const text = article.current;
    if (!shell || !text) return;
    const paint = () => {
      paintMarks(
        shell,
        text,
        latest.current.highlights,
        latest.current.finding,
        chapter,
      );
      const wanted = latest.current.request;
      if (
        wanted &&
        wanted.id !== done.current &&
        (wanted.page ?? chapter) === chapter &&
        reach(shell, wanted)
      )
        done.current = wanted.id;
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(text);
    return () => observer.disconnect();
  }, [shown, chapter, highlights, finding, zoom, request]);

  if (!book || book === "locked") return null;
  return (
    <div
      ref={page}
      className="html-page epub-page"
      data-page={chapter}
      style={{ fontSize: `${17 * zoom}px` }}
    >
      <article
        ref={article}
        className="html-article"
        onClick={(event) => {
          const link = (event.target as Element).closest("a");
          if (!link || !window.getSelection()?.isCollapsed) return;
          const inBook = Number(link.getAttribute("data-chapter"));
          const href = link.getAttribute("href");
          if (inBook) {
            event.preventDefault();
            turn(inBook);
          } else if (href) {
            event.preventDefault();
            openExternal(href);
          }
        }}
      />
      <ChapterTurn
        chapter={chapter}
        titles={book.chapters.map((c) => c.title)}
        onChapter={turn}
      />
    </div>
  );
}

/** The table of contents of an EPUB, in the reader's bar. */
function ContentsMenu({
  outline,
  chapter,
  onChapter,
}: {
  outline: BookOutline;
  chapter: number;
  onChapter: (chapter: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  const entries = outline.contents.length
    ? outline.contents
    : outline.titles.map((title, i) => ({ title, chapter: i + 1, depth: 0 }));
  const name = (n: number) =>
    outline.titles[n - 1] || t("Chapter {number}", { number: n });
  // The entry of the chapter shown: the last one that opens it or a chapter before it.
  const current = entries.reduce<number>(
    (found, entry, i) => (entry.chapter <= chapter ? i : found),
    -1,
  );
  return (
    <div ref={box} className="relative min-w-0 flex-none">
      <button
        type="button"
        className={cn("contents-button", open && "bg-muted")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t("Contents")}
        onClick={() => setOpen((was) => !was)}
      >
        <ListTree className="size-3.5 flex-none" aria-hidden />
        <span className="truncate">{name(chapter)}</span>
        <ChevronDown className="size-3 flex-none" aria-hidden />
      </button>
      {open && (
        <div className="contents-menu" role="menu" aria-label={t("Contents")}>
          <p className="contents-heading">{t("Contents")}</p>
          {entries.map((entry, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={cn(i === current && "current")}
              style={{ paddingLeft: `${8 + entry.depth * 14}px` }}
              onClick={() => {
                setOpen(false);
                onChapter(entry.chapter);
              }}
            >
              <span className="truncate">{entry.title || name(entry.chapter)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Above a scanned PDF: the offer to recognize its text, the progress while
 * it runs, and once done, a word that recognized text has mistakes.
 */
function ScanBar({
  doc,
  bytes,
  onSave,
}: {
  doc: PdfDocument;
  bytes: ArrayBuffer;
  onSave: (bytes: Uint8Array) => Promise<void>;
}) {
  const [found, setFound] = useState<{ doc: PdfDocument; state: ScanState } | null>(
    null,
  );
  const state = found?.doc === doc ? found.state : null;
  const [languages, setLanguages] = useState(
    () => loadTextLanguages() ?? defaultTextLanguages(),
  );
  const [progress, setProgress] = useState<Recognizing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void scanStateOf(doc)
      .then((next) => !cancelled && setFound({ doc, state: next }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc]);
  useEffect(() => () => stop.current?.abort(), []);

  const run = async (again: boolean) => {
    const controller = new AbortController();
    stop.current = controller;
    setError(null);
    setChoosing(false);
    saveTextLanguages(languages);
    setProgress({ done: 0, total: 0 });
    try {
      const out = await recognizeText(doc, bytes, {
        languages,
        again,
        date: new Date().toISOString().slice(0, 10),
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (out) await onSave(out);
      else if (!controller.signal.aborted)
        setError(t("Binder found no pages without text to recognize."));
    } catch (problem) {
      setError(
        problem instanceof RecognizeError
          ? problem.message
          : problem instanceof Error && /encrypt/i.test(problem.message)
            ? t("This PDF is protected, so Binder can't add text to it.")
            : t("The text wasn't recognized. {error}", {
                error: problem instanceof Error ? problem.message : String(problem),
              }),
      );
    } finally {
      if (stop.current === controller) stop.current = null;
      setProgress(null);
    }
  };

  if (!state || state.kind === "text") return null;
  const picker = (
    <label className="scan-language">
      {t("Language:")}
      <select value={languages} onChange={(event) => setLanguages(event.target.value)}>
        {[...new Set([defaultTextLanguages(), languages])].map((option) => (
          <option key={option} value={option}>
            {textLanguagesLabel(option)}
          </option>
        ))}
        {TEXT_LANGUAGES.filter(
          (l) => l.code !== languages && l.code !== defaultTextLanguages(),
        ).map((l) => (
          <option key={l.code} value={l.code}>
            {t(l.name)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="scan-bar" role="status">
      <ScanText className="size-3.5 flex-none text-muted-foreground" aria-hidden />
      {progress ? (
        <>
          <span className="flex-none">
            {progress.total
              ? t("Recognizing the text… page {done} of {total}", {
                  done: Math.min(progress.done + 1, progress.total),
                  total: progress.total,
                })
              : t("Getting ready to recognize the text…")}
          </span>
          <span className="scan-progress" aria-hidden>
            <span
              style={{
                width: `${progress.total ? (100 * progress.done) / progress.total : 0}%`,
              }}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {t("On this device. You can keep reading.")}
          </span>
          <button
            type="button"
            className="scan-button"
            onClick={() => stop.current?.abort()}
          >
            {t("Stop")}
          </button>
        </>
      ) : state.kind === "scan" || choosing ? (
        <>
          <span className="min-w-0 flex-1">
            {error ??
              (state.kind === "scan"
                ? t(
                    "This PDF is a scan: its pages are pictures, so their text can't be found or highlighted yet.",
                  )
                : t("Recognize the text again, in another language if it needs one."))}
          </span>
          {picker}
          <button
            type="button"
            className={READ_BUTTON}
            onClick={() => void run(state.kind === "recognized")}
          >
            {t("Recognize the text")}
          </button>
          {choosing && (
            <button
              type="button"
              className="scan-button"
              onClick={() => setChoosing(false)}
            >
              {t("Cancel")}
            </button>
          )}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-muted-foreground">
            {error ??
              t(
                "Text recognized from the scan. Check a quote against the page before you use it.",
              )}
          </span>
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => setChoosing(true)}
          >
            {t("Recognize again…")}
          </button>
        </>
      )}
    </div>
  );
}

const READ_BUTTON =
  "inline-flex h-6 flex-none items-center gap-1.5 rounded-[5px] border border-primary-edge bg-primary-fill px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-fill/85";
const LINK_BUTTON =
  "inline-flex h-6 flex-none items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium text-tint-foreground hover:bg-tint-soft";

/** A highlight the assistant proposes: keep it, or dismiss it. */
function ProposedCard({
  highlight,
  unit,
  onOpen,
  onKeep,
  onDismiss,
}: {
  highlight: Highlight;
  unit: Unit;
  onOpen: () => void;
  onKeep: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className={cn("highlight-card proposed-card", `card-${highlight.category}`)}>
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <span className={cn("category-dot", `dot-${highlight.category}`)} />
        <span className="px-1">{categoryLabel(highlight.category)}</span>
        {highlight.page && (
          <span className="tabular-nums">{placeMark(unit, highlight.page)}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className="card-button"
          aria-label={t("Keep highlight")}
          title={t("Keep highlight")}
          onClick={onKeep}
        >
          <Check className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="card-button"
          aria-label={t("Dismiss highlight")}
          title={t("Dismiss highlight")}
          onClick={onDismiss}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <button type="button" className="highlight-text" onClick={onOpen}>
        {highlight.text}
      </button>
    </li>
  );
}

/** One highlight in the side panel: drag it into the notes, or add it there. */
function HighlightCard({
  highlight,
  unit,
  onOpen,
  onCategory,
  onRemove,
  onAddToNotes,
  dragData,
}: {
  highlight: Highlight;
  unit: Unit;
  onOpen: () => void;
  onCategory: (category: Category) => void;
  onRemove: () => void;
  onAddToNotes: () => void;
  dragData: () => { html: string; text: string };
}) {
  return (
    <li
      className={cn("highlight-card", `card-${highlight.category}`)}
      draggable
      onDragStart={(event) => {
        const data = dragData();
        event.dataTransfer.setData("text/html", data.html);
        event.dataTransfer.setData("text/plain", data.text);
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="flex items-center gap-1 text-2xs text-muted-foreground">
        <GripVertical className="drag-grip size-3 flex-none" aria-hidden />
        <span className={cn("category-dot", `dot-${highlight.category}`)} />
        <select
          className="category-select"
          aria-label={t("Category")}
          value={highlight.category}
          onChange={(event) => onCategory(event.target.value as Category)}
        >
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        {highlight.page && (
          <span className="tabular-nums">{placeMark(unit, highlight.page)}</span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className="card-button"
          aria-label={t("Add to notes")}
          title={t("Add to notes")}
          onClick={onAddToNotes}
        >
          <TextQuote className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className="card-button hover:text-destructive"
          aria-label={t("Delete highlight")}
          title={t("Delete highlight")}
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
      <button type="button" className="highlight-text" onClick={onOpen}>
        {highlight.text}
      </button>
    </li>
  );
}

export interface ReaderProps {
  title: string;
  /** The source file, as a path in the binder. */
  file: string;
  readBytes: (path: string) => Promise<ArrayBuffer | null>;
  highlights: Highlight[];
  /** Highlights the assistant proposes, to keep or dismiss. */
  proposed: Highlight[];
  onKeepProposed: (ids: string[] | "all") => void;
  onDismissProposed: (id: string) => void;
  onAddHighlight: (highlight: Omit<Highlight, "id">) => void;
  onChangeHighlight: (id: string, category: Category) => void;
  onRemoveHighlight: (id: string) => void;
  /** A highlight as a quote with a link back, for the notes. */
  quoteOf: (highlight: Highlight) => { html: string; text: string };
  onAddToNotes: (highlight: Highlight) => void;
  target: ReaderTarget | null;
  onBack: () => void;
  backLabel: string;
  /** The notes on the item, shown next to the source. */
  notes: React.ReactNode;
  /** Saves the source with recognized text in it; without it, a scan is only read. */
  onSaveFile?: (bytes: Uint8Array) => Promise<void>;
}

/** A source to read and highlight, with the highlights and notes next to it. */
export function Reader(props: ReaderProps) {
  const { file, readBytes, highlights, proposed, target } = props;
  // The passage a link from the assistant's writing opened, marked until another is.
  const [passage, setPassage] = useState<{ page: number | null; text: string } | null>(
    null,
  );
  const marks = useMemo<Marked[]>(
    () => [
      ...highlights,
      ...proposed.map((h) => ({
        ...h,
        id: PROPOSED + h.id,
        className: `hl-mark hl-proposed hl-${h.category}`,
      })),
      ...(passage
        ? [
            {
              id: PASSAGE,
              category: "quote" as const,
              page: passage.page,
              text: passage.text,
              className: "hl-mark hl-passage",
            },
          ]
        : []),
    ],
    [highlights, proposed, passage],
  );
  const [bytes, setBytes] = useState<{ file: string; data: ArrayBuffer | null } | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [query, setQuery] = useState(target?.find ?? "");
  const [texts, setTexts] = useState<string[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    text: string;
    page: number | null;
  } | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const pdf = isPdf(file);
  const epub = isEpub(file);
  const paged = isPaged(file);
  const unit = unitOf(file);
  const [outline, setOutline] = useState<BookOutline | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);

  useEffect(() => {
    let current = true;
    readBytes(file).then(
      (data) => current && setBytes({ file, data }),
      () => current && setBytes({ file, data: null }),
    );
    return () => {
      current = false;
    };
  }, [file, readBytes]);
  const data = bytes?.file === file ? bytes.data : undefined;

  // The text of every page, for finding: read once, when first asked for.
  useEffect(() => {
    if (!query.trim() || texts || !data) return;
    let cancelled = false;
    void (async () => {
      if (epub) {
        if (!cancelled) setTexts(chapterTexts(openEpub(data)));
        return;
      }
      if (!pdf) {
        if (!cancelled) setTexts(htmlPages(new TextDecoder().decode(data)));
        return;
      }
      const doc = await openPdf(data);
      const found: string[] = [];
      for (let n = 1; n <= doc.numPages && !cancelled; n++)
        found.push(await pageText(doc, n));
      void doc.loadingTask.destroy();
      if (!cancelled) setTexts(found);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [query, texts, data, pdf, epub]);

  const matches = useMemo(() => {
    if (!texts || !query.trim()) return [];
    return texts.flatMap((text, i) =>
      matchesIn(text, query).map((_, nth) => ({ page: paged ? i + 1 : null, nth })),
    );
  }, [texts, query, paged]);
  const shownMatch = matches.length ? Math.min(current, matches.length - 1) : -1;
  const finding = useMemo<Finding | null>(
    () =>
      query.trim()
        ? {
            query: query.trim(),
            page: shownMatch >= 0 ? matches[shownMatch].page : null,
            nth: shownMatch >= 0 ? matches[shownMatch].nth : -1,
          }
        : null,
    [query, matches, shownMatch],
  );

  const go = (next: Pending) =>
    setRequest((current) => ({ ...next, id: (current?.id ?? 0) + 1 }));

  // A place asked for from outside: a link in a note, or a search result.
  const [seenTarget, setSeenTarget] = useState<number | null>(null);
  if (target && target.nonce !== seenTarget) {
    setSeenTarget(target.nonce);
    if (target.find) {
      setQuery(target.find);
      setCurrent(0);
    }
    if (target.passage) setPassage({ page: target.page, text: target.passage });
    go({
      page: target.page,
      highlight:
        target.highlight && highlights.some((h) => h.id === target.highlight)
          ? target.highlight
          : target.passage
            ? PASSAGE
            : null,
      find: Boolean(target.find),
    });
  }

  const showMatch = (index: number) => {
    if (!matches.length) return;
    const at = (index + matches.length) % matches.length;
    setCurrent(at);
    go({ page: matches[at].page, highlight: null, find: true });
  };
  // The first match is shown once the pages' text is read.
  const matchKey = matches.length ? `${query}|${matches.length}` : "";
  const [shownKey, setShownKey] = useState("");
  if (matchKey && matchKey !== shownKey) {
    setShownKey(matchKey);
    go({ page: matches[0].page, highlight: null, find: true });
  }

  // Cmd/Ctrl + F finds in the source.
  useEffect(() => {
    const focus = () => {
      findInput.current?.focus();
      findInput.current?.select();
    };
    window.addEventListener("binder:find-in-source", focus);
    return () => window.removeEventListener("binder:find-in-source", focus);
  }, []);

  // A selection in the source offers the categories.
  const offer = () => {
    const selection = window.getSelection();
    const root = scroller.current;
    if (!selection || selection.isCollapsed || !root || !selection.rangeCount) {
      setMenu(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const text = oneLine(selection.toString());
    if (text.length < 2) return;
    const start =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const shell = start?.closest<HTMLElement>("[data-page]");
    const rect = range.getBoundingClientRect();
    setMenu({
      x: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
      y: rect.top,
      text,
      page: paged && shell ? Number(shell.dataset.page) : null,
    });
  };

  const highlight = (category: Category) => {
    if (!menu) return;
    props.onAddHighlight({ category, page: menu.page, text: menu.text });
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  };

  const sorted = useMemo(
    () =>
      highlights
        .map((h, order) => ({ h, order }))
        .sort((a, b) => (a.h.page ?? 0) - (b.h.page ?? 0) || a.order - b.order)
        .map(({ h }) => h),
    [highlights],
  );

  const zoomBy = (step: number) => {
    const at = ZOOMS.findIndex((z) => z >= zoom - 0.001);
    setZoom(ZOOMS[Math.min(Math.max((at < 0 ? 4 : at) + step, 0), ZOOMS.length - 1)]);
    setMenu(null);
  };

  return (
    <div className="reader">
      <div className="reader-bar" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="grid size-6 flex-none place-items-center rounded-md hover:bg-muted hover:text-foreground"
          aria-label={props.backLabel}
          title={props.backLabel}
          onClick={props.onBack}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {props.title}
        </span>
        <div className="reader-find">
          <Search className="size-3.5 flex-none text-muted-foreground" aria-hidden />
          <input
            ref={findInput}
            value={query}
            placeholder={t("Find in source")}
            aria-label={t("Find in source")}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrent(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                showMatch(shownMatch + (event.shiftKey ? -1 : 1));
              } else if (event.key === "Escape") {
                setQuery("");
              }
            }}
          />
          {query.trim() && (
            <>
              <span className="flex-none text-2xs text-muted-foreground tabular-nums">
                {!texts
                  ? "…"
                  : matches.length
                    ? `${shownMatch + 1} of ${matches.length}`
                    : t("None")}
              </span>
              <button
                type="button"
                className="card-button"
                aria-label={t("Previous match")}
                disabled={!matches.length}
                onClick={() => showMatch(shownMatch - 1)}
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="card-button"
                aria-label={t("Next match")}
                disabled={!matches.length}
                onClick={() => showMatch(shownMatch + 1)}
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                className="card-button"
                aria-label={t("Stop finding")}
                onClick={() => setQuery("")}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </>
          )}
        </div>
        {epub && outline && (
          <ContentsMenu
            outline={outline}
            chapter={page}
            onChapter={(chapter) => go({ page: chapter, highlight: null, find: false })}
          />
        )}
        {paged && pages > 0 && (
          <span className="flex-none tabular-nums" aria-live="polite">
            {epub
              ? t("ch. {chapter} of {chapters}", { chapter: page, chapters: pages })
              : t("p. {page} of {pages}", { page, pages })}
          </span>
        )}
        <div className="flex flex-none items-center">
          <button
            type="button"
            className="card-button"
            aria-label={t("Zoom out")}
            title={t("Zoom out")}
            disabled={zoom <= ZOOMS[0]}
            onClick={() => zoomBy(-1)}
          >
            <ZoomOut className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className="w-10 text-center tabular-nums hover:text-foreground"
            title={t("Fit the width")}
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="card-button"
            aria-label={t("Zoom in")}
            title={t("Zoom in")}
            disabled={zoom >= ZOOMS[ZOOMS.length - 1]}
            onClick={() => zoomBy(1)}
          >
            <ZoomIn className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="reader-body">
        <div
          ref={scroller}
          className="reader-source"
          onPointerUp={() => setTimeout(offer)}
          onKeyUp={(event) => event.shiftKey && offer()}
          onScroll={() => menu && setMenu(null)}
        >
          {pdf && pdfDoc && data && props.onSaveFile && !problem && (
            <ScanBar
              doc={pdfDoc}
              bytes={data}
              onSave={async (next) => {
                await props.onSaveFile!(next);
                setTexts(null);
                setBytes({ file, data: next.buffer as ArrayBuffer });
              }}
            />
          )}
          {problem ? (
            <p className="p-6 text-[13px] text-muted-foreground">{problem}</p>
          ) : data === undefined ? (
            <p className="p-6 text-[13px] text-muted-foreground">
              {t("Opening the source…")}
            </p>
          ) : data === null ? (
            <p className="p-6 text-[13px] text-muted-foreground">
              {t("The file can't be read. It may have been moved or deleted.")}
            </p>
          ) : pdf ? (
            <PdfSource
              bytes={data}
              zoom={zoom}
              highlights={marks}
              finding={finding}
              request={request}
              scroller={scroller}
              onPage={setPage}
              onPages={setPages}
              onError={setProblem}
              onDocument={setPdfDoc}
            />
          ) : epub ? (
            <EpubSource
              bytes={data}
              zoom={zoom}
              highlights={marks}
              finding={finding}
              request={request}
              scroller={scroller}
              onPage={setPage}
              onPages={setPages}
              onError={setProblem}
              onOutline={setOutline}
            />
          ) : (
            <HtmlSource
              bytes={data}
              zoom={zoom}
              highlights={marks}
              finding={finding}
              request={request}
              scroller={scroller}
              onPage={setPage}
              onPages={setPages}
              onError={setProblem}
            />
          )}
        </div>
        <aside className="reader-panel" aria-label={t("Highlights and notes")}>
          <section className="reader-highlights" aria-label={t("Highlights")}>
            <h2 className="panel-heading">
              {t("Highlights")}
              {highlights.length > 0 && (
                <span className="font-normal text-muted-foreground tabular-nums">
                  {highlights.length}
                </span>
              )}
            </h2>
            {sorted.length ? (
              <ul className="highlight-list">
                {sorted.map((h) => (
                  <HighlightCard
                    key={h.id}
                    highlight={h}
                    unit={unit}
                    onOpen={() => go({ page: h.page, highlight: h.id, find: false })}
                    onCategory={(category) => props.onChangeHighlight(h.id, category)}
                    onRemove={() => props.onRemoveHighlight(h.id)}
                    onAddToNotes={() => props.onAddToNotes(h)}
                    dragData={() => props.quoteOf(h)}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 pb-3 text-xs text-muted-foreground">
                {t(
                  "Select text in the source to highlight it as a claim, definition, method, finding or quote.",
                )}
              </p>
            )}
          </section>
          {proposed.length > 0 && (
            <section className="reader-proposed" aria-label={t("Proposed highlights")}>
              <h2 className="panel-heading">
                <Sparkles className="size-3 text-tint" aria-hidden />
                {t("Proposed by the assistant")}
                <span className="flex-1" />
                <button
                  type="button"
                  className="h-6 rounded-[5px] px-1.5 text-xs font-medium text-tint-foreground hover:bg-tint-soft"
                  onClick={() => props.onKeepProposed("all")}
                >
                  {t("Keep all")}
                </button>
              </h2>
              <ul className="highlight-list">
                {[...proposed]
                  .sort((a, b) => (a.page ?? 0) - (b.page ?? 0))
                  .map((h) => (
                    <ProposedCard
                      key={h.id}
                      highlight={h}
                      unit={unit}
                      onOpen={() =>
                        go({ page: h.page, highlight: PROPOSED + h.id, find: false })
                      }
                      onKeep={() => props.onKeepProposed([h.id])}
                      onDismiss={() => props.onDismissProposed(h.id)}
                    />
                  ))}
              </ul>
            </section>
          )}
          <section className="reader-notes" aria-label={t("Notes")}>
            <h2 className="panel-heading">
              {t("Notes")}
              {sorted.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  {t("Drag a highlight here to quote it")}
                </span>
              )}
            </h2>
            {props.notes}
          </section>
        </aside>
      </div>
      {menu && (
        <div
          className="highlight-menu"
          role="toolbar"
          aria-label={t("Highlight as")}
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.preventDefault()}
        >
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => highlight(category.id)}
            >
              <span className={cn("category-dot", `dot-${category.id}`)} />
              {categoryLabel(category.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
