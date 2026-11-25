import { RefreshCw, RefreshCwOff, UserRound } from "lucide-react";
import { AccountMenu as Menu, type MenuAction } from "@scholarkit/account-menu";
import { HEADER_BUTTON } from "@scholarkit/editor/components/Dialog";
import type { Account, Usage } from "@scholarkit/editor/lib/account";
import { t } from "@scholarkit/i18n";

const ROW =
  "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent";

/**
 * The account: the avatar at the end of the header, or a row at the foot of the desktop app's
 * binder list. Signed out, it signs in. Signed in, it opens the same menu as in Cursive, Polemic
 * and on the Scholarkit home page: who is signed in, the plan with its usage, whether the open
 * binder syncs (in the desktop app), Upgrade, the account page and Sign out.
 */
export function AccountMenu({
  signedIn,
  account,
  loadUsage,
  linked,
  onSignIn,
  onLink,
  onUnlink,
  onManage,
  onUpgrade,
  external = true,
  onSignOut,
  place = "header",
}: {
  /** Where it sits: the end of the header, or a row at the foot of a list. */
  place?: "header" | "row";
  signedIn: boolean;
  /** The signed-in account; null while its name can't be fetched. */
  account: Account | null;
  /** GET /api/usage, each time the menu opens. */
  loadUsage?: () => Promise<Usage | null>;
  /** Whether the open binder syncs with the account; undefined with no binder open. */
  linked?: boolean;
  onSignIn?: () => void;
  onLink?: () => Promise<void>;
  onUnlink?: () => Promise<void>;
  onManage: () => void;
  /** Opens the plan on the account page. */
  onUpgrade?: () => void;
  /** Whether the account page opens in the browser, outside the app. */
  external?: boolean;
  onSignOut: () => Promise<void>;
}) {
  if (!signedIn) {
    if (place === "header") {
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

  const syncs = linked !== undefined && onLink && onUnlink;
  const actions: MenuAction[] = !syncs
    ? []
    : linked
      ? [
          {
            label: t("Stop syncing this binder"),
            icon: <RefreshCwOff aria-hidden />,
            run: onUnlink,
          },
        ]
      : [
          {
            label: t("Sync this binder to your account"),
            icon: <RefreshCw aria-hidden />,
            run: onLink,
          },
        ];
  return (
    <Menu
      place={place}
      account={account && { ...account, photo: account.image }}
      plan={account?.plan}
      loadUsage={loadUsage}
      note={
        syncs
          ? linked
            ? t("This binder syncs with your account.")
            : t("This binder is only on this computer.")
          : undefined
      }
      actions={actions}
      onManage={onManage}
      onUpgrade={onUpgrade}
      external={external}
      onSignOut={onSignOut}
    />
  );
}
