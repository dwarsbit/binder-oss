import {
  Eye,
  LayoutGrid,
  Library,
  List,
  PanelLeft,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ConfirmDialog } from "@scholarkit/editor/components/ConfirmDialog";
import { AddDialog, lastAddTab, type AddTab } from "@/components/AddDialog";
import { AssistantPanel } from "@/components/AssistantPanel";
import { ExportDialog } from "@/components/ExportDialog";
import { Board, ItemList } from "@/components/ItemList";
import { ItemView } from "@/components/ItemView";
import { Reader, type ReaderTarget } from "@/components/Reader";
import { FindBar, SearchDialog } from "@/components/Search";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Mark } from "@/components/Mark";
import { AppLoading } from "@scholarkit/editor/components/AppShell";
import { clampWidth, Sidebar } from "@/components/Sidebar";
import { FilterBar, ListName } from "@/components/FilterBar";
import {
  freeListName,
  inList,
  readLists,
  writeLists,
  type Filters,
  type SavedList,
} from "@/lib/lists";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { HEADER_BUTTON } from "@scholarkit/editor/components/Dialog";
import { Editor } from "@scholarkit/editor/components/Editor";
import { cn } from "@scholarkit/editor/lib/cn";
import { openFind } from "@scholarkit/editor/lib/find";
import {
  backlinks,
  linkablePages,
  linkIndex,
  retargetLinks,
} from "@scholarkit/editor/lib/links";
import { readPage, writePage } from "@scholarkit/editor/lib/page-file";
import {
  ATTACHMENTS,
  baseName,
  join,
  parentOf,
  type Project,
} from "@scholarkit/editor/lib/paths";
import { dragWindow, openExternal } from "@scholarkit/editor/lib/platform";
import { WorkspaceProvider, type Workspace } from "@scholarkit/editor/lib/workspace";
import { ReferencesProvider } from "@scholarkit/editor/references/context";
import {
  foundWork,
  lookUp,
  lookupOf,
  paperDetails,
  type FoundPaper,
} from "@scholarkit/editor/references/lookup";
import { firstPdf } from "@/lib/free-pdf";
import {
  zoteroReference,
  type ZoteroItem,
  type ZoteroLibrary,
} from "@scholarkit/editor/references/zotero";
import {
  authorsShort,
  BINDER_FILE,
  extensionOf,
  FORMAT,
  freeItemPath,
  isCompanionPath,
  ITEMS,
  itemsOf,
  kindOfFile,
  newItemSource,
  readBinderInfo,
  readItem,
  setProperties,
  sortItems,
  tagCounts,
  thoughtTitle,
  titleOfFile,
  today,
  writeBinderAssistant,
  writeBinderInfo,
  zoteroKeyOf,
  zoteroLink,
  isOwnWriting,
  type Item,
  type ItemChanges,
  type NewItem,
  type Status,
} from "@/lib/binder";
import {
  inView,
  itemOfReference,
  sameWork,
  searchablePages,
  titleOfUrl,
  urlOf,
  viewCounts,
  viewKey,
  viewOfKey,
  viewTitle,
  type View,
} from "@/lib/items";
import {
  loadLayout,
  loadSidebarWidth,
  loadView,
  saveLayout,
  saveSidebarWidth,
  saveView,
} from "@/lib/prefs";
import {
  highlightsPathOf,
  newHighlightId,
  placeHref,
  placeMark,
  placeOfHref,
  readHighlights,
  retargetFileLinks,
  unitOf,
  writeHighlights,
  type Highlight,
} from "@/lib/highlights";
import { guardWrites, removeFrom, renameIn, type BinderStore } from "@/lib/store";
import { applyChanges, type PageChange } from "@scholarkit/editor/lib/project-doc";
import {
  isEpub,
  isPaged,
  isReadable,
  normalize,
  readText,
  updateIndex,
  type TextIndex,
} from "@/lib/text";
import {
  assistantPathOf,
  isSpent,
  partOf,
  PARTS,
  proposedHighlights,
  readAssistant,
  withProposedHighlights,
  withPart,
  writeAssistant,
  hasProposal,
  type AssistantNote,
  type PartId,
  type Proposal,
} from "@/lib/assistant/file";
import {
  assistantSnapshot,
  canRun,
  isLocalUrl,
  OUR_MODEL,
  ownReady,
  providerLabel,
  receiverOf,
  saveAssistant,
  sourceOf,
  subscribeAssistant,
  type AssistantSettings,
} from "@/lib/assistant/providers";
import { budgetFor, readWithAssistant } from "@/lib/assistant/reading";
import { useAssistantRuns, type Start } from "@/lib/assistant/runs";
import { completeWith, ownTurn } from "@/lib/assistant/transport";
import { BinderChat, useChat, type ChatHost } from "@/lib/assistant/chat";
import { quoteWords } from "@/lib/assistant/passages";
import type { PropertyChange } from "@/lib/assistant/tools";
import {
  AskAssistantButton,
  AssistantDock,
  AssistantFloatingLayer,
  AssistantMenuLayer,
  sourceInfo,
  type AssistantProps,
} from "@/components/Assistant";
import { keepPage } from "@/lib/webpage";
import { authorsOf, openEpub } from "@/lib/epub";
import { clipHighlights, sameUrl, subscribeClips } from "@/lib/clipper";
import type { ClipPayload } from "@scholarkit/contracts";
import { t, tn } from "@scholarkit/i18n";

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * The address of a link clicked in notes: a link, or a file the editor
 * shows by its name. Null for anything else.
 */
function hrefAt(target: Element): string | null {
  const link = target.closest?.(".doc a[href], .assistant a.passage-link");
  if (link) return link.getAttribute("href");
  const file = target.closest?.(".doc .node-attachment");
  const dom = file?.closest(".ProseMirror") as
    (Element & { editor?: TiptapEditor }) | null;
  const editor = dom?.editor;
  if (!file || !editor) return null;
  let href: string | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (href !== null) return false;
    if (node.type.name === "attachment" && editor.view.nodeDOM(pos) === file) {
      href = String(node.attrs.href);
    }
    return true;
  });
  return href;
}

/** The view an item lives in: where it opens when it isn't in the one shown. */
const homeOf = (item: Item): View =>
  item.status === "inbox"
    ? { kind: "inbox" }
    : item.kind === "note" || item.kind === "thought"
      ? { kind: "notes" }
      : { kind: "reading" };

/** What the status bar says when everything is saved. */
const SAVED: Record<BinderStore["place"], string> = {
  disk: t("Saved on this computer"),
  browser: t("Saved in this browser"),
  account: t("Saved in your account"),
};

/** What deleting an item does, said before it happens. */
function deleteQuestion(item: Item, place: BinderStore["place"]): string {
  if (place === "disk")
    return item.file
      ? t("The item, its notes and its file are moved to the trash on your computer.")
      : t("The item and its notes are moved to the trash on your computer.");
  return item.file
    ? t(
        "The item, its notes and its file are removed from this binder. You can't undo this.",
      )
    : t("The item and its notes are removed from this binder. You can't undo this.");
}

/** Whether the window is wide enough to show a list and an item side by side. */
const wide = () => window.matchMedia("(min-width: 861px)").matches;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A free path for a file in `dir`: "photo.png", then "photo 2.png". */
function freeFilePath(project: Project, dir: string, name: string): string {
  const taken = new Set(
    [...(project.files ?? []), ...Object.keys(project.pages)].map((p) =>
      p.toLowerCase(),
    ),
  );
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 1; ; n++) {
    const path = join(dir, `${n === 1 ? stem : `${stem} ${n}`}${extension}`);
    if (!taken.has(path.toLowerCase())) return path;
  }
}

/** The file part of a path without its extension. */
const stemOf = (path: string) => baseName(path).replace(/\.[^.]*$/, "");

