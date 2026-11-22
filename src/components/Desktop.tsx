import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import App from "@/App";
import { AccountDialog } from "@/components/AccountDialog";
import { AccountMenu } from "@/components/AccountMenu";
import { BinderPicker } from "@/components/BinderPicker";
import {
  folderSync,
  type FolderSync,
  type Held,
  type Link,
  type SyncState,
} from "@scholarkit/editor/lib/link-sync";
import { hasWindowButtons } from "@scholarkit/editor/lib/platform";
import { forgetFolder, loadFolder, saveFolder } from "@/lib/prefs";
import {
  BinderServer,
  desktopTransport,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { desktopStore, type BinderStore } from "@/lib/store";
import { updater } from "@/lib/updates";
import { t, tn } from "@scholarkit/i18n";
import { saveBeforeSwitch } from "@/lib/languages";

const server = new BinderServer(desktopTransport);

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : String(error));
};

/** The folder's own name: the last part of its path. */
const folderName = (dir: string) =>
  dir
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || "Binder";

/** A name a folder can have: a binder's name without the marks a file system refuses. */
export const asFolderName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "") || "Binder";

type Status = { text: string; warn?: boolean };

/** What the status bar says about a synced binder. */
export function syncStatus(state: SyncState): Status {
  switch (state.kind) {
    case "syncing":
      return { text: t("Saved. Syncing…") };
    case "synced":
      return state.held.length
        ? heldStatus(state.held)
        : { text: t("Saved and synced") };
    case "offline":
      return { text: t("Saved. Not synced: the server can't be reached"), warn: true };
    case "signed-out":
      return { text: t("Saved. Sign in to sync"), warn: true };
    case "gone":
      return {
        text: t("Saved. Not synced: this binder is no longer in your account"),
        warn: true,
      };
    case "error":
      return {
        text: t("Saved. Not synced: {message}", { message: state.message }),
        warn: true,
      };
  }
}

/** Synced, but for files the account didn't take: how many, and why. */
function heldStatus(held: Held[]): Status {
  const text = held.some((file) => file.reason === "full")
    ? tn(
        held.length,
        "Saved and synced. {count} file stays on this computer: your account is full",
        "Saved and synced. {count} files stay on this computer: your account is full",
      )
    : tn(
        held.length,
        "Saved and synced. {count} file stays on this computer: too large for your account",
        "Saved and synced. {count} files stay on this computer: too large for your account",
      );
  return { text, warn: true };
}

/** An open folder: its store, and its sync when it is linked and signed in. */
interface Session {
  id: number;
  dir: string;
  store: ReturnType<typeof desktopStore>;
  /** The store the app uses: the folder's, telling of what a sync changed. */
  appStore: BinderStore;
  projectId: string | null;
  sync: FolderSync | null;
}

let sessions = 0;

async function openSession(dir: string, signedIn: boolean): Promise<Session> {
  const store = desktopStore(dir);
  const session: Session = {
    id: ++sessions,
    dir,
    store,
    appStore: store,
    projectId: null,
    sync: null,
  };
  const link = await invoke<Link | null>("link_load", { dir }).catch(() => null);
  if (!link) return session;
  session.projectId = link.projectId;
  if (!signedIn) return session;

  // A binder you can only read syncs one way. Unreachable, it is taken as yours.
  const info = await server.project(link.projectId).catch(() => null);
  const projectId = link.projectId;
  const sync = folderSync({
    server,
    folder: store.folder,
    link,
    writable: info?.writable ?? true,
    transfer: {
      stored: async () => new Set((await server.assets(projectId)).map((a) => a.hash)),
      upload: (path, ref) =>
        invoke<"sent" | "full" | "too-large">("link_upload_file", {
          dir,
          path,
          projectId,
          hash: ref.hash,
          contentType: ref.type,
        }).then((outcome) => (outcome === "sent" ? undefined : outcome)),
      download: (path, ref) =>
        invoke<void>("link_download_file", { dir, path, projectId, hash: ref.hash }),
    },
    saveLink: (next) =>
      invoke<void>("link_save", { dir, projectId: next.projectId, state: next.state }),
  });
  session.sync = sync;
  const first = sync.run();
  const touched = <T,>(work: Promise<T>) => {
    sync.touch();
    return work;
  };
  session.appStore = {
    ...store,
    // The folder is read after the first sync, or after a few seconds without one.
    load: async () => {
      await Promise.race([first, new Promise((done) => setTimeout(done, 5_000))]);
      return store.load();
    },
    subscribe: sync.onChanges,
    onFiles: sync.onFiles,
    writePage: (path, source) => touched(store.writePage(path, source)),
    writeFile: (path, data) => touched(store.writeFile(path, data)),
    rename: (from, to) => touched(store.rename(from, to)),
    remove: (path) => touched(store.remove(path)),
    download: (url, path) => touched(store.download!(url, path)),
  };
  return session;
}

