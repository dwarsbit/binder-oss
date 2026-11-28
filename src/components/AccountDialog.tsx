import { useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { t } from "@scholarkit/i18n";

/**
 * Signs the desktop app in to the Scholarkit account, in the browser.
 */
export function AccountDialog({
  note,
  onSignIn,
  onCancelSignIn,
  onClose,
}: {
  /** Why signing in is asked for now, in place of what an account does. */
  note?: string;
  onSignIn: (create: boolean) => Promise<void>;
  onCancelSignIn: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const signIn = async (create: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      await onSignIn(create);
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={t("Sign in to Scholarkit")} onClose={onClose}>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        {busy
          ? t("Finish signing in in your browser, then come back here.")
          : (note ??
            t(
              "Sign in to sync a binder with your account, and open it on another computer or in your browser. Binder uses your free Scholarkit account.",
            ))}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        {busy ? (
          <button type="button" className={BUTTON} onClick={onCancelSignIn}>
            {t("Cancel")}
          </button>
        ) : (
          <>
            <button type="button" className={BUTTON} onClick={() => void signIn(true)}>
              {t("Create account")}
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => void signIn(false)}
            >
              {t("Sign in")}
            </button>
          </>
        )}
      </div>

      {problem && (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}