export default function App({
  store: given,
  onSwitchBinder,
  onRenameBinder,
  status,
  account,
  share,
  readOnly,
  me,
  shared = false,
  homeHref,
  projectId,
  onPlans,
}: {
  store: BinderStore;
  /** Opens another binder, where the app can. */
  onSwitchBinder?: () => void;
  /** The binder's id on the server, where it has one; clips from the browser extension name it. */
  projectId?: string;
  /** Gives the binder another name, where the app can. Rejects with why not. */
  onRenameBinder?: (name: string) => Promise<void>;
  /** What the status bar says in place of "Saved", such as "Saving…". */
  status?: { text: string; warn?: boolean };
  /** The account, at the end of the header, where the app has one. */
  account?: React.ReactNode;
  /** Share and the faces of the people in the binder, in the header before the account. */
  share?: React.ReactNode;
  /** The binder was shared with you to read, by its owner: nothing in it changes. */
  readOnly?: { owner: string };
  /** Your name, where the app knows it: items someone else added say who did. */
  me?: string;
  /** Whether others work in the binder too: new items say who added them. */
  shared?: boolean;
  /** Where the app's icon goes, where the app has a page for it: the Scholarkit home in the browser. */
  homeHref?: string;
  /** Opens the account's plans, where the app has an account. */
  onPlans?: () => void;
}) {
  // Read-only, nothing reaches the binder, whatever asks to change it.
  const locked = useRef(Boolean(readOnly));
  useEffect(() => {
    locked.current = Boolean(readOnly);
  });
  const store = useMemo(() => guardWrites(given, () => locked.current), [given]);
  const [project, setProject] = useState<Project | null>(null);
  // The binder as of the last change, also before the screen shows it.
  const fresh = useRef<Project | null>(null);
  const commit = (next: Project) => {
    fresh.current = next;
    setProject(next);
  };
  const [view, setView] = useState<View>(() => viewOfKey(loadView()));
  const [selected, setSelected] = useState<string | null>(null);
  // Counts the times an item was opened: each one starts a fresh editor.
  const [opened, setOpened] = useState(0);
  const [layout, setLayout] = useState(loadLayout);
  const [filesVersion, setFilesVersion] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  // The tab Add to binder is open on; null while it is closed.
  const [adding, setAdding] = useState<AddTab | null>(null);
  const [exporting, setExporting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [searching, setSearching] = useState<string | null>(null);
  const [finding, setFinding] = useState<{ text: string; replace: boolean } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<Item | null>(null);
  /** The saved list waiting on a yes before it goes. */
  const [deletingList, setDeletingList] = useState<string | null>(null);
  /** Whether the shown list's name is being typed. */
  const [renamingList, setRenamingList] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    clampWidth(loadSidebarWidth()),
  );
  const focusEditor = useRef<(() => void) | null>(null);
  const focusEditorEnd = useRef<(() => void) | null>(null);
  const titleInput = useRef<HTMLTextAreaElement>(null);
  // The source being read, and where in it.
  const [reading, setReading] = useState<{ path: string; target: ReaderTarget } | null>(
    null,
  );
  const notesEditor = useRef<TiptapEditor | null>(null);
  const [textIndex, setTextIndex] = useState<TextIndex | null>(null);
  const [keeping, setKeeping] = useState(false);
  // Items Binder is looking for a free PDF for, and the DOIs it found none for.
  const [findingPdf, setFindingPdf] = useState<ReadonlySet<string>>(new Set());
  const [noFreePdf, setNoFreePdf] = useState<ReadonlySet<string>>(new Set());
  // The open item's title and path as links last knew them.
  const linked = useRef<{ path: string; title: string } | null>(null);
  const assistant = useSyncExternalStore(subscribeAssistant, assistantSnapshot);
  // Our model needs a Scholarkit account; the store has a way to it then.
  const signedIn = Boolean(store.assistantTurn);
  // Sources added since the binder opened, for the assistant to read once their text is in.
  const newSources = useRef(new Set<string>());
  // Items that got a new path, by their old one, for work that began before.
  const moves = useRef(new Map<string, string>());

  // Changes from elsewhere that arrived before the binder was loaded.
  const early = useRef<PageChange[]>([]);

  useEffect(() => {
    let current = true;
    store.load().then(
      (loaded) => {
        if (!current) return;
        commit(applyChanges(loaded, early.current).project);
        early.current = [];
      },
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
  }, [store]);

  /** Runs a change in the store and says so when it fails. */
  const persist = (work: Promise<void>) =>
    work.then(
      () => setProblem(null),
      (error: unknown) => setProblem(messageOf(error)),
    );

  // Items changed elsewhere, in another tab or on another computer, come
  // into the open binder. The open item starts a fresh editor when its
  // notes were changed there.
  const takeChanges = useRef<(changes: PageChange[]) => void>(() => {});
  useEffect(() => {
    takeChanges.current = (changes) => {
      const current = fresh.current;
      if (!current) {
        early.current.push(...changes);
        return;
      }
      const { project: next, writes } = applyChanges(current, changes);
      commit(next);
      for (const [path, source] of writes) void persist(store.writePage(path, source));
      if (!selected) return;
      if (!(selected in next.pages)) {
        setSelected(null);
        setOpened((n) => n + 1);
      } else if (next.pages[selected] !== current.pages[selected]) {
        setOpened((n) => n + 1);
      }
    };
  });
  useEffect(
    () => store.subscribe?.((changes) => takeChanges.current(changes)),
    [store],
  );
  useEffect(
    () =>
      store.onFiles?.((files) => {
        if (fresh.current) commit({ ...fresh.current, files });
        setFilesVersion((n) => n + 1);
      }),
    [store],
  );

  const items = useMemo(() => (project ? sortItems(itemsOf(project)) : []), [project]);
  const info = useMemo(
    () =>
      project
        ? readBinderInfo(project)
        : { format: FORMAT, question: "", assistant: true },
    [project],
  );
  const lists = useMemo(() => readLists(project?.pages[BINDER_FILE]), [project]);
  const list =
    view.kind === "list"
      ? (lists.find((entry) => entry.name === view.name) ?? null)
      : null;
  const shown = useMemo(
    () => items.filter((item) => inView(item, view, lists)),
    [items, view, lists],
  );
  const counts = useMemo(() => viewCounts(items), [items]);
  const tags = useMemo(() => tagCounts(items), [items]);
  const source = project && selected ? (project.pages[selected] ?? null) : null;
  const item = useMemo(
    () => (selected && source !== null ? readItem(selected, source) : null),
    [selected, source],
  );
  const board = view.kind === "reading" && layout === "board";

  // A list that is gone, deleted or renamed elsewhere, makes way for the inbox.
  useEffect(() => {
    if (project && view.kind === "list" && !list) {
      setView({ kind: "inbox" });
      saveView("inbox");
    }
  }, [project, view, list]);

  // Links name the open item by its title as it was when it was opened.
  useEffect(() => {
    const source = selected ? fresh.current?.pages[selected] : undefined;
    if (!selected || source === undefined || linked.current?.path === selected) return;
    linked.current = { path: selected, title: readPage(source).title.trim() };
  }, [selected]);

  // A wide window shows the first item of a list next to it.
  if (project && !board && !selected && shown.length && wide()) {
    setSelected(shown[0].path);
    setOpened((n) => n + 1);
  }

  useEffect(() => {
    document.title = project ? `${project.name} · Binder` : "Binder";
  }, [project]);

  /** Writes a page of the binder. */
  const writeSource = (path: string, next: string) => {
    const latest = fresh.current;
    if (!latest || latest.pages[path] === next) return;
    commit({ ...latest, pages: { ...latest.pages, [path]: next } });
    void persist(store.writePage(path, next));
  };

  /** Writes the pages whose links to a page that moved or got a new title must change. */
  const relink = (
    current: Project,
    before: Record<string, string>,
    from: string,
    to: string,
  ): Project => {
    const writes = retargetLinks(before, current.pages, from, to);
    if (!writes.length) return current;
    const next = {
      ...current,
      pages: { ...current.pages, ...Object.fromEntries(writes) },
    };
    commit(next);
    for (const [file, text] of writes) void persist(store.writePage(file, text));
    return next;
  };

  /** After the open item got another title or path: links in notes name it the new way. */
  const retitleLinks = (current: Project, path: string): Project => {
    const known = linked.current;
    if (!known || !(path in current.pages)) return current;
    const title = readPage(current.pages[path]).title.trim();
    linked.current = { path, title };
    if (!known.title || (known.path === path && known.title === title)) return current;
    const before = { ...current.pages };
    delete before[path];
    before[known.path] = writePage({
      ...readPage(current.pages[path]),
      title: known.title,
    });
    return relink(current, before, known.path, path);
  };

  /**
   * Names the open item's file after its title, once the title is
   * typed; its original file gets the same name. Returns the binder as
   * it is after that.
   */
  const syncFileName = (): Project | null => {
    const current = fresh.current;
    if (!current || !selected || !(selected in current.pages)) return current;
    const page = readPage(current.pages[selected]);
    if (!page.title.trim()) return retitleLinks(current, selected);
    const own = readItem(selected, current.pages[selected]);
    // The original file goes along when it is named as the item is.
    const carried =
      own.file &&
      parentOf(own.file) === parentOf(selected) &&
      stemOf(own.file) === stemOf(selected) &&
      (current.files ?? []).includes(own.file)
        ? own.file
        : null;
    const { path, file } = freeItemPath(
      current,
      page.title,
      carried ? extensionOf(carried) : "",
      parentOf(selected),
      selected,
    );
    if (path === selected) return retitleLinks(current, selected);
    let next = renameIn(current, selected, path);
    void persist(store.rename(selected, path));
    // The highlights go along, and say whose they are.
    const marks = highlightsPathOf(selected);
    if (marks in next.pages) {
      const moved = highlightsPathOf(path);
      next = renameIn(next, marks, moved);
      void persist(store.rename(marks, moved));
      const text = writeHighlights(
        path,
        readHighlights(next.pages[moved]).highlights,
        next.pages[moved],
        unitOf(own.file),
      );
      next = { ...next, pages: { ...next.pages, [moved]: text } };
      void persist(store.writePage(moved, text));
    }
    // So does what the assistant wrote about it.
    const written = assistantPathOf(selected);
    if (written in next.pages) {
      const moved = assistantPathOf(path);
      next = renameIn(next, written, moved);
      void persist(store.rename(written, moved));
      const text = writeAssistant(
        path,
        readAssistant(next.pages[moved]),
        next.pages[moved],
      );
      next = { ...next, pages: { ...next.pages, [moved]: text } };
      void persist(store.writePage(moved, text));
    }
    moves.current.set(selected, path);
    if (carried && file && file !== carried) {
      next = renameIn(next, carried, file);
      void persist(store.rename(carried, file));
      const moved = setProperties(next.pages[path], { file: baseName(file) });
      next = { ...next, pages: { ...next.pages, [path]: moved } };
      void persist(store.writePage(path, moved));
      // Links to places in the file follow it.
      const writes = retargetFileLinks(next.pages, carried, file);
      if (writes.length) {
        next = { ...next, pages: { ...next.pages, ...Object.fromEntries(writes) } };
        for (const [page, text] of writes) void persist(store.writePage(page, text));
      }
      setFilesVersion((n) => n + 1);
    }
    commit(next);
    setSelected(path);
    next = relink(next, current.pages, selected, path);
    return retitleLinks(next, path);
  };

  const open = (path: string | null) => {
    setReading(null);
    if (path !== selected) {
      syncFileName();
      setSelected(path);
      setOpened((n) => n + 1);
    }
    setNavOpen(false);
  };

  const showView = (next: View) => {
    syncFileName();
    setRenamingList(false);
    setReading(null);
    setView(next);
    saveView(viewKey(next));
    setSelected(null);
    setOpened((n) => n + 1);
    setNavOpen(false);
  };

  /** Changes an item's properties. An item that leaves the open list makes way for the next. */
  const changeItem = (path: string, changes: ItemChanges) => {
    const latest = fresh.current;
    const current = latest?.pages[path];
    if (current === undefined) return;
    const next = setProperties(current, changes);
    writeSource(path, next);
    const before = readItem(path, current);
    const after = readItem(path, next);
    if (
      path === selected &&
      inView(before, view, lists) &&
      !inView(after, view, lists) &&
      !board
    ) {
      const at = shown.findIndex((entry) => entry.path === path);
      const following = shown[at + 1] ?? shown[at - 1] ?? null;
      setSelected(following?.path ?? null);
      setOpened((n) => n + 1);
    }
  };

  const setStatus = (path: string, status: Status) => changeItem(path, { status });

  /** Adds an item, with its original file next to it. Gives its path. */
  const addItem = async (
    entry: NewItem,
    options: {
      data?: Blob;
      /** A web address to save the file from, in place of `data`. */
      download?: string;
      extension?: string;
      openIt?: boolean;
    } = {},
  ): Promise<string | null> => {
    const current = fresh.current;
    if (!current) return null;
    const { path, file } = freeItemPath(current, entry.title, options.extension ?? "");
    if (options.data && file) {
      await store.writeFile(file, options.data);
    } else if (options.download && file && store.download) {
      await store.download(options.download, file);
      options = { ...options, data: new Blob() };
    }
    const latest = fresh.current ?? current;
    const text = newItemSource({
      ...entry,
      file: file && options.data ? baseName(file) : entry.file,
      // In a shared binder, the others see who added it.
      addedBy: entry.addedBy ?? (shared && me ? me : undefined),
    });
    commit({
      ...latest,
      folders: latest.folders.includes(ITEMS)
        ? latest.folders
        : [...latest.folders, ITEMS],
      pages: { ...latest.pages, [path]: text },
      files:
        file && options.data ? [...(latest.files ?? []), file].sort() : latest.files,
    });
    if (file && options.data) {
      setFilesVersion((n) => n + 1);
      if (isReadable(file)) newSources.current.add(path);
    }
    await store.writePage(path, text);
    if (options.openIt) {
      syncFileName();
      setSelected(path);
      setOpened((n) => n + 1);
    }
    return path;
  };

  /** What an EPUB says about itself, for its item; nothing when it can't be read. */
  const bookOf = async (file: File): Promise<Partial<NewItem>> => {
    try {
      const book = openEpub(await file.arrayBuffer());
      const found: Partial<NewItem> = {
        authors: authorsOf(book),
        year: book.year,
        publisher: book.publisher,
        isbn: book.isbn,
      };
      if (book.title) found.title = book.title;
      return found;
    } catch {
      return {};
    }
  };

  /** Adds files as items in the inbox, each next to its own item. */
  const addFileItems = async (files: File[]) => {
    let first: string | null = null;
    for (const file of files) {
      try {
        const path = await addItem(
          {
            title: titleOfFile(file.name) || t("Untitled"),
            kind: kindOfFile(file.name),
            ...(isEpub(file.name) ? await bookOf(file) : {}),
          },
          { data: file, extension: extensionOf(file.name) },
        );
        first ??= path;
        setProblem(null);
      } catch (error) {
        setProblem(messageOf(error));
      }
    }
    if (first) {
      if (view.kind !== "inbox") showView({ kind: "inbox" });
      setSelected(first);
      setOpened((n) => n + 1);
    }
  };

  /** Adds what was typed in Add to binder: a DOI, an ISBN, an arXiv or PubMed ID, a link or a thought. */
  const addText = async (text: string) => {
    const lookup = lookupOf(text);
    let path: string | null;
    if (lookup) {
      const inBinder = (found: Item | undefined) => {
        if (found)
          throw new Error(
            t("This work is in the binder already: “{title}”.", {
              title: found.title,
            }),
          );
      };
      inBinder(sameWork(items, lookup.kind, lookup.id));
      const ref = await lookUp(lookup, []);
      if (!ref) {
        throw new Error(
          {
            doi: t(
              "Crossref knows no work with this DOI. Check it, or add the work as a link.",
            ),
            isbn: t(
              "Open Library knows no book with this ISBN. Check it, or add the book as a note.",
            ),
            arxiv: t(
              "arXiv knows no preprint with this ID. Check it, or add the preprint as a link.",
            ),
            pubmed: t(
              "PubMed knows no article with this ID. Check it, or add the article as a link.",
            ),
          }[lookup.kind],
        );
      }
      // The same work by another of its IDs: a PMC ID's PubMed ID, an arXiv DOI's arXiv ID.
      if (ref.doi) inBinder(sameWork(items, "doi", ref.doi));
      if (ref.arxiv) inBinder(sameWork(items, "arxiv", ref.arxiv));
      if (ref.pmid) inBinder(sameWork(items, "pubmed", ref.pmid));
      path = await addItem(itemOfReference(ref));
      if (path && ref.doi) void findFreePdf(path, ref.doi, { quiet: true });
    } else {
      const url = urlOf(text);
      path =
        url && !/\s/.test(text.trim()) ? await addLink(url) : await addThought(text);
    }
    showAdded(path);
  };

  /** Shows an item just added, in the inbox. */
  const showAdded = (path: string | null) => {
    if (!path) return;
    if (view.kind !== "inbox") showView({ kind: "inbox" });
    setSelected(path);
    setOpened((n) => n + 1);
  };

  /** A thought, as the inbox keeps it: its first line is its title. */
  const thoughtParts = (text: string) => {
    const title = thoughtTitle(text);
    const lines = text.trim().split(/\r?\n/);
    const rest = title.endsWith("…") ? text.trim() : lines.slice(1).join("\n").trim();
    return { title, markdown: rest ? `${rest}\n` : "" };
  };

  const addThought = (text: string) =>
    addItem({ ...thoughtParts(text), kind: "thought" });

  /** Adds a paper a search found, with its free PDF where there is one, and shows it unless told not to. */
  const addPaper = async (paper: FoundPaper, show = true) => {
    for (const [kind, id] of [
      ["doi", paper.doi],
      ["arxiv", paper.arxiv],
      ["pubmed", paper.pmid],
    ] as const) {
      const there = id ? sameWork(items, kind, id) : undefined;
      if (there)
        throw new Error(
          t("This work is in the binder already: “{title}”.", { title: there.title }),
        );
    }
    const work = await paperDetails(paper);
    if (work.pmid && work.pmid !== paper.pmid) {
      const there = sameWork(items, "pubmed", work.pmid);
      if (there)
        throw new Error(
          t("This work is in the binder already: “{title}”.", { title: there.title }),
        );
    }
    const path = await addItem(itemOfReference(foundWork(work, [])));
    if (path && paper.doi) void findFreePdf(path, paper.doi, { quiet: true });
    if (show) showAdded(path);
  };

  /**
   * Fetches a web address for the binder, where the app can: a page as
   * its article, a PDF as the file. Null when there is nothing to keep.
   */
  const fetchForBinder = async (
    url: string,
  ): Promise<
    { kind: "page"; title: string; html: string } | { kind: "pdf"; url: string } | null
  > => {
    if (!store.fetchWeb) return null;
    const fetched = await store.fetchWeb(url);
    if (fetched.contentType === "application/pdf")
      return { kind: "pdf", url: fetched.url };
    if (!fetched.html) return null;
    const kept = keepPage(fetched.html, fetched.url, today());
    return kept ? { kind: "page", title: kept.title, html: kept.html } : null;
  };

  /** Adds a link: with the page's text, or its PDF, when the app can fetch it. */
  const addLink = async (url: string): Promise<string | null> => {
    const found = await fetchForBinder(url).catch(() => null);
    if (found?.kind === "page") {
      return addItem(
        { title: found.title || titleOfUrl(url), kind: "webpage", url },
        { data: new Blob([found.html], { type: "text/html" }), extension: ".html" },
      );
    }
    if (found?.kind === "pdf") {
      return addItem(
        { title: titleOfUrl(url), kind: "article", url },
        { download: found.url, extension: ".pdf" },
      ).catch(() => addItem({ title: titleOfUrl(url), kind: "webpage", url }));
    }
    return addItem({ title: titleOfUrl(url), kind: "webpage", url });
  };

  /** Points an item at a file just saved next to it. */
  const attachFile = (path: string, file: string) => {
    const latest = fresh.current;
    if (latest && !(latest.files ?? []).includes(file)) {
      commit({ ...latest, files: [...(latest.files ?? []), file].sort() });
    }
    setFilesVersion((n) => n + 1);
    changeItem(path, { file: baseName(file) });
    newSources.current.add(path);
  };

  /**
   * Saves a free PDF of the work with this DOI as the item's file: the
   * first of Unpaywall's links that gives a PDF. Quiet, nothing is said
   * when it fails, as when a DOI is added.
   */
  const findFreePdf = async (
    path: string,
    doi: string,
    options: { quiet?: boolean } = {},
  ): Promise<boolean> => {
    if (!store.openAccessPdfs || !store.download) return false;
    const toggle = (on: boolean) =>
      setFindingPdf((paths) => {
        const next = new Set(paths);
        if (on) next.add(path);
        else next.delete(path);
        return next;
      });
    toggle(true);
    try {
      const pdf = await firstPdf(await store.openAccessPdfs(doi), fetchForBinder);
      if (!pdf) {
        setNoFreePdf((dois) => new Set(dois).add(doi.toLowerCase()));
        return false;
      }
      // The item may have been renamed or deleted while Binder looked.
      const now = pathNow(path);
      const source = fresh.current?.pages[now];
      if (source === undefined || readItem(now, source).file) return false;
      const file = now.replace(/\.md$/i, ".pdf");
      await store.download(pdf, file);
      attachFile(now, file);
      setProblem(null);
      return true;
    } catch (error) {
      if (!options.quiet) {
        setProblem(t("No free PDF was saved. {error}", { error: messageOf(error) }));
      }
      return false;
    } finally {
      toggle(false);
    }
  };

  /** Keeps the text of an item's web page next to it, or the PDF behind its link. */
  const keepWebPage = async (entry: Item) => {
    setKeeping(true);
    try {
      const found = await fetchForBinder(entry.url);
      if (!found) throw new Error(t("This page has no article to keep."));
      const extension = found.kind === "pdf" ? ".pdf" : ".html";
      const file = entry.path.replace(/\.md$/i, extension);
      if (found.kind === "pdf") {
        if (!store.download) return;
        await store.download(found.url, file);
      } else {
        await store.writeFile(file, new Blob([found.html], { type: "text/html" }));
      }
      attachFile(entry.path, file);
      setProblem(null);
    } catch (error) {
      setProblem(t("The page wasn't kept. {error}", { error: messageOf(error) }));
    } finally {
      setKeeping(false);
    }
  };

  /** Shows an item, in the view it lives in when the one shown hasn't got it. */
  const showItem = (path: string) => {
    const found = itemsOf(fresh.current ?? { name: "", folders: [], pages: {} }).find(
      (entry) => entry.path === path,
    );
    if (found && !inView(found, view, lists)) {
      const home = homeOf(found);
      setView(home);
      saveView(viewKey(home));
    }
    if (path !== selected) open(path);
  };

  /**
   * Saves a clip from the Binder browser extension into this binder: a web
   * page as an item with its article kept, and the highlights made on it.
   * A page already in the binder gets the new highlights instead of a second item.
   */
  const applyClip = async (clip: ClipPayload) => {
    const current = fresh.current;
    if (!current) return;
    const kept = clip.html ? keepPage(clip.html, clip.url, today()) : null;
    const existing = itemsOf(current).find(
      (entry) => entry.url && sameUrl(entry.url, clip.url),
    );
    if (existing) {
      const marks = highlightsPathOf(existing.path);
      const { highlights } = readHighlights(fresh.current?.pages[marks]);
      const added = clipHighlights(
        clip,
        highlights.map((h) => h.id),
      );
      if (added.length) {
        writeSource(
          marks,
          writeHighlights(
            existing.path,
            [...highlights, ...added],
            fresh.current?.pages[marks],
          ),
        );
      }
      if (kept && !existing.file) {
        const file = existing.path.replace(/\.md$/i, ".html");
        await store.writeFile(file, new Blob([kept.html], { type: "text/html" }));
        const latest = fresh.current ?? current;
        if (!(latest.files ?? []).includes(file)) {
          commit({ ...latest, files: [...(latest.files ?? []), file].sort() });
        }
        setFilesVersion((n) => n + 1);
        changeItem(existing.path, { file: baseName(file) });
        newSources.current.add(existing.path);
      }
      showItem(existing.path);
      setProblem(null);
      return;
    }
    const title = kept?.title || clip.title.trim() || titleOfUrl(clip.url);
    const path = await addItem(
      {
        title,
        kind: "webpage",
        url: clip.url,
        authors: clip.author?.trim() ? [clip.author.trim()] : undefined,
      },
      kept
        ? { data: new Blob([kept.html], { type: "text/html" }), extension: ".html" }
        : {},
    );
    if (path && clip.highlights.length) {
      writeSource(highlightsPathOf(path), writeHighlights(path, clipHighlights(clip)));
    }
    if (path) {
      if (view.kind !== "inbox") showView({ kind: "inbox" });
      setSelected(path);
      setOpened((n) => n + 1);
    }
  };

  // Clips from the Binder browser extension arrive while this binder is open.
  const clips = useRef<(clip: ClipPayload) => void>(() => {});
  useEffect(() => {
    clips.current = (clip) => {
      applyClip(clip).catch((error: unknown) => setProblem(messageOf(error)));
    };
  });
  useEffect(() => {
    if (!projectId) return;
    return subscribeClips(projectId, (clip) => clips.current(clip));
  }, [projectId]);

  /** Opens an item's source in the reader, at a page, a highlight or a text to find. */
  const readSource = (
    path: string,
    place: Omit<ReaderTarget, "nonce"> = {
      page: null,
      highlight: null,
      find: null,
      passage: null,
    },
  ) => {
    showItem(path);
    setFinding(null);
    setReading((current) => ({
      path,
      target: { ...place, nonce: (current?.target.nonce ?? 0) + 1 },
    }));
  };

  /** A link in notes to a place in a source opens the reader there. */
  const followPlace = (event: React.MouseEvent, from: string) => {
    // A link with text selected in it is being edited, not followed.
    const target = event.target as Element;
    const href = hrefAt(target);
    if (href === null) return;
    if (target.closest?.("a[href]") && !window.getSelection()?.isCollapsed) return;
    const place = placeOfHref(parentOf(from), href);
    if (!place || !isReadable(place.file)) return;
    const owner = items.find((entry) => entry.file === place.file);
    if (!owner) return;
    event.preventDefault();
    event.stopPropagation();
    readSource(owner.path, {
      page: place.page,
      highlight: place.highlight,
      find: null,
      passage: place.text ?? null,
    });
  };

  /** Changes the highlights of an item. */
  const changeHighlights = (
    itemPath: string,
    change: (list: Highlight[]) => Highlight[],
  ) => {
    const latest = fresh.current;
    if (!latest) return;
    const path = highlightsPathOf(itemPath);
    const before = latest.pages[path];
    const file = latest.pages[itemPath]
      ? readItem(itemPath, latest.pages[itemPath]).file
      : null;
    writeSource(
      path,
      writeHighlights(
        itemPath,
        change(readHighlights(before).highlights),
        before,
        unitOf(file),
      ),
    );
  };

  /** A highlight as a quote in notes, with a link back to its place. */
  const quoteOf = (entry: Item, highlight: Highlight) => {
    const label =
      [authorsShort(entry.authors) || entry.title, entry.year]
        .filter(Boolean)
        .join(" ") +
      (highlight.page ? `, ${placeMark(unitOf(entry.file), highlight.page)}` : "");
    const href = placeHref(parentOf(entry.path), {
      file: entry.file ?? "",
      page: highlight.page,
      highlight: highlight.id,
    });
    return {
      html: `<blockquote><p>“${escapeHtml(highlight.text)}” <a href="${escapeHtml(href)}">${escapeHtml(label)}</a></p></blockquote>`,
      text: `> “${highlight.text}” [${label}](${href})`,
    };
  };

  /** Takes a page out of the binder, when it is in it. */
  const removePage = (path: string) => {
    const latest = fresh.current;
    if (!latest || !(path in latest.pages)) return;
    commit(removeFrom(latest, path));
    void persist(store.remove(path));
  };

  /** Changes what the assistant wrote about an item; the file goes when nothing is left in it. */
  const changeAssistant = (
    itemPath: string,
    change: (note: AssistantNote) => AssistantNote,
  ) => {
    const path = assistantPathOf(itemPath);
    const before = fresh.current?.pages[path];
    if (before === undefined) return;
    const next = change(readAssistant(before));
    if (isSpent(next)) removePage(path);
    else writeSource(path, writeAssistant(itemPath, next, before));
  };

  /** The path an item has now, after the moves since `path` was read. */
  const pathNow = (path: string) => {
    let now = path;
    for (let hops = 0; hops < 20 && moves.current.has(now); hops++)
      now = moves.current.get(now)!;
    return now;
  };

  /** The model that answers now: ours through the account, or the one set up here; null when none can. */
  const modelFor = (settings: AssistantSettings) =>
    sourceOf(settings, signedIn) === "scholarkit"
      ? (store.assistantTurn ?? null)
      : ownReady(settings)
        ? ownTurn(settings)
        : null;

  /**
   * Whether new sources go to the assistant as they come in. On our model
   * only when you chose it in Settings: it was off before there was one.
   */
  const readsNewSources = () => {
    const settings = assistantSnapshot();
    if (!settings.auto) return false;
    if (sourceOf(settings, signedIn) === "own") return true;
    const plan = chat.state.usage?.plan;
    return settings.source === "scholarkit" && (plan === "plus" || plan === "pro");
  };

  /** The assistant reads an item's source and writes what it found next to the item. */
  const startReading: Start = async (path, signal, progress) => {
    const current = fresh.current;
    if (!current || !(path in current.pages)) throw new Error(t("The item is gone."));
    const entry = readItem(path, current.pages[path]);
    if (!entry.file || !isReadable(entry.file))
      throw new Error(t("It has no PDF or kept page to read."));
    const settings = assistantSnapshot();
    const send = modelFor(settings);
    if (!send) throw new Error(t("Set up the assistant in Settings first."));
    const ours = sourceOf(settings, signedIn) === "scholarkit";
    const file = entry.file;
    progress(t("Reading the text"));
    const pages = indexed.current?.[file]?.pages.length
      ? indexed.current[file].pages
      : await readText(store, file);
    const { note, unchecked } = await readWithAssistant({
      item: entry,
      question: readBinderInfo(current).question,
      pages,
      pdf: isPaged(file),
      unit: unitOf(file),
      tags: tagCounts(itemsOf(current)).map((t) => t.tag),
      highlights: readHighlights(current.pages[highlightsPathOf(path)]).highlights,
      linkTo: ({ page, text }) =>
        placeHref(parentOf(path), { file, page, highlight: null, text }),
      complete: completeWith(send),
      model: ours ? OUR_MODEL : settings.model,
      provider: providerLabel(settings, signedIn),
      budget: budgetFor(!ours && isLocalUrl(settings.baseUrl)),
      written: today(),
      signal,
      progress,
    });
    if (!note.parts.length && !hasProposal(note.proposal))
      throw new Error(
        t("The model wrote nothing Binder could check against the source."),
      );
    // The item may have got another name while the assistant read it.
    const latest = fresh.current;
    const now = pathNow(path);
    if (!latest || !(now in latest.pages)) throw new Error(t("The item is gone."));
    const target = assistantPathOf(now);
    const previous = latest.pages[target];
    const kept = previous
      ? readAssistant(previous).parts.filter((part) => !part.id)
      : [];
    let text = writeAssistant(
      now,
      { ...note, parts: [...note.parts, ...kept] },
      previous,
    );
    const fileNow = readItem(now, latest.pages[now]).file;
    if (fileNow && fileNow !== file)
      text = retargetFileLinks({ [target]: text }, file, fileNow)[0]?.[1] ?? text;
    writeSource(target, text);
    if (!unchecked) return null;
    return tn(
      unchecked,
      "{count} statement was left out: its passage isn't in the source.",
      "{count} statements were left out: their passage isn't in the source.",
    );
  };
  const runs = useAssistantRuns(startReading);

  // The assistant's conversation: one per open binder, with its tools on the binder.
  const chatHost = useRef<ChatHost | null>(null);
  const [chat] = useState(
    () =>
      new BinderChat(() => chatHost.current!, {
        papers: Boolean(store.searchPapers),
        lookUp: signedIn,
        freePdfs: Boolean(store.openAccessPdfs && store.download),
      }),
  );
  const chatState = useChat(chat);
  // The text of sources the search index hasn't read yet, read once.
  const readTexts = useRef(new Map<string, Promise<string[]>>());
  useEffect(() => {
    chatHost.current = {
      items: () => (fresh.current ? itemsOf(fresh.current) : []),
      allowed: (entry) =>
        Boolean(fresh.current && readBinderInfo(fresh.current).assistant) &&
        entry.assistant,
      question: () => (fresh.current ? readBinderInfo(fresh.current).question : ""),
      highlights: (path) =>
        readHighlights(fresh.current?.pages[highlightsPathOf(path)]).highlights,
      pagesOf: async (entry) => {
        const file = entry.file;
        if (!file || !isReadable(file) || !fileSet.has(file)) return null;
        const known = indexed.current?.[file]?.pages;
        if (known?.length) return known;
        let text = readTexts.current.get(file);
        if (!text) {
          text = readText(store, file);
          readTexts.current.set(file, text);
        }
        return text;
      },
      searchPapers: store.searchPapers,
      lookUp: (kind, id) => lookUp({ kind, id }, []),
      freePdfs: store.openAccessPdfs,
      canRead: (entry) => Boolean(fresh.current && mayRead(entry, fresh.current)),
      send: () => modelFor(assistantSnapshot()),
      ours: () => sourceOf(assistantSnapshot(), signedIn) === "scholarkit",
      openItem: () => readingItem ?? item,
      readOnly: () => locked.current,
      applyProperties: (path, changes) => applyProperties(path, changes),
      saveNote: async (title, markdown) => {
        const path = await addItem({ title, kind: "note", markdown });
        if (!path) throw new Error(t("The note couldn't be saved."));
        return path;
      },
      keepHighlights: (path, kept) =>
        changeHighlights(path, (list) => {
          const taken = list.map((h) => h.id);
          const added = kept.map((h) => {
            const id = newHighlightId(taken);
            taken.push(id);
            return { ...h, id };
          });
          return [...list, ...added];
        }),
      addPaper: (paper) => addPaper(paper, false),
      savePdf: async (path, doi) => {
        if (!(await findFreePdf(path, doi)))
          throw new Error(
            t("The free PDF couldn't be saved: the publisher may block downloads."),
          );
      },
      readInBackground: (paths) => runs.ask(paths),
      usage: store.usage,
    };
  });
  // Our model's plan and month used, for the usage line and reading new sources.
  useEffect(() => {
    if (signedIn) void chat.refreshUsage();
  }, [signedIn, chat]);

  /** Sets what a card of the assistant proposes. */
  const applyProperties = (path: string, changes: PropertyChange[]) => {
    const latestSource = fresh.current?.pages[path];
    if (latestSource === undefined) throw new Error(t("The item is gone."));
    const entry = readItem(path, latestSource);
    const next: ItemChanges = {};
    for (const change of changes) {
      if (change.field === "kind") next.kind = change.after;
      else if (change.field === "authors")
        next.authors = change.after.split(/\s*;\s*/).filter(Boolean);
      else if (change.field === "year") next.year = change.after;
      else if (change.field === "publishedIn") next["published-in"] = change.after;
      else if (change.field === "publisher") next.publisher = change.after;
      else if (change.field === "doi") next.doi = change.after;
      else if (change.field === "tags")
        next.tags = [
          ...new Set([...entry.tags, ...change.after.split(/\s*,\s*/).filter(Boolean)]),
        ];
    }
    if (Object.keys(next).length) changeItem(path, next);
    const title = changes.find((change) => change.field === "title")?.after;
    const now = fresh.current?.pages[path];
    if (title && now !== undefined) {
      writeSource(path, writePage({ ...readPage(now), title }));
      if (path === selected) syncFileName();
    }
  };

  /** Whether the assistant may read an item now. */
  const mayRead = (entry: Item, current: Project) =>
    canRun(assistantSnapshot(), signedIn) &&
    readBinderInfo(current).assistant &&
    entry.assistant &&
    Boolean(entry.file && isReadable(entry.file));

  /** New sources whose text is in go to the assistant, when it reads new sources. */
  const offerNew = (index: TextIndex) => {
    const current = fresh.current;
    if (!current || !newSources.current.size) return;
    const ready: string[] = [];
    for (const path of [...newSources.current]) {
      const now = pathNow(path);
      const source = current.pages[now];
      if (source === undefined) {
        newSources.current.delete(path);
        continue;
      }
      const entry = readItem(now, source);
      if (!entry.file || !index[entry.file]) continue;
      newSources.current.delete(path);
      if (
        readsNewSources() &&
        mayRead(entry, current) &&
        !(assistantPathOf(now) in current.pages)
      )
        ready.push(now);
    }
    if (ready.length) runs.ask(ready);
  };

  /** Writes the assistant's proposal, as accepted, to the item. */
  const acceptProposal = (entry: Item, proposal: Proposal) => {
    changeAssistant(entry.path, (note) => ({ ...note, proposal: {} }));
    const changes: ItemChanges = {};
    if (proposal.kind) changes.kind = proposal.kind;
    if (proposal.authors) changes.authors = proposal.authors;
    if (proposal.year) changes.year = proposal.year;
    if (proposal.tags?.length)
      changes.tags = [...new Set([...entry.tags, ...proposal.tags])];
    if (Object.keys(changes).length) changeItem(entry.path, changes);
    const latestSource = fresh.current?.pages[entry.path];
    if (
      proposal.title &&
      latestSource !== undefined &&
      proposal.title !== entry.title
    ) {
      writeSource(
        entry.path,
        writePage({ ...readPage(latestSource), title: proposal.title }),
      );
      if (entry.path === selected) syncFileName();
    }
  };

  /** Moves a part of what the assistant wrote to the end of the item's notes. */
  const takeOver = (entry: Item, id: PartId) => {
    const written = fresh.current?.pages[assistantPathOf(entry.path)];
    const latestSource = fresh.current?.pages[entry.path];
    if (written === undefined || latestSource === undefined) return;
    const part = partOf(readAssistant(written), id);
    if (!part) return;
    const page = readPage(latestSource);
    // The notes are the reader's own text: the heading goes in in their language.
    const known = PARTS.find((p) => p.id === id)?.heading;
    const heading = known ? t(known) : part.heading;
    const markdown = `${page.markdown.trim() ? `${page.markdown.trimEnd()}\n\n` : ""}## ${heading}\n\n${part.markdown}\n`;
    writeSource(entry.path, writePage({ ...page, markdown }));
    changeAssistant(entry.path, (note) => withPart(note, id, ""));
    setOpened((n) => n + 1);
  };

  /** Keeps a highlight the assistant proposed, or all of them: they move to the highlights file. */
  const keepProposed = (entry: Item, ids: string[] | "all") => {
    const written = fresh.current?.pages[assistantPathOf(entry.path)];
    if (written === undefined) return;
    const proposed = proposedHighlights(readAssistant(written));
    const keep = proposed.filter((h) => ids === "all" || ids.includes(h.id));
    changeHighlights(entry.path, (list) => {
      const taken = list.map((h) => h.id);
      const added = keep.map((h) => {
        const id = taken.includes(h.id) ? newHighlightId(taken) : h.id;
        taken.push(id);
        return { ...h, id };
      });
      return [...list, ...added];
    });
    changeAssistant(entry.path, (note) =>
      withProposedHighlights(
        note,
        proposed.filter((h) => !keep.includes(h)),
        unitOf(entry.file),
      ),
    );
  };

  const dismissProposed = (entry: Item, id: string) =>
    changeAssistant(entry.path, (note) =>
      withProposedHighlights(
        note,
        proposedHighlights(note).filter((h) => h.id !== id),
        unitOf(entry.file),
      ),
    );

  /** Adds a note and puts the caret in its title. */
  const addNote = async (title = "", markdown = "") => {
    const path = await addItem({
      title: title || t("Untitled"),
      kind: "note",
      ...(markdown ? { markdown } : {}),
    }).catch((error: unknown) => {
      setProblem(messageOf(error));
      return null;
    });
    if (!path) return;
    if (!title) {
      // The title is typed on the page: the file is named after it then.
      const latest = fresh.current;
      if (latest) {
        const blank = writePage({ ...readPage(latest.pages[path]), title: "" });
        writeSource(path, blank);
      }
    }
    if (view.kind !== "notes") {
      setView({ kind: "notes" });
      saveView("notes");
    }
    setSelected(path);
    setOpened((n) => n + 1);
    setNavOpen(false);
    requestAnimationFrame(() =>
      title ? focusEditor.current?.() : titleInput.current?.focus(),
    );
  };

  /** Adds works from Zotero to the inbox, skipping the ones in the binder. Gives how many. */
  const addFromZotero = async (
    library: ZoteroLibrary,
    works: ZoteroItem[],
  ): Promise<number> => {
    let count = 0;
    for (const work of works) {
      if (inBinder(library.id, work.key)) continue;
      const ref = zoteroReference(work, library.id, []);
      await addItem({
        ...itemOfReference(ref),
        zotero: zoteroLink(library.id, work.key),
        zoteroVersion: work.version,
      });
      count += 1;
    }
    if (count && view.kind !== "inbox") showView({ kind: "inbox" });
    return count;
  };

  const zoteroKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const entry of items) {
      const key = entry.zotero ? zoteroKeyOf(entry.zotero) : null;
      if (key)
        keys.add(
          `${entry.zotero.includes("/groups/") ? entry.zotero.split("/")[4] : ""}/${key}`,
        );
    }
    return keys;
  }, [items]);
  const inBinder = useCallback(
    (library: string, key: string) => {
      const group = /^groups\/(\d+)$/.exec(library)?.[1] ?? "";
      return zoteroKeys.has(`${group}/${key}`);
    },
    [zoteroKeys],
  );

  const remove = (entry: Item) => {
    const current = fresh.current;
    if (!current) return;
    let next = removeFrom(current, entry.path);
    void persist(store.remove(entry.path));
    const ownFile =
      entry.file &&
      stemOf(entry.file) === stemOf(entry.path) &&
      (current.files ?? []).includes(entry.file);
    if (ownFile && entry.file) {
      next = removeFrom(next, entry.file);
      void persist(store.remove(entry.file));
    }
    for (const companion of [
      highlightsPathOf(entry.path),
      assistantPathOf(entry.path),
    ]) {
      if (!(companion in current.pages)) continue;
      next = removeFrom(next, companion);
      void persist(store.remove(companion));
    }
    if (reading?.path === entry.path) setReading(null);
    commit(next);
    if (selected === entry.path) {
      const at = shown.findIndex((other) => other.path === entry.path);
      const following = board ? null : (shown[at + 1] ?? shown[at - 1] ?? null);
      setSelected(following?.path ?? null);
      setOpened((n) => n + 1);
    }
  };

  const setQuestion = (question: string) => {
    const latest = fresh.current;
    if (!latest) return;
    writeSource(BINDER_FILE, writeBinderInfo(latest.pages[BINDER_FILE], question));
  };

  /** Writes the saved lists, changed from the ones in `binder.md` as it is now. */
  const changeLists = (change: (lists: SavedList[]) => SavedList[]) => {
    const latest = fresh.current;
    if (!latest) return;
    const source = latest.pages[BINDER_FILE];
    writeSource(BINDER_FILE, writeLists(source, change(readLists(source))));
  };

  /** Starts a list with no filters, and its name ready to type. */
  const newList = () => {
    const name = freeListName(lists, t("New list"));
    changeLists((current) => [...current, { name, filters: {}, unknown: [] }]);
    showView({ kind: "list", name });
    setRenamingList(true);
  };

  /** Changes a list's filters. An open item they leave out makes way for the list's first. */
  const setFilters = (name: string, filters: Filters) => {
    changeLists((current) =>
      current.map((entry) => (entry.name === name ? { ...entry, filters } : entry)),
    );
    const open = items.find((entry) => entry.path === selected);
    if (open && !inList(open, { name, filters, unknown: [] })) {
      setSelected(null);
      setOpened((n) => n + 1);
    }
  };

  /** Gives a list another name. Throws when another list has it. */
  const renameList = (name: string, wanted: string) => {
    if (freeListName(lists, wanted, name) !== wanted)
      throw new Error(t("Another list has this name."));
    changeLists((current) =>
      current.map((entry) =>
        entry.name === name ? { ...entry, name: wanted } : entry,
      ),
    );
    setView({ kind: "list", name: wanted });
    saveView(viewKey({ kind: "list", name: wanted }));
  };

  const duplicateList = (name: string) => {
    const copy = freeListName(lists, t("{name} copy", { name }));
    changeLists((current) => {
      const at = current.findIndex((entry) => entry.name === name);
      if (at < 0) return current;
      return [
        ...current.slice(0, at + 1),
        { ...current[at], name: copy },
        ...current.slice(at + 1),
      ];
    });
    showView({ kind: "list", name: copy });
  };

  const deleteList = (name: string) => {
    changeLists((current) => current.filter((entry) => entry.name !== name));
    if (view.kind === "list" && view.name === name) showView({ kind: "inbox" });
  };

  /** Adds files pasted or dropped into notes to the binder's attachments folder. */
  const addAttachments = async (files: File[]): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const current = fresh.current;
      if (!current) break;
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ")
        .replace(/:/g, ".");
      const name = /^image\.\w+$/i.test(file.name)
        ? `Pasted image ${stamp}${file.name.slice(file.name.lastIndexOf("."))}`
        : file.name || `File ${stamp}`;
      const path = freeFilePath(current, ATTACHMENTS, name);
      try {
        await store.writeFile(path, file);
      } catch (error) {
        setProblem(messageOf(error));
        continue;
      }
      const latest = fresh.current ?? current;
      commit({ ...latest, files: [...(latest.files ?? []), path].sort() });
      paths.push(path);
    }
    if (paths.length) setFilesVersion((n) => n + 1);
    return paths;
  };

  const openFile = (path: string) =>
    void store.openFile(path).catch((error: unknown) => setProblem(messageOf(error)));

  // Keys: Cmd/Ctrl + N adds, Cmd/Ctrl + K searches, Cmd/Ctrl + F finds in the open item.
  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        if (!locked.current) setAdding(lastAddTab());
      } else if (key === "k" || (key === "f" && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        const selection = window.getSelection()?.toString().trim() ?? "";
        setSearching(selection.includes("\n") ? "" : selection);
      } else if (key === "f" && reading) {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new Event("binder:find-in-source"));
      } else if (key === "f" && item) {
        event.preventDefault();
        event.stopPropagation();
        const selection = window.getSelection()?.toString().trim() ?? "";
        openFind(selection && !selection.includes("\n") ? selection : undefined);
      }
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // The find bar opens on request: from the keys, or from the search.
  useEffect(() => {
    const show = (event: Event) => {
      const { text, replace } = (
        event as CustomEvent<{ text?: string; replace?: boolean }>
      ).detail;
      setFinding((current) => ({
        text: text ?? current?.text ?? "",
        replace: Boolean(replace) || Boolean(current?.replace),
      }));
    };
    window.addEventListener("cursive:find", show);
    return () => window.removeEventListener("cursive:find", show);
  }, []);

  // The citation menu asks for the settings when Zotero isn't set up.
  useEffect(() => {
    const show = () => setSettings(true);
    window.addEventListener("cursive:settings", show);
    return () => window.removeEventListener("cursive:settings", show);
  }, []);

  // Files dropped on the window, outside the notes, become items.
  const dropFiles = useRef<(files: File[]) => void>(() => {});
  useEffect(() => {
    dropFiles.current = (files) => void addFileItems(files);
  });
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;
    const enter = (event: DragEvent) => {
      if (!hasFiles(event) || locked.current) return;
      depth += 1;
      setDropping(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const over = (event: DragEvent) => {
      if (hasFiles(event) && !locked.current) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setDropping(false);
      if (event.defaultPrevented || !hasFiles(event) || locked.current) return;
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) dropFiles.current(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const pages = project?.pages;
  const files = project?.files;
  const pageList = useMemo(
    () =>
      linkablePages({ name: "", folders: [], pages: pages ?? {} }).filter(
        (p) => p.path !== BINDER_FILE && !isCompanionPath(p.path),
      ),
    [pages],
  );
  const index = useMemo(() => linkIndex(pages ?? {}), [pages]);
  const linkedFrom = useMemo(
    () => (pages && selected ? backlinks(pages, selected) : []),
    [pages, selected],
  );
  const fileSet = useMemo(() => new Set(files ?? []), [files]);
  const latest = useRef({ open, addNote, addAttachments, offerNew });
  useEffect(() => {
    latest.current = { open, addNote, addAttachments, offerNew };
  });
  const workspace = useMemo<Workspace>(
    () => ({
      pages: pageList,
      index,
      active: selected,
      openPage: (path) => latest.current.open(path),
      createPage: (title) => void latest.current.addNote(title),
      files: fileSet,
      filesVersion,
      fileUrl: (path) => store.fileUrl(path),
      openFile: (path) =>
        void store
          .openFile(path)
          .catch((error: unknown) => setProblem(messageOf(error))),
      addFiles: (added) => latest.current.addAttachments(added),
      canAddFiles: true,
    }),
    [pageList, index, selected, fileSet, filesVersion, store],
  );
  const searchPages = useMemo(() => {
    if (!project) return {};
    const found = searchablePages(project);
    for (const entry of items) {
      const text = entry.file ? textIndex?.[entry.file] : undefined;
      if (!text || !entry.file) continue;
      const paged = isPaged(entry.file);
      const epub = isEpub(entry.file);
      text.pages.forEach((words, at) => {
        if (!words.trim()) return;
        found[`${entry.path}#page=${at + 1}`] = writePage({
          title: epub
            ? t("{title}, ch. {chapter}", { title: entry.title, chapter: at + 1 })
            : paged
              ? t("{title}, p. {page}", { title: entry.title, page: at + 1 })
              : t("{title}, kept page", { title: entry.title }),
          properties: "",
          markdown: `${normalize(words)}\n`,
        });
      });
    }
    return found;
  }, [project, items, textIndex]);

  // The text of every PDF and kept page, for search: read in the background.
  const readable = useMemo(() => (files ?? []).filter(isReadable), [files]);
  const indexed = useRef<TextIndex | null>(null);
  useEffect(() => {
    let cancelled = false;
    void updateIndex(
      store,
      readable,
      indexed.current,
      (index) => {
        if (cancelled) return;
        indexed.current = index;
        setTextIndex(index);
        latest.current.offerNew(index);
      },
      () => cancelled,
    ).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [store, readable, filesVersion]);

  const readingItem =
    reading && project
      ? (items.find((entry) => entry.path === reading.path) ?? null)
      : null;
  const marksSource =
    readingItem && project
      ? project.pages[highlightsPathOf(readingItem.path)]
      : undefined;
  const readingHighlights = useMemo(
    () => readHighlights(marksSource).highlights,
    [marksSource],
  );
  // Items with a proposal from the assistant, for the lists.
  const proposals = useMemo(() => {
    const found = new Set<string>();
    for (const [path, text] of Object.entries(pages ?? {})) {
      if (/\.assistant\.md$/i.test(path) && hasProposal(readAssistant(text).proposal))
        found.add(path.replace(/\.assistant\.md$/i, ".md"));
    }
    return found;
  }, [pages]);
  const proposedSource =
    readingItem && project
      ? project.pages[assistantPathOf(readingItem.path)]
      : undefined;
  const readingProposed = useMemo(
    () => (proposedSource ? proposedHighlights(readAssistant(proposedSource)) : []),
    [proposedSource],
  );
  const readBytes = useCallback((path: string) => store.readBytes(path), [store]);
  /** Saves a PDF with the text recognized in it; its text is read again, for search and the assistant. */
  const saveRecognized = async (file: string, bytes: Uint8Array) => {
    if (!file) return;
    await store.writeFile(
      file,
      new Blob([bytes as BlobPart], { type: "application/pdf" }),
    );
    const known = indexed.current;
    if (known?.[file]) {
      const { [file]: _gone, ...rest } = known;
      void _gone;
      indexed.current = rest;
    }
    setFilesVersion((n) => n + 1);
  };

  if (!project) {
    return (
      <AppLoading
        mark={<Mark className="size-[22px]" />}
        failed={Boolean(problem)}
        status={
          problem
            ? t("This binder can't be opened: {problem}", { problem })
            : t("Opening your binder…")
        }
      >
        {problem && onSwitchBinder && (
          <button
            type="button"
            onClick={onSwitchBinder}
            className="h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
          >
            {t("All binders")}
          </button>
        )}
      </AppLoading>
    );
  }

  if (info.format > FORMAT) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm">{t("This binder was made with a newer Binder.")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Update Binder to open it. Nothing in the binder was changed.")}
          </p>
          {onSwitchBinder && (
            <button
              type="button"
              onClick={onSwitchBinder}
              className="mt-3 h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
            >
              {t("All binders")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const position = (() => {
    if (!item) return null;
    const at = shown.findIndex((entry) => entry.path === item.path);
    return at < 0 ? null : { index: at, total: shown.length };
  })();
  const step = (by: number) => {
    if (!position) return undefined;
    const target = shown[position.index + by];
    return target ? () => open(target.path) : undefined;
  };

  const title = viewTitle(view);
  const emptyText =
    view.kind === "inbox"
      ? t("Your inbox is empty. What you add to the binder lands here first.")
      : view.kind === "reading"
        ? t("Nothing on your reading list yet. Move items here from your inbox.")
        : view.kind === "notes"
          ? t("No notes yet.")
          : view.kind === "list"
            ? t("No items pass these filters.")
            : t("No items with this tag.");

  const assistantNote = (entry: Item | null) => {
    const written = entry ? project.pages[assistantPathOf(entry.path)] : undefined;
    return written === undefined ? null : readAssistant(written);
  };
  const itemNote = assistantNote(item);
  const assistantPanel = item && !isOwnWriting(item.kind) && (
    <AssistantPanel
      key={item.path}
      item={item}
      note={itemNote}
      availability={
        !item.assistant
          ? "item-off"
          : mayRead(item, project) && fileSet.has(item.file ?? "")
            ? "ready"
            : "unavailable"
      }
      receiver={receiverOf(assistant, signedIn)}
      running={runs.state.running?.path === item.path ? runs.state.running.step : null}
      queued={runs.state.queued.includes(item.path)}
      error={runs.state.errors[item.path] ?? null}
      message={runs.state.notes[item.path] ?? null}
      onAsk={() => runs.ask([item.path])}
      onStop={runs.stop}
      onDismissMessage={() => runs.dismiss(item.path)}
      onAccept={(proposal) => acceptProposal(item, proposal)}
      onDismissProposal={() =>
        changeAssistant(item.path, (note) => ({ ...note, proposal: {} }))
      }
      onTakeOver={(part) => takeOver(item, part)}
      onDismissPart={(part) =>
        changeAssistant(item.path, (note) => withPart(note, part, ""))
      }
      onRead={
        item.file && isReadable(item.file) && fileSet.has(item.file)
          ? () => readSource(item.path)
          : undefined
      }
      onItemAssistant={(on) =>
        changeItem(item.path, { assistant: on ? null : "false" })
      }
      readOnly={Boolean(readOnly)}
    />
  );

  const itemLookup = item ? lookupOf(item.doi) : null;
  const itemDoi = itemLookup?.kind === "doi" ? itemLookup.id : null;
  const itemView = item && source !== null && (
    <div className="contents" onClickCapture={(event) => followPlace(event, item.path)}>
      <ItemView
        item={item}
        title={readPage(source).title}
        opened={opened}
        position={board ? null : position}
        onPrevious={step(-1)}
        onNext={step(1)}
        onBack={() => open(null)}
        backLabel={board ? t("Back to the board") : t("Back to {title}", { title })}
        onTitle={(next) => {
          const latestSource = fresh.current?.pages[item.path];
          if (latestSource === undefined) return;
          writeSource(item.path, writePage({ ...readPage(latestSource), title: next }));
        }}
        onTitleDone={() => void syncFileName()}
        onChange={(changes) => changeItem(item.path, changes)}
        onMarkdown={(markdown) => {
          const latestSource = fresh.current?.pages[item.path];
          if (latestSource === undefined) return;
          writeSource(item.path, writePage({ ...readPage(latestSource), markdown }));
        }}
        onOpenFile={openFile}
        onOpenLink={openExternal}
        onRead={
          item.file && isReadable(item.file) && fileSet.has(item.file)
            ? () => readSource(item.path)
            : undefined
        }
        onKeep={
          !readOnly &&
          store.fetchWeb &&
          item.url &&
          !item.file &&
          /^https?:\/\//i.test(item.url)
            ? () => void keepWebPage(item)
            : undefined
        }
        keeping={keeping}
        onFindPdf={
          !readOnly && store.openAccessPdfs && store.download && itemDoi && !item.file
            ? () => void findFreePdf(item.path, itemDoi)
            : undefined
        }
        findingPdf={findingPdf.has(item.path)}
        noFreePdf={Boolean(itemDoi && noFreePdf.has(itemDoi.toLowerCase()))}
        onDelete={() => setDeleting(item)}
        readOnly={Boolean(readOnly)}
        addedBy={item.addedBy && item.addedBy !== me ? item.addedBy : undefined}
        assistant={assistantPanel}
        backlinks={linkedFrom}
        focusRef={focusEditor}
        focusEndRef={focusEditorEnd}
        titleRef={titleInput}
      />
    </div>
  );

  const docked = assistant.layout === "docked";
  const assistantProps: AssistantProps = {
    chat,
    openItem: readingItem ?? item,
    source: sourceInfo(assistant, signedIn, chatState.usage, ownReady(assistant)),
    onOpenQuote: (card) =>
      readSource(card.path, {
        page: card.page,
        highlight: null,
        find: null,
        passage: quoteWords(card.quote),
      }),
    onOpenItem: showItem,
    onSettings: () => setSettings(true),
    onLayout: (next) => saveAssistant({ ...assistantSnapshot(), layout: next }),
    reading: {
      state: runs.state,
      titleOf: (path) =>
        items.find((entry) => entry.path === path)?.title ?? t("a source"),
      onStop: runs.stop,
    },
  };
  const askButton = (
    <AskAssistantButton
      chat={chat}
      docked={docked}
      readingPath={readingItem?.path ?? null}
    />
  );

  const reader = readingItem && readingItem.file && reading && (
    <Reader
      key={readingItem.file}
      title={readingItem.title}
      file={readingItem.file}
      readBytes={readBytes}
      highlights={readingHighlights}
      onAddHighlight={(added) =>
        changeHighlights(readingItem.path, (list) => [
          ...list,
          { ...added, id: newHighlightId(list.map((h) => h.id)) },
        ])
      }
      onChangeHighlight={(id, category) =>
        changeHighlights(readingItem.path, (list) =>
          list.map((h) => (h.id === id ? { ...h, category } : h)),
        )
      }
      onRemoveHighlight={(id) =>
        changeHighlights(readingItem.path, (list) => list.filter((h) => h.id !== id))
      }
      proposed={readingProposed}
      onKeepProposed={(ids) => keepProposed(readingItem, ids)}
      onDismissProposed={(id) => dismissProposed(readingItem, id)}
      quoteOf={(highlight) => quoteOf(readingItem, highlight)}
      onSaveFile={(bytes) => saveRecognized(readingItem.file ?? "", bytes)}
      onAddToNotes={(highlight) => {
        const editor = notesEditor.current;
        if (!editor) return;
        // Empty notes get the quote in place of their empty line.
        const end = editor.state.doc.content.size;
        editor
          .chain()
          .insertContentAt(
            editor.isEmpty ? { from: 0, to: end } : end,
            quoteOf(readingItem, highlight).html,
          )
          .focus("end")
          .run();
      }}
      target={reading.target}
      actions={askButton}
      readOnly={Boolean(readOnly)}
      onAsk={(selected) => {
        chat.openMenu(
          { path: readingItem.path, text: selected.text, page: selected.page },
          { left: selected.left, top: selected.top },
        );
      }}
      onBack={() => setReading(null)}
      backLabel={t("Back to the item")}
      notes={
        <div
          className="reader-notes-page"
          onClickCapture={(event) => followPlace(event, readingItem.path)}
        >
          <Editor
            key={`${readingItem.path}:${opened}`}
            markdown={readingItem.markdown}
            readOnly={Boolean(readOnly)}
            editorRef={notesEditor}
            onChange={(change) => {
              const latestSource = fresh.current?.pages[readingItem.path];
              if (latestSource === undefined) return;
              writeSource(
                readingItem.path,
                writePage({ ...readPage(latestSource), markdown: change.markdown }),
              );
            }}
          />
        </div>
      }
    />
  );

  const shell = (
    <div
      className={cn(
        "app",
        navOpen && "nav-open",
        docked && chatState.dockShown && "has-dock",
      )}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <Sidebar
        homeHref={homeHref}
        binderName={project.name}
        question={info.question}
        onQuestion={readOnly ? undefined : setQuestion}
        view={view}
        onView={showView}
        counts={counts}
        tags={tags}
        lists={lists.map((entry) => ({
          name: entry.name,
          count: items.filter((other) => inList(other, entry)).length,
        }))}
        onNewList={readOnly ? undefined : newList}
        onAdd={
          readOnly
            ? undefined
            : () => {
                setNavOpen(false);
                setAdding(lastAddTab());
              }
        }
        onSearch={() => {
          setNavOpen(false);
          setSearching("");
        }}
        onSettings={() => {
          setNavOpen(false);
          setSettings(true);
        }}
        onRenameBinder={
          onRenameBinder &&
          (async (name) => {
            syncFileName();
            await onRenameBinder(name);
            if (fresh.current) commit({ ...fresh.current, name });
          })
        }
        onSwitchBinder={onSwitchBinder}
        assistantStatus={
          runs.state.running && (
            <div className="assistant-status" role="status">
              <Sparkles
                className="size-3.5 flex-none animate-pulse text-tint"
                aria-hidden
              />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                title={runs.state.running.step}
                onClick={() => runs.state.running && showItem(runs.state.running.path)}
              >
                {t("Reading {title}", {
                  title:
                    items.find((entry) => entry.path === runs.state.running?.path)
                      ?.title ?? t("a source"),
                })}
                {runs.state.queued.length > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    {tn(runs.state.queued.length, "· {count} more", "· {count} more")}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="h-6 flex-none rounded-[5px] px-1.5 text-xs font-medium text-tint-foreground hover:bg-tint-soft"
                onClick={runs.stop}
              >
                {t("Stop")}
              </button>
            </div>
          )
        }
        width={sidebarWidth}
        onResize={(width) => {
          setSidebarWidth(width);
          saveSidebarWidth(width);
        }}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <main className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        {reader || (
          <>
            <header
              className="flex h-11 flex-none items-center gap-2 border-b px-3 text-xs"
              onPointerDown={dragWindow}
            >
              <button
                type="button"
                className="menu-button"
                aria-label={t("Show the sidebar")}
                onClick={() => setNavOpen(true)}
              >
                <PanelLeft className="size-4" aria-hidden />
              </button>
              {list && readOnly ? (
                <h1 className="truncate text-sm font-semibold">{list.name}</h1>
              ) : list ? (
                <ListName
                  name={list.name}
                  renaming={renamingList}
                  onRenaming={setRenamingList}
                  onRename={(wanted) => renameList(list.name, wanted)}
                />
              ) : (
                <h1 className="truncate text-sm font-semibold">{title}</h1>
              )}
              <span className="flex-1 truncate text-muted-foreground tabular-nums">
                {tn(shown.length, "{count} item", "{count} items")}
              </span>
              {view.kind !== "notes" && (
                <button
                  type="button"
                  className={HEADER_BUTTON}
                  onClick={() => setExporting(true)}
                >
                  <Upload className="size-3.5" aria-hidden />
                  {t("Export…")}
                </button>
              )}
              {view.kind === "inbox" && !readOnly && (
                <button
                  type="button"
                  className={HEADER_BUTTON}
                  onClick={() => setAdding("zotero")}
                >
                  <Library className="size-3.5" aria-hidden />
                  {t("Add from Zotero…")}
                </button>
              )}
              {view.kind === "reading" && (
                <div
                  role="group"
                  aria-label={t("Show as")}
                  className="inline-flex flex-none gap-0.5 rounded-[7px] bg-muted p-0.5"
                >
                  {(
                    [
                      { id: "list", label: t("List"), icon: List },
                      { id: "board", label: t("Board"), icon: LayoutGrid },
                    ] as const
                  ).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={layout === entry.id}
                      onClick={() => {
                        setLayout(entry.id);
                        saveLayout(entry.id);
                        if (entry.id === "board") open(null);
                      }}
                      className={cn(
                        "inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium",
                        layout === entry.id
                          ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <entry.icon className="size-3.5" aria-hidden />
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
              {askButton}
              {share}
              {account}
            </header>

            {list && (
              // Read-only, a list's filters show what it holds, and don't change.
              <div className="contents" inert={Boolean(readOnly)}>
                <FilterBar
                  key={list.name}
                  list={list}
                  tags={tags.map((entry) => entry.tag)}
                  onChange={(filters) => setFilters(list.name, filters)}
                  onRename={() => setRenamingList(true)}
                  onDuplicate={() => duplicateList(list.name)}
                  onDelete={() => setDeletingList(list.name)}
                />
              </div>
            )}

            {finding && item && (
              <FindBar
                text={finding.text}
                replacing={finding.replace}
                onClose={() => setFinding(null)}
              />
            )}

            {board ? (
              itemView || (
                <div className="min-h-0 flex-1 overflow-auto">
                  {shown.length ? (
                    <Board
                      items={shown}
                      onOpen={open}
                      onStatus={readOnly ? undefined : setStatus}
                    />
                  ) : (
                    <p className="p-4 text-[13px] text-muted-foreground">{emptyText}</p>
                  )}
                </div>
              )
            ) : (
              <div className={cn("split", item && "has-item")}>
                <div className="list-pane" aria-label={title}>
                  <ItemList
                    items={shown}
                    selected={selected}
                    groups={view.kind === "reading"}
                    showStatus={view.kind !== "inbox" && view.kind !== "reading"}
                    empty={emptyText}
                    onOpen={open}
                    proposals={proposals}
                    reading={runs.state.running?.path ?? null}
                  />
                </div>
                <div className="item-pane">
                  {itemView || (
                    <div className="grid flex-1 place-items-center p-6 text-center text-[13px] text-muted-foreground">
                      {shown.length ? t("Pick an item to see it here.") : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {readOnly && (
          <div
            className="flex min-h-9 flex-none items-center gap-2 border-t bg-muted px-3.5 py-1.5 text-xs text-muted-foreground"
            role="note"
          >
            <Eye className="size-3.5 flex-none" aria-hidden />
            <span>
              {t(
                "{owner} shares this binder with you. You can read it and its sources, but not change them.",
                { owner: readOnly.owner },
              )}
            </span>
          </div>
        )}
        <footer className="flex h-7 flex-none items-center gap-3.5 border-t px-3.5 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="inline-flex min-w-0 items-center gap-1.5" role="status">
            <span
              aria-hidden
              className={`size-1.5 flex-none rounded-full ${problem || status?.warn ? "bg-warning" : "bg-success"}`}
            />
            <span className="truncate">
              {problem
                ? t("Not saved. {problem}", { problem })
                : (status?.text ?? SAVED[store.place])}
            </span>
          </span>
          {selected && <span className="path truncate font-mono">{selected}</span>}
        </footer>
        {!docked && <AssistantFloatingLayer {...assistantProps} />}
      </main>
      {docked && <AssistantDock {...assistantProps} />}
      <AssistantMenuLayer
        chat={chat}
        docked={docked}
        papers={Boolean(store.searchPapers)}
      />

      {dropping && <div className="drop-cover">{t("Drop to add to your inbox")}</div>}
      {adding && (
        <AddDialog
          tab={adding}
          onAddText={addText}
          freePdfs={Boolean(store.openAccessPdfs && store.download)}
          onAddFiles={(added) => void addFileItems(added)}
          onAddThought={async (text) => showAdded(await addThought(text))}
          onOpenNote={(text) => {
            const parts = text.trim()
              ? thoughtParts(text)
              : { title: "", markdown: "" };
            void addNote(parts.title, parts.markdown);
          }}
          searchPapers={store.searchPapers}
          paperSearchAccess={store.paperSearchAccess}
          onAddPaper={addPaper}
          zoteroInBinder={inBinder}
          onAddFromZotero={addFromZotero}
          onSettings={() => {
            setAdding(null);
            setSettings(true);
          }}
          onPlans={onPlans}
          onClose={() => setAdding(null)}
        />
      )}
      {exporting && (
        <ExportDialog
          binderName={project.name}
          listName={title}
          listItems={shown}
          allItems={items}
          onClose={() => setExporting(false)}
        />
      )}
      {deletingList !== null && (
        <ConfirmDialog
          title={t("Delete the list “{name}”?", { name: deletingList })}
          body={t("Only the list goes. The items in it stay in your binder.")}
          confirmLabel={t("Delete list")}
          onCancel={() => setDeletingList(null)}
          onConfirm={() => {
            deleteList(deletingList);
            setDeletingList(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t("Delete “{title}”?", { title: deleting.title })}
          body={deleteQuestion(deleting, store.place)}
          confirmLabel={t("Delete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove(deleting);
            setDeleting(null);
          }}
        />
      )}
      {settings && (
        <SettingsDialog
          onClose={() => setSettings(false)}
          openAlexKey={store.openAlexKey}
          account={signedIn}
          assistantOn={info.assistant}
          onAssistantOn={(on) => {
            const latestProject = fresh.current;
            if (!latestProject) return;
            writeSource(
              BINDER_FILE,
              writeBinderAssistant(latestProject.pages[BINDER_FILE], on),
            );
            if (!on) runs.stop();
          }}
        />
      )}
      {searching !== null && (
        <SearchDialog
          pages={searchPages}
          initial={searching}
          onClose={() => setSearching(null)}
          onOpen={(path, query) => {
            setSearching(null);
            const inFile = /^(.*)#page=(\d+)$/.exec(path);
            if (inFile) {
              const page = Number(inFile[2]);
              const found = items.find((entry) => entry.path === inFile[1]);
              readSource(inFile[1], {
                page: found?.file && isPaged(found.file) ? page : null,
                highlight: null,
                find: query,
                passage: null,
              });
              return;
            }
            setReading(null);
            showItem(path);
            requestAnimationFrame(() => openFind(query));
          }}
        />
      )}
    </div>
  );

  return (
    <WorkspaceProvider value={workspace}>
      <ReferencesProvider markdown={item?.markdown ?? ""} page={selected} live>
        {shell}
      </ReferencesProvider>
    </WorkspaceProvider>
  );
}
