import { BookOpen, Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@scholarkit/editor/lib/cn";
import { Select } from "@scholarkit/editor/components/Select";
import { safeHref } from "@scholarkit/editor/lib/safe-href";
import { KINDS, kindLabel, type Item, type Kind } from "@/lib/binder";
import {
  PARTS,
  hasProposal,
  proposedHighlights,
  type AssistantNote,
  type PartId,
  type Proposal,
} from "@/lib/assistant/file";
import { t, tn } from "@scholarkit/i18n";
import { KindIcon } from "./KindIcon";

const LINK_BUTTON =
  "inline-flex h-6 flex-none items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium text-tint-foreground hover:bg-tint-soft disabled:opacity-50";
const SMALL_BUTTON =
  "inline-flex h-6 flex-none items-center gap-1 rounded-[5px] border bg-background px-2 text-xs font-medium hover:bg-muted";
const PRIMARY_SMALL =
  "inline-flex h-6 flex-none items-center gap-1 rounded-[5px] border border-primary-edge bg-primary-fill px-2 text-xs font-medium text-primary-foreground hover:bg-primary-fill/85";

/** Text with the Markdown the assistant writes: links, bold and escapes. */
function Inline({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const pattern = /\\([\\[\]*_`<>])|\[([^\]]+)\]\(([^()\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let key = 0;
  for (let found = pattern.exec(text); found; found = pattern.exec(text)) {
    if (found.index > last) nodes.push(text.slice(last, found.index));
    if (found[1]) nodes.push(found[1]);
    else if (found[2] && safeHref(found[3]))
      nodes.push(
        <a key={key++} href={safeHref(found[3])} className="passage-link">
          {found[2]}
        </a>,
      );
    // A link the assistant shouldn't make (a page it read may ask for
    // one): its text only.
    else if (found[2]) nodes.push(found[2]);
    else nodes.push(<strong key={key++}>{found[4]}</strong>);
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

/** A part as the assistant wrote it: paragraphs and lists. */
function PartText({ markdown }: { markdown: string }) {
  const blocks: Array<{ list: boolean; lines: string[] }> = [];
  for (const line of markdown.split("\n")) {
    if (!line.trim()) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (item) {
      if (last?.list) last.lines.push(item[1]);
      else blocks.push({ list: true, lines: [item[1]] });
    } else if (last && !last.list && last.lines.length) {
      last.lines[last.lines.length - 1] += ` ${line.trim()}`;
    } else {
      blocks.push({ list: false, lines: [line.trim()] });
    }
  }
  return (
    <>
      {blocks
        .filter((block) => block.lines.length)
        .map((block, i) =>
          block.list ? (
            <ul key={i}>
              {block.lines.map((line, j) => (
                <li key={j}>
                  <Inline text={line} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i}>
              <Inline text={block.lines.join(" ")} />
            </p>
          ),
        )}
    </>
  );
}

/** The assistant's proposal for the item, to accept as it is or changed. */
function ProposalCard({
  item,
  proposal,
  onAccept,
  onDismiss,
}: {
  item: Item;
  proposal: Proposal;
  onAccept: (proposal: Proposal) => void;
  onDismiss: () => void;
}) {
  const [kind, setKind] = useState<Kind | undefined>(proposal.kind);
  const [title, setTitle] = useState(proposal.title ?? "");
  const [authors, setAuthors] = useState((proposal.authors ?? []).join("; "));
  const [year, setYear] = useState(proposal.year ?? "");
  const [tags, setTags] = useState((proposal.tags ?? []).join(", "));
  const accept = () =>
    onAccept({
      kind,
      title: title.trim() || undefined,
      authors: proposal.authors
        ? authors
            .split(";")
            .map((a) => a.trim())
            .filter(Boolean)
        : undefined,
      year: year.trim() || undefined,
      tags: proposal.tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    });
  const row = (label: string, now: string, field: React.ReactNode) => (
    <>
      <dt>{label}</dt>
      <dd>
        {field}
        {now && <span className="proposal-was">{t("Now: {now}", { now })}</span>}
      </dd>
    </>
  );
  return (
    <section className="assistant-part" aria-label={t("Proposal")}>
      <h3>{t("Proposal")}</h3>
      <dl className="proposal-fields">
        {proposal.kind &&
          row(
            t("Kind"),
            kindLabel(item.kind),
            <Select
              className="prop-input"
              aria-label={t("Proposed kind")}
              value={kind ?? ""}
              options={KINDS.filter((k) => k.id !== "note" && k.id !== "thought").map(
                (k) => ({
                  value: k.id,
                  label: k.label,
                  icon: <KindIcon kind={k.id} />,
                }),
              )}
              onChange={(next) => setKind(next as Kind)}
            />,
          )}
        {proposal.title !== undefined &&
          row(
            t("Title"),
            item.title,
            <input
              className="prop-input"
              aria-label={t("Proposed title")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />,
          )}
        {proposal.authors &&
          row(
            t("Authors"),
            item.authors.join("; "),
            <input
              className="prop-input"
              aria-label={t("Proposed authors")}
              value={authors}
              onChange={(event) => setAuthors(event.target.value)}
            />,
          )}
        {proposal.year !== undefined &&
          row(
            t("Year"),
            item.year,
            <input
              className="prop-input"
              aria-label={t("Proposed year")}
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />,
          )}
        {proposal.tags &&
          row(
            t("Add tags"),
            "",
            <input
              className="prop-input"
              aria-label={t("Proposed tags")}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />,
          )}
      </dl>
      <div className="assistant-actions">
        <button type="button" className={PRIMARY_SMALL} onClick={accept}>
          <Check className="size-3" aria-hidden />
          {t("Accept")}
        </button>
        <button type="button" className={SMALL_BUTTON} onClick={onDismiss}>
          {t("Dismiss")}
        </button>
      </div>
    </section>
  );
}

export type AssistantAvailability = "ready" | "item-off" | "unavailable";

export interface AssistantPanelProps {
  item: Item;
  note: AssistantNote | null;
  availability: AssistantAvailability;
  /** Where the source's text goes; null when the model runs on this computer. */
  receiver: string | null;
  /** What the assistant is doing with this item; null when it isn't. */
  running: string | null;
  queued: boolean;
  error: string | null;
  message: string | null;
  onAsk: () => void;
  onStop: () => void;
  onDismissMessage: () => void;
  onAccept: (proposal: Proposal) => void;
  onDismissProposal: () => void;
  onTakeOver: (part: PartId) => void;
  onDismissPart: (part: PartId) => void;
  onRead?: () => void;
  onItemAssistant: (on: boolean) => void;
}

/**
 * What the assistant wrote about an item, marked as the assistant's and
 * kept apart from your notes until you take it over.
 */
export function AssistantPanel(props: AssistantPanelProps) {
  const { note, availability } = props;
  const busy = props.running !== null || props.queued;

  if (availability === "item-off" && !note) {
    return (
      <div className="assistant-row">
        <Sparkles className="size-3.5 flex-none text-muted-foreground" aria-hidden />
        <span className="flex-1 text-muted-foreground">
          {t("The assistant stays away from this item.")}
        </span>
        <button
          type="button"
          className={LINK_BUTTON}
          onClick={() => props.onItemAssistant(true)}
        >
          {t("Let it read this item")}
        </button>
      </div>
    );
  }

  const status = busy ? (
    <div className="assistant-row" role="status">
      <Loader2 className="size-3.5 flex-none animate-spin text-tint" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        {props.running
          ? t("The assistant is reading this. {step}…", { step: props.running })
          : t("Waiting for the assistant…")}
      </span>
      <button type="button" className={LINK_BUTTON} onClick={props.onStop}>
        {t("Stop")}
      </button>
    </div>
  ) : props.error ? (
    <div className="assistant-row text-destructive" role="alert">
      <Sparkles className="size-3.5 flex-none" aria-hidden />
      <span className="min-w-0 flex-1">
        {t("The assistant couldn't read this. {error}", { error: props.error })}
      </span>
      {availability === "ready" && (
        <button type="button" className={LINK_BUTTON} onClick={props.onAsk}>
          {t("Try again")}
        </button>
      )}
    </div>
  ) : null;

  if (!note) {
    if (status) return status;
    if (availability !== "ready") return null;
    return (
      <div className="assistant-row">
        <button type="button" className={LINK_BUTTON} onClick={props.onAsk}>
          <Sparkles className="size-3" aria-hidden />
          {t("Ask the assistant to read it")}
        </button>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {props.receiver
            ? t("Its text goes to {receiver}.", { receiver: props.receiver })
            : t("On this computer.")}
        </span>
        <button
          type="button"
          className={cn(LINK_BUTTON, "text-muted-foreground")}
          onClick={() => props.onItemAssistant(false)}
        >
          {t("Keep it away")}
        </button>
      </div>
    );
  }

  const proposed = proposedHighlights(note);
  // The file names a model on this computer "this computer", in English.
  const where =
    note.provider === "this computer"
      ? t("on this computer")
      : note.provider
        ? t("at {provider}", { provider: note.provider })
        : "";
  return (
    <section className="assistant" aria-label={t("From the assistant")}>
      <header className="assistant-head">
        <Sparkles className="size-3.5 flex-none text-tint" aria-hidden />
        <span className="font-medium">{t("From the assistant")}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {[note.model, where, note.written].filter(Boolean).join(" · ")}
        </span>
        {availability === "ready" && !busy && (
          <button
            type="button"
            className={LINK_BUTTON}
            title={t("Read the source again and write this anew")}
            onClick={props.onAsk}
          >
            <RefreshCw className="size-3" aria-hidden />
            {t("Read again")}
          </button>
        )}
      </header>
      <p className="assistant-hint">
        {t(
          "Written by a model: check it against the source. What you take over moves to your notes and is yours.",
        )}
      </p>
      {status}
      {props.message && !busy && (
        <div className="assistant-row text-muted-foreground" role="status">
          <span className="flex-1">{props.message}</span>
          <button
            type="button"
            className="grid size-6 place-items-center rounded-md hover:bg-muted"
            aria-label={t("Dismiss")}
            title={t("Dismiss")}
            onClick={props.onDismissMessage}
          >
            <X className="size-3" aria-hidden />
          </button>
        </div>
      )}
      {hasProposal(note.proposal) && (
        <ProposalCard
          key={JSON.stringify(note.proposal)}
          item={props.item}
          proposal={note.proposal}
          onAccept={props.onAccept}
          onDismiss={props.onDismissProposal}
        />
      )}
      {PARTS.filter((part) => part.id !== "highlights").map((known) => {
        const part = note.parts.find((p) => p.id === known.id);
        if (!part) return null;
        return (
          <section
            key={known.id}
            className="assistant-part"
            aria-label={t(known.heading)}
          >
            <h3>
              {t(known.heading)}
              <span className="flex-1" />
              <button
                type="button"
                className={LINK_BUTTON}
                title={t("Move this to your notes")}
                onClick={() => props.onTakeOver(known.id)}
              >
                {t("Take over")}
              </button>
              <button
                type="button"
                className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("Dismiss “{part}”", { part: t(known.heading) })}
                title={t("Dismiss")}
                onClick={() => props.onDismissPart(known.id)}
              >
                <X className="size-3" aria-hidden />
              </button>
            </h3>
            <div className="assistant-text">
              <PartText markdown={part.markdown} />
            </div>
          </section>
        );
      })}
      {proposed.length > 0 && (
        <div className="assistant-row">
          <span className="flex-1">
            {tn(
              proposed.length,
              "{count} proposed highlight.",
              "{count} proposed highlights.",
            )}{" "}
            <span className="text-muted-foreground">
              {t("Keep the ones you want in the reader.")}
            </span>
          </span>
          {props.onRead && (
            <button type="button" className={LINK_BUTTON} onClick={props.onRead}>
              <BookOpen className="size-3" aria-hidden />
              {t("Read")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
