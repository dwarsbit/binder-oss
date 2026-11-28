import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import {
  START_INPUT,
  START_LINK,
  StartFooter,
  StartPage,
  StartSection,
} from "@scholarkit/editor/components/StartPage";
import { dragWindow, formatOpened } from "@scholarkit/editor/lib/platform";
import { BINDER_FILE, writeBinderInfo } from "@/lib/binder";
import type { ServerProject } from "@/lib/server";
import { ConfirmDialog } from "@scholarkit/editor/components/ConfirmDialog";
import { Mark } from "./Mark";
import { t } from "@scholarkit/i18n";

interface Recent {
  name: string;
  path: string;
  openedAt: number;
}

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : messageOf(error));
};

/** The binders of the account that aren't on this computer, and how to open one here. */
export interface FromAccount {
  /** The account's binders without a folder among these. */
  list: (dirs: string[]) => Promise<ServerProject[]>;
  /** Makes a folder for the binder in the Binder folder, syncs it and opens it. */
  open: (binder: ServerProject) => Promise<void>;
}

/**
 * The desktop app without an open binder: make a binder in the Binder
 * folder, or open one you had open before, or any folder. Signed in,
 * also a binder from the account.
 */
export function BinderPicker({
  onOpen,
  account,
  fromAccount,
}: {
  onOpen: (dir: string) => Promise<void>;
  /** The account menu, or Sign in, at the top right. */
  account?: React.ReactNode;
  /** Signed in: the account's binders to open here. */
  fromAccount?: FromAccount;
}) {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [root, setRoot] = useState("");
  const [name, setName] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Recent | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Recent | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [elsewhere, setElsewhere] = useState<ServerProject[] | null>(null);

  const refresh = () =>
    invoke<{ root: string; recent: Recent[] }>("binders_list").then(
      (binders) => {
        setRoot(binders.root);
        setRecent(binders.recent);
      },
      (error: unknown) => {
        setRecent([]);
        setProblem(messageOf(error));
      },
    );

  useEffect(() => {
    document.title = "Binder";
    void refresh();
  }, []);

  // The account's binders, once the binders here are known.
  useEffect(() => {
    if (!fromAccount || recent === null) return;
    let current = true;
    fromAccount.list(recent.map((binder) => binder.path)).then(
      (found) => current && setElsewhere(found),
      () => current && setElsewhere([]),
    );
    return () => {
      current = false;
    };
  }, [fromAccount, recent]);

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
      const dir = await invoke<string>("binders_create", { name, unique: false }).catch(
        fail,
      );
      await invoke("project_write_page", {
        dir,
        path: BINDER_FILE,
        source: writeBinderInfo(undefined, question),
      }).catch(fail);
      await onOpen(dir);
    });

  const openFolder = () =>
    run(async () => {
      // The app shows the dialog itself: only a folder picked there joins the list of binders.
      const picked = await invoke<Recent | null>("binders_pick");
      if (picked) await onOpen(picked.path);
    });

  const rename = () =>
    run(async () => {
      if (!renaming) return;
      await invoke("binders_rename", { dir: renaming.path, name: newName }).catch(fail);
      setRenaming(null);
      await refresh();
    });

  const trash = (binder: Recent) =>
    run(async () => {
      await invoke("binders_trash", { dir: binder.path }).catch(fail);
      await refresh();
    });

  return (
    <>
      <StartPage
        mark={<Mark className="size-11" />}
        title={t("New binder")}
        onDrag={dragWindow}
        account={account}
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
          {root && (
            <p className="mt-1 truncate text-xs text-muted-foreground" title={root}>
              {t("New binders are folders in {root}.", { root })}
            </p>
          )}
          {problem && !renaming && (
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
          >
            <button
              type="button"
              className={START_LINK}
              disabled={busy}
              onClick={() => void openFolder()}
            >
              <FolderOpen aria-hidden />
              {t("Open folder…")}
            </button>
          </StartFooter>
        </form>

        <StartSection title={t("Recent")}>
          {recent === null ? (
            <p className="px-1.5 py-1.5 text-sm text-muted-foreground" role="status">
              {t("Loading…")}
            </p>
          ) : recent.length === 0 ? (
            <p className="px-1.5 py-1.5 text-sm text-muted-foreground">
              {t("No binders yet. Create one above or open a folder.")}
            </p>
          ) : (
            <ul className="-mx-1 space-y-0.5">
              {recent.map((binder) => (
                <li
                  key={binder.path}
                  className="group relative flex items-center rounded-md hover:bg-muted"
                >
                  <button
                    type="button"
                    title={binder.path}
                    disabled={busy}
                    onClick={() => void run(() => onOpen(binder.path))}
                    className="flex min-w-0 flex-1 items-baseline gap-3 px-2.5 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {binder.name}
                    </span>
                    <span className="flex-none text-2xs text-muted-foreground group-focus-within:invisible group-hover:invisible">
                      {formatOpened(binder.openedAt)}
                    </span>
                  </button>
                  {/* Over the date on hover, so the row keeps its height. */}
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
                      aria-label={t("Move {name} to the trash", { name: binder.name })}
                      title={t("Move binder to the trash")}
                      onClick={() => setDeleting(binder)}
                      className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </StartSection>

        {fromAccount && elsewhere && elsewhere.length > 0 && (
          <StartSection title={t("In your account")}>
            <ul className="-mx-1 space-y-0.5">
              {elsewhere.map((binder) => (
                <li
                  key={binder.id}
                  className="flex items-center gap-3 rounded-md px-2.5 py-1 hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{binder.name}</span>
                    {binder.role !== "owner" && (
                      <span className="block truncate text-2xs text-muted-foreground">
                        {t("Shared by {name}", { name: binder.owner.name })}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={cn(BUTTON, "h-6 flex-none px-2 text-xs")}
                    disabled={busy}
                    onClick={() => void run(() => fromAccount!.open(binder))}
                  >
                    {t("Open here")}
                  </button>
                </li>
              ))}
            </ul>
          </StartSection>
        )}
      </StartPage>

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
            <p className="mt-2 text-xs text-muted-foreground">
              {t("The binder's folder gets the same name.")}
            </p>
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
          title={t("Move “{name}” to the trash?", { name: deleting.name })}
          body={t(
            "The binder's folder, with every item and file in it, moves to the trash on your computer. You can restore it from there until you empty the trash.",
          )}
          confirmLabel={t("Move to trash")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void trash(deleting);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