/**
 * The desktop app: a binder is a folder on disk, by default one in the
 * Binder folder in your home folder. Shows the binder that was open
 * last, or the binders to pick from. Signed in to the Scholarkit
 * account, a binder can sync with the account, and a binder from the
 * account can be opened here.
 */
export function Desktop() {
  const [folder, setFolder] = useState(loadFolder);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Counts the changes to the folder's link: each one opens the folder anew.
  const [linked, setLinked] = useState(0);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  // The macOS window buttons sit over the app's top left corner, which
  // makes room for them. A full-screen window has none.
  useEffect(() => {
    if (!hasWindowButtons) return;
    const root = document.documentElement;
    root.classList.add("window-buttons");
    let live = true;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const sync = () =>
          void appWindow.isFullscreen().then(
            (full) => live && root.classList.toggle("window-buttons", !full),
            () => {},
          );
        sync();
        const unlisten = await appWindow.onResized(sync);
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  // A switch to another interface language reloads the window: the items still waiting go first.
  useEffect(() => {
    if (!session) return;
    return saveBeforeSwitch(() => session.store.flush());
  }, [session]);

  // A restart to install an update writes the items still waiting first.
  useEffect(() => {
    if (!session || !updater) return;
    return updater.saveWith(() => session.store.flush());
  }, [session]);

  useEffect(() => {
    invoke<boolean>("account_signed_in").then(setSignedIn, () => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    server.me().then(
      (me) => {
        if (!current) return;
        if (me) setAccount(me);
        else setSignedIn(false);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!folder || signedIn === null) return;
    let current = true;
    let opened: Session | null = null;
    void openSession(folder, signedIn).then((next) => {
      if (!current) {
        next.sync?.stop();
        return;
      }
      opened = next;
      setSession(next);
      setSyncState(next.sync?.state() ?? null);
      next.sync?.onState((state) => {
        if (!current) return;
        setSyncState(state);
        if (state.kind === "signed-out") setSignedIn(false);
      });
    });
    return () => {
      current = false;
      opened?.sync?.stop();
      void opened?.store.flush().catch(() => {});
    };
  }, [folder, signedIn, linked]);

  // Items still waiting to be written are written before the window
  // closes, and a window that comes back syncs.
  useEffect(() => {
    if (!session) return;
    const onHide = () => void session.store.flush().catch(() => {});
    const onFocus = () => void session.sync?.run();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onFocus);
      onHide();
    };
  }, [session]);

  /** Opens a folder as the binder, and puts it at the top of the recent ones. */
  const openBinder = useCallback(async (dir: string) => {
    const opened = await invoke<{ path: string }>("binders_opened", { dir }).catch(
      fail,
    );
    saveFolder(opened.path);
    setFolder(opened.path);
  }, []);

  // The binder that was open last comes back, unless its folder is gone.
  useEffect(() => {
    const last = loadFolder();
    if (!last) return;
    invoke<{ path: string }>("binders_opened", { dir: last }).then(
      (opened) => {
        saveFolder(opened.path);
        setFolder(opened.path);
      },
      () => {
        forgetFolder();
        setFolder(null);
      },
    );
  }, []);

  const closeBinder = () => {
    void session?.store.flush().catch(() => {});
    forgetFolder();
    setFolder(null);
  };

  const renameBinder = async (name: string) => {
    if (!folder || !session) return;
    await session.store.flush();
    const moved = await invoke<string>("binders_rename", { dir: folder, name }).catch(
      fail,
    );
    // The binder in the account gets the name too, when it is yours to rename.
    if (session.projectId && signedIn) {
      await server.renameProject(session.projectId, name).catch(() => {});
    }
    saveFolder(moved);
    setFolder(moved);
  };

  const signIn = async (create: boolean) => {
    setAccount(await invoke<Account>("account_sign_in", { create }).catch(fail));
    setSignedIn(true);
  };

  const signOut = async () => {
    await invoke("account_sign_out").catch(fail);
    setAccount(null);
    setSignedIn(false);
  };

  const link = async () => {
    if (!folder) return;
    await session?.store.flush();
    const project = await server.createProject(folderName(folder), "linked");
    await invoke("link_save", { dir: folder, projectId: project.id, state: "" }).catch(
      fail,
    );
    setLinked((n) => n + 1);
  };

  const unlink = async () => {
    if (!folder) return;
    await invoke("link_remove", { dir: folder }).catch(fail);
    setLinked((n) => n + 1);
  };

  /** The account's binders that have no folder on this computer yet. */
  const accountBinders = useCallback(
    async (dirs: string[]): Promise<ServerProject[]> => {
      const [binders, links] = await Promise.all([
        server.projects(),
        Promise.all(
          dirs.map((dir) =>
            invoke<Link | null>("link_load", { dir }).catch(() => null),
          ),
        ),
      ]);
      const here = new Set(links.map((found) => found?.projectId));
      return binders.filter((binder) => !here.has(binder.id));
    },
    [],
  );

  /** Makes a folder for a binder of the account, and syncs it. */
  const openFromAccount = useCallback(
    async (binder: ServerProject) => {
      const dir = await invoke<string>("binders_create", {
        name: asFolderName(binder.name),
        unique: true,
      }).catch(fail);
      await invoke("link_save", { dir, projectId: binder.id, state: "" }).catch(fail);
      await openBinder(dir);
      setLinked((n) => n + 1);
    },
    [openBinder],
  );
  const fromAccount = useMemo(
    () => (signedIn ? { list: accountBinders, open: openFromAccount } : undefined),
    [signedIn, accountBinders, openFromAccount],
  );

  const status = useMemo<Status | undefined>(() => {
    if (!session?.projectId) return undefined;
    if (!signedIn) return syncStatus({ kind: "signed-out" });
    return syncState ? syncStatus(syncState) : undefined;
  }, [session, signedIn, syncState]);

  const accountDialog = signingIn && (
    <AccountDialog
      onSignIn={async (create) => {
        await signIn(create);
        setSigningIn(false);
      }}
      onCancelSignIn={() => void invoke("account_cancel_sign_in")}
      onClose={() => {
        void invoke("account_cancel_sign_in");
        setSigningIn(false);
      }}
    />
  );

  const accountMenu = (
    <AccountMenu
      signedIn={signedIn === true}
      account={account}
      linked={folder ? Boolean(session?.projectId) : undefined}
      onSignIn={() => setSigningIn(true)}
      onLink={link}
      onUnlink={unlink}
      onManage={() =>
        void invoke<string>("account_server").then((url) =>
          invoke("open_in_browser", { url: `${url}/account` }),
        )
      }
      onSignOut={signOut}
    />
  );

  if (!folder) {
    return (
      <>
        <BinderPicker
          onOpen={openBinder}
          account={accountMenu}
          fromAccount={fromAccount}
        />
        {accountDialog}
      </>
    );
  }

  if (!session || session.dir !== folder) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <p className="text-sm text-muted-foreground" role="status">
          {t("Opening your binder…")}
        </p>
      </div>
    );
  }

  return (
    <>
      <App
        key={session.id}
        store={session.appStore}
        onSwitchBinder={closeBinder}
        onRenameBinder={renameBinder}
        status={status}
        account={accountMenu}
      />
      {accountDialog}
    </>
  );
}
