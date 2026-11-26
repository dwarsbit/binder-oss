import * as Y from "yjs";
import { browserSaveFile } from "@scholarkit/editor/lib/account";
import { mediaType } from "@scholarkit/editor/lib/file-types";
import type { Project } from "@scholarkit/editor/lib/paths";
import {
  diffPages,
  LAYOUT,
  readAssets,
  readPages,
  removeFromDoc,
  renameInDoc,
  writeAsset,
  writeDocPage,
  type AssetRef,
  type PageChange,
} from "@scholarkit/editor/lib/project-doc";
import {
  connectToServer,
  sha256,
  type Connect,
  type Connection,
} from "@scholarkit/editor/lib/sync";
import { openAlexKeyOf, type BinderServer } from "./server";
import type { BinderStore } from "./store";
import { t } from "@scholarkit/i18n";

/** Binder's own files: what it works out from the binder, kept apart from it. */
const isOwnFile = (path: string) => path === ".binder" || path.startsWith(".binder/");

/** A page of HTML, as the server hands it over. */
const isPage = (contentType: string) =>
  contentType === "" ||
  contentType === "text/html" ||
  contentType === "application/xhtml+xml";

/**
 * What Binder works out from a binder (`.binder/`, such as the text of
 * its PDFs), kept in this browser: it can always be worked out again,
 * so it isn't sent to the account. In IndexedDB, or in memory where the
 * browser has none.
 */
export interface LocalFiles {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, bytes: ArrayBuffer): Promise<void>;
}

export function memoryFiles(): LocalFiles {
  const files = new Map<string, ArrayBuffer>();
  return {
    get: async (key) => files.get(key) ?? null,
    set: async (key, bytes) => void files.set(key, bytes),
  };
}

