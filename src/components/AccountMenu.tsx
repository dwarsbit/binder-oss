import { ExternalLink, LogOut, RefreshCw, RefreshCwOff, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HEADER_BUTTON, messageOf } from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import type { Account } from "@/lib/server";
import { t } from "@scholarkit/i18n";

/** First and last name as two letters: "Anna de Vries" is AV. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((word) => [...word][0] ?? "")
    .filter((letter) => /\p{L}|\p{N}/u.test(letter));
  const picked =
    letters.length > 2 ? [letters[0], letters[letters.length - 1]] : letters;
  return picked.join("").toUpperCase();
}

export function Avatar({
  name,
  large,
  header,
}: {
  name?: string;
  large?: boolean;
  /** The size at the end of the header, as in Cursive and Polemic. */
  header?: boolean;
}) {
  const initials = name ? initialsOf(name) : "";
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-full font-semibold",
        large
          ? "size-9 text-[13px]"
          : header
            ? "size-7 text-[11px]"
            : "size-5 text-[9px]",
        initials
          ? "bg-primary-fill text-primary-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {initials || <UserRound className={large || header ? "size-4" : "size-3"} />}
    </span>
  );
}

const ROW =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent";
const ITEM =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent disabled:opacity-50 [&>svg]:size-3.5 [&>svg]:flex-none [&>svg]:text-muted-foreground";

/**
 * The account: the avatar at the end of the header, as in Cursive and
 * Polemic, or a row at the foot of the desktop app's binder list. Signed
 * out, it signs in. Signed in, it opens who is signed in, whether the open
 * binder syncs (in the desktop app), the account page and Sign out.
 */
export function AccountMenu({
  signedIn,
  account,
  linked,
  onSignIn,
  onLink,
  onUnlink,
  onManage,
  external = true,
  onSignOut,
  place = "header",
}: {
  /** Where it sits: the end of the header, or a row at the foot of a list. */
  place?: "header" | "row";
  signedIn: boolean;
  /** The signed-in account; null while its name can't be fetched. */
  account: Account | null;
  /** Whether the open binder syncs with the account; undefined with no binder open. */
  linked?: boolean;
  onSignIn?: () => void;
  onLink?: () => Promise<void>;
  onUnlink?: () => Promise<void>;
  onManage: () => void;
  /** Whether the account page opens in the browser, outside the app. */
  external?: boolean;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const header = place === "header";

  if (!signedIn) {
    if (header) {
      return (
        <button type="button" className={HEADER_BUTTON} onClick={onSignIn}>
          {t("Sign in")}
        </button>
      );
    }
    return (
      <button type="button" className={ROW} onClick={onSignIn}>
        <UserRound className="size-3.5 flex-none text-muted-foreground" aria-hidden />
        <span className="flex-1">{t("Sign in")}</span>
        <span className="text-xs text-muted-foreground">{t("to sync")}</span>
      </button>
    );
  }

  /** Runs a menu item's work. The menu closes when it worked, and says why when it didn't. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      setOpen(false);
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={root} className={header ? "relative flex-none" : "relative"}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={header ? t("Scholarkit account") : undefined}
        title={account ? `${account.name} (${account.email})` : t("Scholarkit account")}
        onClick={() => {
          setProblem(null);
          setOpen(!open);
        }}
        className={header ? "block rounded-full" : cn(ROW, open && "bg-accent")}
      >
        <Avatar name={account?.name} header={header} />
        {!header && (
          <span className="min-w-0 flex-1 truncate">
            {account?.name ?? t("Scholarkit account")}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("Scholarkit account")}
          className={cn(
            "popover absolute z-30 w-72 p-1 text-[13px]",
            header ? "top-full right-0 mt-1.5" : "bottom-full left-0 mb-1.5",
          )}
        >
          <div className="flex items-center gap-3 px-2 pt-2 pb-3">
            <Avatar name={account?.name} large />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{account?.name ?? t("Signed in")}</p>
              {account && (
                <p className="truncate text-xs text-muted-foreground">
                  {account.email}
                </p>
              )}
            </div>
          </div>
          {linked !== undefined && onLink && onUnlink && (
            <div className="border-t px-2 pt-2 pb-1 text-xs text-muted-foreground">
              {linked
                ? t("This binder syncs with your account.")
                : t("This binder is only on this computer.")}
            </div>
          )}
          {linked === undefined || !onLink || !onUnlink ? null : linked ? (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              disabled={busy}
              onClick={() => void run(onUnlink)}
            >
              <RefreshCwOff aria-hidden />
              {t("Stop syncing this binder")}
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={ITEM}
              disabled={busy}
              onClick={() => void run(onLink)}
            >
              <RefreshCw aria-hidden />
              {t("Sync this binder to your account")}
            </button>
          )}
          {problem && (
            <p className="px-2 py-1 text-xs text-destructive" role="alert">
              {problem}
            </p>
          )}
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            onClick={() => {
              onManage();
              setOpen(false);
            }}
          >
            <UserRound aria-hidden />
            <span className="flex-1">{t("Manage your account")}</span>
            {external && <ExternalLink aria-hidden />}
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM}
            disabled={busy}
            onClick={() => void run(onSignOut)}
          >
            <LogOut aria-hidden />
            {t("Sign out")}
          </button>
        </div>
      )}
    </div>
  );
}
