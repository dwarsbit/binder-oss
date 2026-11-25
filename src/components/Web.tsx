import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import App from "@/App";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import { formatOpened } from "@scholarkit/editor/lib/platform";
import { BINDER_FILE, writeBinderInfo } from "@/lib/binder";
import {
  BinderServer,
  browserTransport,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { serverStore } from "@/lib/server-store";
import { ConfirmDialog } from "./ConfirmDialog";
import { Mark } from "./Mark";
import { AccountMenu } from "./AccountMenu";
import { AppLoading, HomeMark } from "@scholarkit/editor/components/AppShell";
import { webAddresses } from "@/lib/web-address";
import { t } from "@scholarkit/i18n";
import { saveBeforeSwitch } from "@/lib/languages";

const server = new BinderServer(browserTransport);

/** The account's usage for the account menu. */
const loadUsage = () => server.usage();

/** The app's addresses: the list at /binder/projects, one binder at /binder/projects/<id>. */
const ADDRESS = webAddresses(import.meta.env.BASE_URL);

/** The avatar at the end of the header, as in the desktop app, without its syncing: here the account holds every binder. */
const accountMenu = (account: Account) => (
  <AccountMenu
    signedIn
    account={account}
    loadUsage={loadUsage}
    external={false}
    onManage={() => window.location.assign("/account")}
    onUpgrade={() => window.location.assign("/account#plan")}
    onSignOut={async () => {
      await server.signOut();
      window.location.assign("/sign-in");
    }}
  />
);

const subscribeToAddress = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

function go(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Writes a new binder's details and waits until the server has them. */
async function fill(id: string, question: string) {
  const store = serverStore(server, id);
  try {
    await store.load();
    const saved = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(t("The binder couldn't be saved. Try again."))),
        15_000,
      );
      store.onSaved(() => {
        if (!store.saved()) return;
        clearTimeout(timer);
        resolve();
      });
    });
    await store.writePage(BINDER_FILE, writeBinderInfo(undefined, question));
    await saved;
  } finally {
    store.close();
  }
}