export function browserFiles(): LocalFiles {
  const fallback = memoryFiles();
  let opened: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (opened ??= new Promise((resolve) => {
      try {
        const request = indexedDB.open("binder", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("files");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const run = <T>(
    mode: IDBTransactionMode,
    work: (files: IDBObjectStore) => IDBRequest<T>,
  ) =>
    open().then(
      (db) =>
        db &&
        new Promise<T | null>((resolve) => {
          try {
            const request = work(db.transaction("files", mode).objectStore("files"));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        }),
    );
  return {
    get: async (key) => {
      const found = await run<unknown>("readonly", (files) => files.get(key));
      return found instanceof ArrayBuffer ? found : fallback.get(key);
    },
    set: async (key, bytes) => {
      const done = await run("readwrite", (files) => files.put(bytes, key));
      if (done === null) await fallback.set(key, bytes);
    },
  };
}

/**
 * A binder in the Scholarkit account, open in the browser: the binder's
 * document, kept in step with the server while the page is open. Items
 * are pages of the document and their PDFs and kept pages are its
 * assets, as Cursive keeps a project. What is typed here reaches other
 * windows as it is typed, and their changes arrive through `subscribe`.
 */
export function serverStore(
  server: BinderServer,
  id: string,
  {
    connect = connectToServer,
    local = browserFiles(),
  }: { connect?: Connect; local?: LocalFiles } = {},
): BinderStore & {
  /** Whether everything typed has reached the server. */
  saved(): boolean;
  onSaved(listener: () => void): () => void;
  close(): void;
} {
  const doc = new Y.Doc();
  const LOCAL = "binder";
  const listeners = new Set<(changes: PageChange[]) => void>();
  const fileListeners = new Set<(files: string[]) => void>();
  const savedListeners = new Set<() => void>();
  let connection: Connection | null = null;
  let closed = false;
  // The items and files as the app last saw them.
  let seen: Record<string, string> = {};
  let seenFiles: Record<string, AssetRef> = {};
  // Empty folders live in this window only: the document keeps pages.
  let folders: string[] = [];
  // Files read once, by their hash: a file with the same bytes is the same file.
  const bytes = new Map<string, Promise<ArrayBuffer | null>>();
  // The last links fetched, so saving one into the binder fetches it once.
  const fetched = new Map<string, { contentType: string; bytes: ArrayBuffer }>();

  const assetUrl = (ref: AssetRef) =>
    `/api/projects/${encodeURIComponent(id)}/assets/${ref.hash}`;
  const localKey = (path: string) => `${id}/${path}`;

  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    const pages = readPages(doc);
    const changes = origin === LOCAL ? [] : diffPages(seen, pages);
    seen = pages;
    if (changes.length > 0) listeners.forEach((listener) => listener(changes));
    const files = readAssets(doc);
    const changed =
      Object.keys(files).length !== Object.keys(seenFiles).length ||
      Object.entries(files).some(([path, ref]) => seenFiles[path]?.hash !== ref.hash);
    seenFiles = files;
    if (changed && origin !== LOCAL) {
      const list = Object.keys(files).sort();
      fileListeners.forEach((listener) => listener(list));
    }
  });

  const change = (work: () => void) => {
    doc.transact(work, LOCAL);
    return Promise.resolve();
  };

  const writeFile = async (path: string, data: Blob) => {
    const content = await data.arrayBuffer();
    if (isOwnFile(path)) return local.set(localKey(path), content);
    const body = new Uint8Array(content);
    const type = data.type || mediaType(path);
    const hash = await sha256(body);
    // The bytes go first, so every file the document names can be fetched.
    await server.uploadAsset(id, hash, body, type);
    bytes.set(hash, Promise.resolve(content));
    await change(() => writeAsset(doc, path, { hash, size: body.length, type }));
  };

  const remember = (url: string, file: { contentType: string; bytes: ArrayBuffer }) => {
    fetched.set(url, file);
    // A PDF can be large: only the last few stay.
    while (fetched.size > 3) fetched.delete(fetched.keys().next().value!);
  };

  return {
    place: "account",
    load: async (): Promise<Project> => {
      const [info, opened] = await Promise.all([server.project(id), connect(id, doc)]);
      if (closed) {
        opened.close();
        throw new Error(t("The binder was closed."));
      }
      connection = opened;
      opened.onUnsynced(() => savedListeners.forEach((listener) => listener()));
      if (info.writable && doc.getMap("meta").get("layout") === undefined) {
        doc.transact(() => doc.getMap("meta").set("layout", LAYOUT), LOCAL);
      }
      seen = readPages(doc);
      seenFiles = readAssets(doc);
      return {
        name: info.name,
        folders,
        pages: { ...seen },
        files: Object.keys(seenFiles).sort(),
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onFiles: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    writePage: (path, source) => change(() => writeDocPage(doc, path, source)),
    createFolder: async (path) => {
      if (!folders.includes(path)) folders = [...folders, path];
    },
    rename: (from, to) => {
      folders = folders.map((folder) =>
        folder === from
          ? to
          : folder.startsWith(`${from}/`)
            ? to + folder.slice(from.length)
            : folder,
      );
      return change(() => renameInDoc(doc, from, to));
    },
    remove: (path) => {
      folders = folders.filter(
        (folder) => folder !== path && !folder.startsWith(`${path}/`),
      );
      return change(() => removeFromDoc(doc, path));
    },
    writeFile,
    fileUrl: async (path) => {
      const ref = readAssets(doc)[path];
      return ref ? assetUrl(ref) : null;
    },
    openFile: async (path) => {
      const ref = readAssets(doc)[path];
      if (ref)
        await browserSaveFile(assetUrl(ref), path.slice(path.lastIndexOf("/") + 1));
    },
    readBytes: async (path) => {
      if (isOwnFile(path)) return local.get(localKey(path));
      const ref = readAssets(doc)[path];
      if (!ref) return null;
      let found = bytes.get(ref.hash);
      if (!found) {
        found = fetch(assetUrl(ref), { credentials: "same-origin" }).then(
          (response) => (response.ok ? response.arrayBuffer() : null),
          () => null,
        );
        // A failed read is tried again next time.
        void found.then((read) => read || bytes.delete(ref.hash));
        bytes.set(ref.hash, found);
      }
      return found;
    },
    fileHashes: async () =>
      Object.fromEntries(
        Object.entries(readAssets(doc)).map(([path, ref]) => [path, ref.hash]),
      ),
    fetchWeb: async (url) => {
      const file = await server.fetchWeb(url);
      remember(file.url, file);
      return {
        url: file.url,
        contentType: file.contentType,
        html: isPage(file.contentType) ? new TextDecoder().decode(file.bytes) : "",
      };
    },
    openAccessPdfs: (doi) => server.openAccessPdfs(doi),
    searchPapers: (q) => server.searchPapers(q),
    paperSearchAccess: () => server.paperSearchAccess(),
    openAlexKey: openAlexKeyOf(server),
    download: async (url, path) => {
      const file = fetched.get(url) ?? (await server.fetchWeb(url));
      fetched.delete(url);
      await writeFile(
        path,
        new Blob([file.bytes], { type: file.contentType || mediaType(path) }),
      );
    },
    saved: () => (connection?.unsynced() ?? 0) === 0,
    onSaved: (listener) => {
      savedListeners.add(listener);
      return () => savedListeners.delete(listener);
    },
    close: () => {
      closed = true;
      connection?.close();
      doc.destroy();
    },
  };
}
