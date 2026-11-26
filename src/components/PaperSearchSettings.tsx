import { useEffect, useState } from "react";
import { BUTTON, messageOf } from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import { t } from "@scholarkit/i18n";
import type { OpenAlexKeyStore } from "@/lib/store";

/**
 * The "Paper search" settings: an own OpenAlex key, kept with the
 * account, for searching papers on any plan.
 */
export function PaperSearchSettings({ keys }: { keys: OpenAlexKeyStore }) {
  const [ending, setEnding] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; problem: boolean } | null>(null);

  useEffect(() => {
    let current = true;
    keys.get().then(
      (kept) => current && setEnding(kept.saved ? kept.ending : null),
      () => current && setEnding(null),
    );
    return () => {
      current = false;
    };
  }, [keys]);

  const run = async (
    action: () => Promise<{ saved: boolean; ending: string | null }>,
  ) => {
    setBusy(true);
    setNote(null);
    try {
      const kept = await action();
      setEnding(kept.saved ? kept.ending : null);
      setDraft("");
      setNote(
        kept.saved
          ? {
              text: t("It works. Your paper searches now use this key."),
              problem: false,
            }
          : null,
      );
    } catch (error) {
      setNote({ text: messageOf(error), problem: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-5" aria-labelledby="paper-search-settings-title">
      <h2
        id="paper-search-settings-title"
        className="mb-2 text-xs font-medium text-muted-foreground"
      >
        {t("Paper search")}
      </h2>
      <p className="text-xs text-muted-foreground">
        {t(
          "Find papers by their title or authors in Add to binder. Plus finds their titles and authors; Pro also shows each paper's year, journal and free PDF. On any plan you can use your own OpenAlex key instead: it's free at openalex.org and shows every detail.",
        )}
      </p>
      {ending === undefined ? null : ending !== null ? (
        <div className="mt-2 flex items-center gap-2 text-[13px]">
          <span className="flex-1">
            {t("Your OpenAlex key ends in {ending}.", { ending })}
          </span>
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void run(() => keys.forget())}
          >
            {t("Remove")}
          </button>
        </div>
      ) : (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) void run(() => keys.save(draft.trim()));
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={t("Your OpenAlex key")}
            placeholder={t("Your OpenAlex key")}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 font-mono text-[13px] outline-none focus:border-ring"
          />
          <button type="submit" className={BUTTON} disabled={busy || !draft.trim()}>
            {busy ? t("Checking…") : t("Save")}
          </button>
        </form>
      )}
      {note && (
        <p
          className={cn(
            "mt-1 text-xs",
            note.problem ? "text-destructive" : "text-success",
          )}
          role={note.problem ? "alert" : "status"}
        >
          {note.text}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "The key is kept with your Scholarkit account, encrypted. Searches go through the Scholarkit server, which passes the key on to OpenAlex.",
        )}
      </p>
    </section>
  );
}