/** The account's binders, and a field to make a new one. */
function Binders({ account }: { account: Account }) {
  const [binders, setBinders] = useState<ServerProject[] | null>(null);
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ServerProject | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<ServerProject | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    server.projects().then(setBinders, (error: unknown) => {
      setBinders([]);
      setProblem(messageOf(error));
    });

  useEffect(() => {
    document.title = "Binder";
    void refresh();
  }, []);

  /** Runs something and says why when it didn't work. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const binder = await server.createProject(name.trim(), "online");
      await fill(binder.id, question);
      go(ADDRESS.of(binder.id));
    });

  const rename = () =>
    run(async () => {
      if (!renaming) return;
      await server.renameProject(renaming.id, newName.trim());
      setRenaming(null);
      await refresh();
    });

  const remove = (binder: ServerProject) =>
    run(async () => {
      await server.deleteProject(binder.id);
      await refresh();
    });

  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto px-4 pt-10 pb-16">
      <div className="absolute top-2.5 left-3">
        <HomeMark href="/" label={t("Scholarkit home")}>
          <Mark className="size-[22px]" />
        </HomeMark>
      </div>
      <div className="absolute top-2 right-3">{accountMenu(account)}</div>
      <h1 className="mt-auto mb-6 flex flex-none flex-col items-center gap-3 text-lg font-semibold">
        <Mark className="size-14" />
        {t("Binder")}
      </h1>
      <div className="mb-auto w-full max-w-lg flex-none rounded-xl bg-card p-6 shadow-[var(--pop-shadow)]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            // An empty name has nothing to create: point at the field.
            if (name.trim() === "") nameInput.current?.focus();
            else void create();
          }}
        >
          <div className="flex gap-2">
            <input
              ref={nameInput}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("New binder name, such as Thesis")}
              aria-label={t("New binder name")}
              maxLength={120}
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className={cn(PRIMARY_BUTTON, "h-9 px-4")}
            >
              {t("Create")}
            </button>
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={2}
            placeholder={t("Your research question, if you have one yet")}
            aria-label={t("Research question")}
            className="mt-2 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[13px] leading-normal outline-none focus:border-ring"
          />
        </form>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Binders are kept in your Scholarkit account.")}
        </p>
        {problem && !renaming && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {problem}
          </p>
        )}

        <h2 className="mt-5 mb-1.5 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          {t("Your binders")}
        </h2>
        {binders === null ? (
          <p className="px-1.5 py-1.5 text-sm text-muted-foreground" role="status">
            {t("Loading…")}
          </p>
        ) : binders.length === 0 ? (
          <p className="px-1.5 py-1.5 text-sm text-muted-foreground">
            {t("No binders yet. Create one above.")}
          </p>
        ) : (
          <ul className="-mx-1 space-y-0.5">
            {binders.map((binder) => {
              const own = binder.role === "owner";
              return (
                <li
                  key={binder.id}
                  className="group relative flex items-center rounded-md hover:bg-muted"
                >
                  <a
                    href={ADDRESS.of(binder.id)}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                      event.preventDefault();
                      go(ADDRESS.of(binder.id));
                    }}
                    className="flex min-w-0 flex-1 items-baseline gap-3 px-2.5 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {binder.name}
                    </span>
                    <span
                      className={cn(
                        "flex-none text-2xs text-muted-foreground",
                        own && "group-focus-within:invisible group-hover:invisible",
                      )}
                    >
                      {own ? "" : `${binder.owner.name} · `}
                      {formatOpened(Date.parse(binder.updatedAt))}
                    </span>
                  </a>
                  {own && (
                    // Over the date on hover, so the row keeps its height.
                    <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={t("Rename {name}", { name: binder.name })}
                        title={t("Rename binder")}
                        onClick={() => {
                          setProblem(null);
                          setNewName(binder.name);
                          setRenaming(binder);
                        }}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={t("Delete {name}", { name: binder.name })}
                        title={t("Delete binder")}
                        onClick={() => setDeleting(binder)}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {renaming && (
        <Dialog title={t("Rename binder")} onClose={() => setRenaming(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim() !== "") void rename();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onFocus={(event) => event.target.select()}
              aria-label={t("Binder name")}
              maxLength={120}
              className="mt-3 h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
            />
            {problem && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={BUTTON}
                onClick={() => setRenaming(null)}
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={busy || newName.trim() === ""}
              >
                {t("Rename")}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={t("Delete “{name}”?", { name: deleting.name })}
          body={t(
            "The binder, with every item and file in it, is deleted from your account for everyone it's shared with. You can't undo this.",
          )}
          confirmLabel={t("Delete binder")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void remove(deleting);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

// A store closes a moment after its screen goes, so a screen that
// comes straight back (as React does in development) keeps it.
const closing = new WeakMap<object, ReturnType<typeof setTimeout>>();

/** One binder of the account, open. */
function OpenBinder({ id, account }: { id: string; account: Account }) {
  const store = useMemo(() => serverStore(server, id), [id]);
  const [info, setInfo] = useState<ServerProject | null>(null);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    clearTimeout(closing.get(store));
    const stop = store.onSaved(() => setSaved(store.saved()));
    return () => {
      stop();
      closing.set(
        store,
        setTimeout(() => store.close(), 0),
      );
    };
  }, [store]);

  useEffect(() => {
    let current = true;
    server.project(id).then(
      (binder) => current && setInfo(binder),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [id]);

  // A switch to another interface language reloads the page once the changes are in.
  useEffect(
    () =>
      saveBeforeSwitch(
        () =>
          new Promise<void>((resolve) => {
            if (store.saved()) return resolve();
            const stop = store.onSaved(() => {
              if (!store.saved()) return;
              stop();
              resolve();
            });
          }),
      ),
    [store],
  );

  // Leaving with changes still on their way asks first.
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!store.saved()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [store]);

  const status =
    info && !info.writable
      ? { text: t("You can read this binder. Your changes aren't saved"), warn: true }
      : saved
        ? undefined
        : { text: t("Saving…") };

  return (
    <App
      store={store}
      status={status}
      projectId={id}
      onSwitchBinder={() => go(ADDRESS.list)}
      homeHref="/"
      account={accountMenu(account)}
      onRenameBinder={
        info?.role === "owner"
          ? async (name) => setInfo(await server.renameProject(id, name))
          : undefined
      }
    />
  );
}

/**
 * Binder in the browser, on the Scholarkit server: the account's
 * binders at /binder/projects, one binder at /binder/projects/<id>. Signed
 * out, it goes to the server's sign-in page and comes back.
 */
export function Web() {
  const path = useSyncExternalStore(subscribeToAddress, () => window.location.pathname);

  // One address for the list, and old links (/binder/<id>) land on the binder's new address.
  useEffect(() => {
    const better = ADDRESS.better(path);
    if (better === null) return;
    window.history.replaceState(
      null,
      "",
      better + window.location.search + window.location.hash,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [path]);
  const [account, setAccount] = useState<Account | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    server.me().then(
      (me) => {
        if (me) setAccount(me);
        else {
          const back = window.location.pathname + window.location.search;
          window.location.assign(`/sign-in?next=${encodeURIComponent(back)}`);
        }
      },
      (error: unknown) => setProblem(messageOf(error)),
    );
  }, []);

  if (!account) {
    const retry = problem && (
      <button type="button" className={BUTTON} onClick={() => window.location.reload()}>
        {t("Try again")}
      </button>
    );
    // A binder opens into its layout; the list has none to show yet.
    if (ADDRESS.idIn(path)) {
      return (
        <AppLoading
          mark={<Mark className="size-[22px]" />}
          failed={Boolean(problem)}
          status={problem ?? t("Opening Binder…")}
        >
          {retry}
        </AppLoading>
      );
    }
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground" role="status">
            {problem ?? t("Opening Binder…")}
          </p>
          {retry}
        </div>
      </div>
    );
  }

  const id = ADDRESS.idIn(path);
  return id ? (
    <OpenBinder key={id} id={id} account={account} />
  ) : (
    <Binders account={account} />
  );
}
