import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import App from "@/App";
import {
  BUTTON,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import {
  START_INPUT,
  StartFooter,
  StartPage,
} from "@scholarkit/editor/components/StartPage";
import { BINDER_FILE, writeBinderInfo } from "@/lib/binder";
import {
  BinderServer,
  browserTransport,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { serverStore } from "@/lib/server-store";
import { Mark } from "./Mark";
import { AccountMenu } from "./AccountMenu";
import { AppLoading, HomeMark } from "@scholarkit/editor/components/AppShell";
import { webAddresses } from "@/lib/web-address";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";
import { saveBeforeSwitch } from "@/lib/languages";
import { setWorkLookup } from "@scholarkit/editor/references/lookup";

const server = new BinderServer(browserTransport);

/** The account's usage for the account menu. */
const loadUsage = () => server.usage();

/** The app's addresses: a new binder at /binder/projects, one binder at /binder/projects/<id>. */
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

/** A new binder, made in the account. The Scholarkit home lists the binders. */
function NewBinder({ account }: { account: Account }) {
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = t("New binder · Binder");
  }, []);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const binder = await server.createProject(name.trim(), "online");
      await fill(binder.id, question);
      go(ADDRESS.of(binder.id));
    } catch (error) {
      setProblem(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <StartPage
      mark={<Mark className="size-11" />}
      title={t("New binder")}
      corner={
        <HomeMark href="/" label={t("Scholarkit home")}>
          <Mark className="size-[22px]" />
        </HomeMark>
      }
      account={accountMenu(account)}
      below={rich("Your binders are on <0>the Scholarkit home</0>.", [
        (text) => (
          <a
            href="/"
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            {text}
          </a>
        ),
      ])}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // An empty name has nothing to create: point at the field.
          if (name.trim() === "") nameInput.current?.focus();
          else void create();
        }}
      >
        <input
          ref={nameInput}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Name, such as Thesis")}
          aria-label={t("Binder name")}
          maxLength={120}
          className={START_INPUT}
        />
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={2}
          placeholder={t("Your research question, if you have one yet")}
          aria-label={t("Research question")}
          className="mt-2 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-[13px] leading-normal outline-none focus:border-ring"
        />
        {problem && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {problem}
          </p>
        )}
        <StartFooter
          create={
            <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
              {t("Create")}
            </button>
          }
        />
      </form>
    </StartPage>
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
      onPlans={() => window.location.assign("/account#plan")}
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
 * Binder in the browser, on the Scholarkit server: a new binder at
 * /binder/projects, one binder at /binder/projects/<id>. Signed
 * out, it goes to the server's sign-in page and comes back.
 */
export function Web() {
  // DOIs, ISBNs, arXiv and PubMed IDs are looked up on the server, never at the source.
  useEffect(() => {
    setWorkLookup((kind, id) => server.lookUpWork(kind, id));
    return () => setWorkLookup(null);
  }, []);
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
    <NewBinder account={account} />
  );
}
