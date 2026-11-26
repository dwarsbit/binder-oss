import { Library, Link2, PenLine, Search, TriangleAlert } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import { ServerError } from "@scholarkit/editor/lib/account";
import {
  lookupOf,
  type FoundPaper,
  type PaperSearch,
} from "@scholarkit/editor/references/lookup";
import type { ZoteroItem, ZoteroLibrary } from "@scholarkit/editor/references/zotero";
import { urlOf } from "@/lib/items";
import { t } from "@scholarkit/i18n";
import { ZoteroPanel } from "./ZoteroPanel";

export type AddTab = "reference" | "find" | "zotero" | "note";

const LAST_TAB = "binder.add-tab";

/** The tab Add to binder opened on last time; Reference the first time. */
export function lastAddTab(): AddTab {
  try {
    const tab = localStorage.getItem(LAST_TAB);
    if (tab === "reference" || tab === "find" || tab === "zotero" || tab === "note")
      return tab;
  } catch {
    // Storage may be off.
  }
  return "reference";
}

function rememberTab(tab: AddTab) {
  try {
    localStorage.setItem(LAST_TAB, tab);
  } catch {
    // Storage may be off.
  }
}

/** What the Reference field holds, with the hint under it. */
function readReference(text: string, freePdfs: boolean) {
  const lookup = lookupOf(text);
  if (lookup)
    return {
      ok: true,
      hint: {
        doi: freePdfs
          ? t(
              "A DOI. Binder looks up the work, and a free PDF of it where there is one.",
            )
          : t("A DOI. Binder looks up the work."),
        isbn: t("An ISBN. Binder looks up the book at Open Library."),
        arxiv: t("An arXiv ID. Binder looks up the preprint."),
        pubmed: t("A PubMed ID. Binder looks up the article at PubMed."),
      }[lookup.kind],
    };
  if (urlOf(text) && !/\s/.test(text.trim()))
    return { ok: true, hint: t("A link. Binder adds the web page by its address.") };
  if (text.trim())
    return {
      ok: false,
      hint: t(
        "This isn't a link or an ID. Find a paper by its title in Find a paper, or keep a thought in Note.",
      ),
    };
  return { ok: false, hint: "" };
}

/**
 * Adds to the binder, in four tabs: a reference by its link, DOI, ISBN,
 * arXiv or PubMed ID, or a file; a paper found by its title or authors;
 * works from Zotero; a thought or a note.
 */
