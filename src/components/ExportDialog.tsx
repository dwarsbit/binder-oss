import { useEffect, useMemo, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "@scholarkit/editor/components/Dialog";
import { cn } from "@scholarkit/editor/lib/cn";
import { isDesktop } from "@scholarkit/editor/lib/platform";
import {
  EXPORT_FORMATS,
  type ExportFormat,
} from "@scholarkit/editor/references/export";
import type { Item } from "@/lib/binder";
import { exportFileName, exportText, isExportable } from "@/lib/export";
import { loadExportFormat, saveExportFormat } from "@/lib/prefs";
import { saveExport } from "@/lib/save-export";
import { t, tn } from "@scholarkit/i18n";

const HINTS: Record<ExportFormat, string> = {
  bibtex: t("For LaTeX, and for reference managers such as Zotero and Mendeley."),
  ris: t("For reference managers: Zotero, Mendeley, EndNote and most others."),
  "csl-json": t("For Pandoc, and other tools that format citations in a CSL style."),
};

const initialFormat = (): ExportFormat => {
  const saved = loadExportFormat();
  return EXPORT_FORMATS.some((entry) => entry.id === saved)
    ? (saved as ExportFormat)
    : "bibtex";
};

const sources = (count: number) => tn(count, "{count} source", "{count} sources");

/**
 * Exports the sources of a list, or of the whole binder, as BibTeX,
 * RIS or CSL JSON: saved as a file or copied. Notes and thoughts are
 * your own writing and stay out.
 */
export function ExportDialog({
  binderName,
  listName,
  listItems,
  allItems,
  onClose,
}: {
  binderName: string;
  /** The list the dialog was opened from, such as "Reading list" or a tag. */
  listName: string;
  listItems: Item[];
  allItems: Item[];
  onClose: () => void;
}) {
  const listCount = useMemo(() => listItems.filter(isExportable).length, [listItems]);
  const allCount = useMemo(() => allItems.filter(isExportable).length, [allItems]);
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [whole, setWhole] = useState(listCount === 0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const chosen = whole ? allItems : listItems;
  const count = whole ? allCount : listCount;
  const text = useMemo(() => exportText(format, chosen), [format, chosen]);
  const name = exportFileName(
    whole ? binderName : `${binderName} (${listName})`,
    format,
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const pick = (next: ExportFormat) => {
    setFormat(next);
    saveExportFormat(next);
    setProblem(null);
  };

  const save = async () => {
    if (!count || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (await saveExport(name, format, text)) onClose();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    setProblem(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setProblem(
        t("Binder couldn't copy the references. Save them as a file instead."),
      );
    }
  };

  return (
    <Dialog title={t("Export references")} onClose={onClose}>
      <form
        className="dialog-wide"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {t(
            "Save your sources as a file that other tools read. Notes and thoughts stay out.",
          )}
        </p>

        <fieldset className="mt-4">
          <legend className="text-xs text-muted-foreground">{t("Format")}</legend>
          <div
            role="radiogroup"
            aria-label={t("Format")}
            className="mt-1.5 inline-flex gap-0.5 rounded-[7px] bg-muted p-0.5"
          >
            {EXPORT_FORMATS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={format === entry.id}
                onClick={() => pick(entry.id)}
                className={cn(
                  "inline-flex h-6 items-center rounded-[5px] px-2.5 text-xs font-medium",
                  format === entry.id
                    ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{HINTS[format]}</p>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-xs text-muted-foreground">
            {t("Which sources")}
          </legend>
          <div className="mt-1">
            {[
              { whole: false, label: listName, count: listCount },
              { whole: true, label: t("Whole binder"), count: allCount },
            ].map((option) => (
              <label
                key={option.label + String(option.whole)}
                className={cn(
                  "flex h-7 items-center gap-2 text-[13px]",
                  option.count === 0 && "text-muted-foreground",
                )}
              >
                <input
                  type="radio"
                  name="export-scope"
                  className="size-3.5 accent-[var(--tint)]"
                  checked={whole === option.whole}
                  disabled={option.count === 0}
                  onChange={() => {
                    setWhole(option.whole);
                    setProblem(null);
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {sources(option.count)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <pre
          aria-label={t("Preview")}
          tabIndex={0}
          className="mt-3 max-h-44 overflow-auto rounded-md bg-muted px-3 py-2.5 font-mono text-[11.5px] leading-normal whitespace-pre-wrap"
        >
          {count ? text : t("This binder has no sources to export yet.")}
        </pre>

        <p
          className={cn(
            "mt-1 min-h-4 text-xs",
            problem ? "text-destructive" : "text-muted-foreground",
          )}
          role={problem ? "alert" : "status"}
        >
          {problem ?? (copied ? "Copied." : count ? name : "")}
        </p>

        <div className="mt-2 flex items-center justify-end gap-2">
          <button type="button" className={QUIET_BUTTON} onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!count}
            onClick={() => void copy()}
          >
            {copied ? t("Copied") : t("Copy")}
          </button>
          <button type="submit" className={PRIMARY_BUTTON} disabled={!count || busy}>
            {busy ? t("Saving…") : isDesktop ? t("Save…") : t("Download")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