export function AddDialog({
  tab: initialTab,
  onAddText,
  onAddFiles,
  onAddThought,
  onOpenNote,
  searchPapers,
  onAddPaper,
  zoteroInBinder,
  onAddFromZotero,
  onSettings,
  onPlans,
  onClose,
  freePdfs = false,
}: {
  tab: AddTab;
  /** Adds a link, a DOI, an ISBN, an arXiv or PubMed ID. Rejects with why not. */
  onAddText: (text: string) => Promise<void>;
  onAddFiles: (files: File[]) => void;
  /** Adds a thought to the inbox. */
  onAddThought: (text: string) => Promise<void>;
  /** Opens the text as a note, to write more. */
  onOpenNote: (text: string) => void;
  /** Searches OpenAlex through the account; absent without one. */
  searchPapers?: (q: string) => Promise<PaperSearch>;
  /** Adds a paper a search found. Rejects with why not. */
  onAddPaper: (paper: FoundPaper) => Promise<void>;
  zoteroInBinder: (library: string, key: string) => boolean;
  onAddFromZotero: (library: ZoteroLibrary, items: ZoteroItem[]) => Promise<number>;
  onSettings: () => void;
  /** Opens the account's plans, where the app has an account. */
  onPlans?: () => void;
  onClose: () => void;
  /** Whether a DOI brings a free PDF along, where there is one. */
  freePdfs?: boolean;
}) {
  const [tab, setTab] = useState<AddTab>(initialTab);
  const choose = (next: AddTab) => {
    setTab(next);
    rememberTab(next);
  };
  const tabs: Array<[AddTab, string, ReactNode]> = [
    ["reference", t("Reference"), <Link2 key="r" className="size-3.5" aria-hidden />],
    ["find", t("Find a paper"), <Search key="f" className="size-3.5" aria-hidden />],
    ["zotero", t("Zotero"), <Library key="z" className="size-3.5" aria-hidden />],
    ["note", t("Note"), <PenLine key="n" className="size-3.5" aria-hidden />],
  ];

  return (
    <Dialog title={t("Add to binder")} onClose={onClose}>
      <div className="dialog-wider">
        <div
          role="tablist"
          aria-label={t("What to add")}
          className="mt-3 flex rounded-md bg-muted p-0.5"
        >
          {tabs.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => choose(id)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[5px] text-[13px]",
                tab === id
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="mt-3">
          {tab === "reference" && (
            <ReferenceTab
              onAddText={onAddText}
              onAddFiles={onAddFiles}
              onClose={onClose}
              freePdfs={freePdfs}
            />
          )}
          {tab === "find" && (
            <FindTab
              searchPapers={searchPapers}
              onAddPaper={onAddPaper}
              onSettings={onSettings}
              onPlans={onPlans}
              onClose={onClose}
            />
          )}
          {tab === "zotero" && (
            <ZoteroPanel
              inBinder={zoteroInBinder}
              onAdd={onAddFromZotero}
              onSettings={onSettings}
              onClose={onClose}
            />
          )}
          {tab === "note" && (
            <NoteTab
              onAddThought={onAddThought}
              onOpenNote={onOpenNote}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Hint({
  problem,
  children,
}: {
  problem?: string | null;
  children?: ReactNode;
}) {
  return (
    <p
      className={cn(
        "mt-1 min-h-4 text-xs",
        problem ? "text-destructive" : "text-muted-foreground",
      )}
      role={problem ? "alert" : "status"}
    >
      {problem ?? children}
    </p>
  );
}

function ReferenceTab({
  onAddText,
  onAddFiles,
  onClose,
  freePdfs,
}: {
  onAddText: (text: string) => Promise<void>;
  onAddFiles: (files: File[]) => void;
  onClose: () => void;
  freePdfs: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const read = useMemo(() => readReference(text, freePdfs), [text, freePdfs]);

  const add = async () => {
    if (!read.ok || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onAddText(text);
      onClose();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };
  const addFiles = (files: File[]) => {
    if (!files.length) return;
    onAddFiles(files);
    onClose();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <input
        autoFocus
        value={text}
        aria-label={t("A link, DOI, ISBN, arXiv or PubMed ID")}
        placeholder={t("Paste a link, a DOI, an ISBN, or an arXiv or PubMed ID")}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(null);
        }}
        className="h-9 w-full rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring"
      />
      <Hint problem={problem}>{read.hint}</Hint>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOver(false);
          addFiles([...event.dataTransfer.files]);
        }}
        className={cn(
          "mt-2 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground",
          over && "border-tint bg-tint-soft",
        )}
      >
        {t("Or drop a PDF or EPUB here, or")}{" "}
        <button
          type="button"
          className="font-medium text-tint-foreground hover:underline"
          onClick={() => picker.current?.click()}
        >
          {t("choose a file…")}
        </button>
      </div>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          addFiles(files);
        }}
      />
      <div className="mt-3 flex justify-end">
        <button type="submit" className={PRIMARY_BUTTON} disabled={!read.ok || busy}>
          {busy ? t("Adding…") : t("Add")}
        </button>
      </div>
    </form>
  );
}

/** Why a search can't run, with what helps: plans, an own key, or waiting. */
function Stopped({
  error,
  onSettings,
  onPlans,
}: {
  error: ServerError;
  onSettings: () => void;
  onPlans?: () => void;
}) {
  const link = "font-medium text-tint-foreground hover:underline";
  return (
    <div
      role="alert"
      className="mt-2 flex gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive"
    >
      <TriangleAlert className="mt-px size-3.5 flex-none" aria-hidden />
      <div>
        <p>{error.message}</p>
        {["plus_needed", "key_refused", "key_budget_used"].includes(error.code) && (
          <p className="mt-1">
            {error.code === "plus_needed" && onPlans && (
              <>
                <button type="button" className={link} onClick={onPlans}>
                  {t("See plans")}
                </button>
                {" · "}
              </>
            )}
            <button type="button" className={link} onClick={onSettings}>
              {error.code === "key_refused"
                ? t("Check your OpenAlex key")
                : t("Add your own OpenAlex key")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function FindTab({
  searchPapers,
  onAddPaper,
  onSettings,
  onPlans,
  onClose,
}: {
  searchPapers?: (q: string) => Promise<PaperSearch>;
  onAddPaper: (paper: FoundPaper) => Promise<void>;
  onSettings: () => void;
  onPlans?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [found, setFound] = useState<PaperSearch | null>(null);
  const [chosen, setChosen] = useState(0);
  const [busy, setBusy] = useState<"search" | "add" | null>(null);
  const [stopped, setStopped] = useState<ServerError | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<HTMLUListElement>(null);

  const search = async () => {
    const q = query.trim();
    if (!searchPapers || q.length < 3 || busy) return;
    setBusy("search");
    setProblem(null);
    setStopped(null);
    try {
      const answer = await searchPapers(q);
      setFound(answer);
      setSearched(q);
      setChosen(0);
    } catch (error) {
      setFound(null);
      if (error instanceof ServerError && error.status !== 0 && error.code !== "error")
        setStopped(error);
      else setProblem(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const add = async (paper: FoundPaper | undefined) => {
    if (!paper || busy) return;
    setBusy("add");
    setProblem(null);
    try {
      await onAddPaper(paper);
      onClose();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const works = found?.works ?? [];
  const fresh = searched !== null && query.trim() === searched;
  const move = (by: number) => {
    if (!works.length) return;
    const next = (chosen + by + works.length) % works.length;
    setChosen(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  if (!searchPapers)
    return (
      <p className="text-[13px] text-muted-foreground">
        {t(
          "Sign in to your Scholarkit account to search OpenAlex for papers by their title or authors.",
        )}
      </p>
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // Enter searches new words; on the words just searched, it adds the chosen paper.
        if (fresh && works.length) void add(works[chosen]);
        else void search();
      }}
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={query}
          aria-label={t("Title or authors")}
          placeholder={t("Words from the title, or the authors")}
          onChange={(event) => {
            setQuery(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            }
          }}
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-[13px] outline-none focus:border-ring"
        />
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={query.trim().length < 3 || busy !== null}
          onClick={() => void search()}
        >
          {busy === "search" ? t("Searching…") : t("Search")}
        </button>
      </div>
      {stopped ? (
        <Stopped error={stopped} onSettings={onSettings} onPlans={onPlans} />
      ) : found === null ? (
        <Hint problem={problem}>
          {t("Search OpenAlex's 480 million works by their title or authors.")}
        </Hint>
      ) : (
        <>
          <div className="mt-2 overflow-hidden rounded-md border">
            {works.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                {t(
                  "No papers match. Try other words from the title, or a family name.",
                )}
              </p>
            ) : (
              <>
                <p className="px-3 pt-2 pb-1 text-2xs text-muted-foreground">
                  {t("Papers from OpenAlex")}
                </p>
                <ul
                  ref={list}
                  role="listbox"
                  aria-label={t("Papers from OpenAlex")}
                  className="max-h-72 overflow-y-auto"
                >
                  {works.map((work, index) => (
                    <li
                      key={work.openAlexId || index}
                      role="option"
                      aria-selected={index === chosen}
                      onMouseEnter={() => setChosen(index)}
                      onClick={() => void add(work)}
                      className={cn(
                        "cursor-default px-3 py-1.5",
                        index === chosen && "bg-tint-soft",
                      )}
                    >
                      <span className="text-[13px] font-medium">{work.title}</span>
                      {work.freePdf && (
                        <span className="ml-1.5 text-2xs font-semibold text-success">
                          {t("Free PDF")}
                        </span>
                      )}
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          work.author
                            .slice(0, 4)
                            .map((name) => name.split(",")[0])
                            .join(", ") + (work.author.length > 4 ? " et al." : ""),
                          work.year,
                          work.container,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <Hint problem={problem} />
        </>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {works.length > 0 && t("↑↓ to choose, Enter to add")}
        </span>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={!fresh || !works.length || busy !== null}
          onClick={() => void add(works[chosen])}
        >
          {busy === "add" ? t("Adding…") : t("Add paper")}
        </button>
      </div>
    </form>
  );
}

function NoteTab({
  onAddThought,
  onOpenNote,
  onClose,
}: {
  onAddThought: (text: string) => Promise<void>;
  onOpenNote: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onAddThought(text);
      onClose();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <textarea
        autoFocus
        rows={5}
        value={text}
        aria-label={t("A thought")}
        placeholder={t("Write down a thought")}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void add();
          }
        }}
        className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[13px] leading-normal outline-none focus:border-ring"
      />
      <Hint problem={problem}>
        {t("A short thought goes to your inbox. Open it as a note to write more.")}
      </Hint>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            onOpenNote(text);
            onClose();
          }}
        >
          {t("Open as a note")}
        </button>
        <button
          type="submit"
          className={PRIMARY_BUTTON}
          disabled={!text.trim() || busy}
        >
          {busy ? t("Adding…") : t("Add to inbox")}
        </button>
      </div>
    </form>
  );
}
