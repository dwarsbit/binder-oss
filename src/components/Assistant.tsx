/**
 * The assistant in Binder, from the shared parts of @scholarkit/assistant:
 * the Ask button next to the avatar, the floating bar over the binder (the
 * default), the panel docked on the right (the alternative), and the Ask
 * menu on a selection in the reader. Binder adds its cards: checked
 * quotes, properties, notes, highlights, papers, free PDFs and background
 * reading, and the line that says what the background reader is doing.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BookOpenText,
  FileSearch,
  Lightbulb,
  NotebookPen,
  Search,
  Sparkles,
} from "lucide-react";
import {
  AnswerActions,
  AskBar,
  AskButton,
  AssistantFloating,
  AssistantPanel,
  AssistantText,
  Composer,
  ConversationView,
  EmptyState,
  PaperCard,
  SelectionMenu,
  SourceQuote,
  Suggestions,
  UsageLine,
  useAskShortcut,
  type AssistantEntry,
  type CardState,
  type Entry,
  type MenuGroup,
  type UsageSource,
} from "@scholarkit/assistant";
import type { Usage } from "@scholarkit/editor/lib/account";
import { formatNumber, t, tn } from "@scholarkit/i18n";
import { authorsShort, kindLabel, type Item, type Kind } from "@/lib/binder";
import { categoryLabel } from "@/lib/highlights";
import {
  useChat,
  useChatEntries,
  type BinderChat,
  type Selection,
} from "@/lib/assistant/chat";
import {
  OUR_MODEL,
  providerById,
  sourceOf,
  type AssistantSettings,
} from "@/lib/assistant/providers";
import type { BinderCard, PropertyChange } from "@/lib/assistant/tools";
import type { RunsState } from "@/lib/assistant/runs";

/** Where the answers come from, as the bar and the usage line say it. */
export interface SourceInfo {
  label: string;
  usage: UsageSource | null;
  /** Why no question can be asked now; null when one can. */
  blocked: string | null;
}

export function sourceInfo(
  settings: AssistantSettings,
  account: boolean,
  usage: Usage | null,
  ownReady: boolean,
): SourceInfo {
  if (sourceOf(settings, account) === "own") {
    const provider = providerById(settings.provider);
    if (!ownReady || !provider)
      return {
        label: t("Set up a model"),
        usage: null,
        blocked: account
          ? t("Set up a model in Settings, or choose Scholarkit AI there, to ask.")
          : t("Set up a model in Settings to ask."),
      };
    return {
      label: settings.model || provider.name,
      usage: provider.needsKey
        ? { kind: "own-key", provider: provider.name }
        : { kind: "local", model: settings.model || provider.name },
      blocked: null,
    };
  }
  const plan = usage?.plan;
  if (plan === "free")
    return {
      label: OUR_MODEL,
      usage: null,
      blocked: t(
        "The assistant on our model comes with Plus. On Free, set up your own key or a model on your computer in Settings.",
      ),
    };
  return {
    label: OUR_MODEL,
    usage:
      (plan === "plus" || plan === "pro") && usage?.assistant
        ? { kind: "ours", plan, usedPercent: usage.assistant.usedPercent }
        : null,
    blocked: null,
  };
}

/** What the cards and the panels do in the binder. */
export interface AssistantProps {
  chat: BinderChat;
  /** The item open now, which the next question is about. */
  openItem: Item | null;
  source: SourceInfo;
  /** Opens a checked quote in the reader, at its place. */
  onOpenQuote: (card: Extract<BinderCard, { type: "quote" }>) => void;
  /** Opens an item. */
  onOpenItem: (path: string) => void;
  onSettings: () => void;
  /** Switches between the floating bar and the docked panel. */
  onLayout: (layout: "floating" | "docked") => void;
  /** The background reader, shown while it works. */
  reading: { state: RunsState; titleOf: (path: string) => string; onStop: () => void };
}

const FIELD_LABELS: Record<PropertyChange["field"], () => string> = {
  kind: () => t("Kind"),
  title: () => t("Title"),
  authors: () => t("Authors"),
  year: () => t("Year"),
  publishedIn: () => t("Published in"),
  publisher: () => t("Publisher"),
  doi: () => "DOI",
  tags: () => t("Add tags"),
};

const shown = (change: PropertyChange, value: string) =>
  change.field === "kind" && value ? kindLabel(value as Kind) : value;

/** The foot of a card: its buttons while open, then what happened. */
function Foot({
  state,
  note,
  done,
  actions,
}: {
  state: CardState;
  note?: string | null;
  done: string;
  actions: Parameters<typeof AnswerActions>[0]["actions"];
}) {
  return (
    <div className="assistant-card-foot">
      {state === "open" ? (
        <>
          <span className="assistant-muted assistant-grow">{note}</span>
          <AnswerActions actions={actions} />
        </>
      ) : (
        <span className="assistant-muted assistant-grow">
          {state === "applied" ? done : t("Dismissed.")}
        </span>
      )}
    </div>
  );
}

function CardView({
  card,
  props,
}: {
  card: BinderCard;
  props: AssistantProps;
}): ReactNode {
  const { chat } = props;
  const state = card.state ?? "open";
  const dismiss = { label: t("Dismiss"), onClick: () => chat.dismiss(card) };
  switch (card.type) {
    case "quote":
      return (
        <SourceQuote
          n={card.n}
          source={card.source}
          found
          quote={card.quote}
          onOpen={() => props.onOpenQuote(card)}
        />
      );
    case "properties":
      return (
        <div className="assistant-card" data-state={state}>
          <div className="assistant-card-head">
            <span className="assistant-card-title">
              {t("Properties of “{title}”", { title: card.title })}
            </span>
          </div>
          <dl className="assistant-props">
            {card.changes.map((change) => (
              <div key={change.field}>
                <dt>{FIELD_LABELS[change.field]()}</dt>
                <dd>
                  {shown(change, change.after)}
                  {change.before && (
                    <span className="assistant-muted">
                      {t("Now: {now}", { now: shown(change, change.before) })}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <Foot
            state={state}
            note={card.note}
            done={t("Accepted.")}
            actions={[
              dismiss,
              {
                label: t("Accept"),
                icon: "check",
                primary: true,
                onClick: () => void chat.accept(card),
              },
            ]}
          />
        </div>
      );
    case "note":
      return (
        <div className="assistant-card" data-state={state}>
          <div className="assistant-card-head">
            <NotebookPen className="size-3.5" aria-hidden />
            <span className="assistant-card-title">{card.title}</span>
          </div>
          <div className="assistant-card-body">
            <AssistantText text={card.markdown} />
          </div>
          <Foot
            state={state}
            note={card.note}
            done={t("Saved as a note.")}
            actions={[
              dismiss,
              {
                label: t("Save as note"),
                icon: "notebook-pen",
                primary: true,
                onClick: () => void chat.accept(card),
              },
            ]}
          />
        </div>
      );
    case "highlights":
      return (
        <div className="assistant-card" data-state={state}>
          <div className="assistant-card-head">
            <span className="assistant-card-title">
              {tn(
                card.highlights.length,
                "{count} highlight in “{title}”",
                "{count} highlights in “{title}”",
                { title: card.title },
              )}
            </span>
          </div>
          <ul className="assistant-highlights">
            {card.highlights.map((h, i) => (
              <li key={i}>
                <span className="assistant-muted">
                  {categoryLabel(h.category)}
                  {h.page !== null && ` · ${t("p. {n}", { n: formatNumber(h.page) })}`}
                </span>
                <span>“{h.text}”</span>
              </li>
            ))}
          </ul>
          <Foot
            state={state}
            note={card.note}
            done={t("Kept.")}
            actions={[
              dismiss,
              {
                label: t("Keep all"),
                icon: "check",
                primary: true,
                onClick: () => void chat.accept(card),
              },
            ]}
          />
        </div>
      );
    case "papers":
      return (
        <div className="assistant-papers">
          {card.papers.map((paper, i) => {
            const added = card.added?.includes(i);
            return (
              <div key={paper.openAlexId || paper.doi || i}>
                <PaperCard
                  title={paper.title}
                  meta={[authorsShort(paper.author), paper.container, paper.year]
                    .filter(Boolean)
                    .join(" · ")}
                  freePdf={paper.freePdf}
                  best={i === 0}
                  actions={
                    added
                      ? []
                      : [
                          {
                            label: t("Add to binder"),
                            icon: "bookmark-plus",
                            primary: i === 0,
                            onClick: () => void chat.accept(card, i),
                          },
                        ]
                  }
                />
                {(added || card.notes?.[i]) && (
                  <p className="assistant-note" data-tone={added ? undefined : "error"}>
                    {added ? t("Added to your inbox.") : card.notes?.[i]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      );
    case "pdf":
      return (
        <div className="assistant-card" data-state={state}>
          <div className="assistant-card-head">
            <span className="assistant-card-title">
              {t("A free PDF of “{title}”", { title: card.title })}
            </span>
          </div>
          <Foot
            state={state}
            note={card.note}
            done={t("Saved to the item.")}
            actions={[
              dismiss,
              {
                label: t("Save to the item"),
                icon: "check",
                primary: true,
                onClick: () => void chat.accept(card),
              },
            ]}
          />
        </div>
      );
    case "reading":
      return (
        <div className="assistant-card" data-state={state}>
          <div className="assistant-card-head">
            <span className="assistant-card-title">
              {tn(
                card.paths.length,
                "Read {count} source in the background",
                "Read {count} sources in the background",
              )}
            </span>
          </div>
          <ul className="assistant-highlights">
            {card.titles.slice(0, 6).map((title, i) => (
              <li key={card.paths[i]}>
                <button
                  type="button"
                  className="assistant-link"
                  onClick={() => props.onOpenItem(card.paths[i])}
                >
                  {title}
                </button>
              </li>
            ))}
            {card.titles.length > 6 && (
              <li className="assistant-muted">
                {tn(card.titles.length - 6, "and {count} more", "and {count} more")}
              </li>
            )}
          </ul>
          <Foot
            state={state}
            note={card.note}
            done={t("Reading. What it finds shows with each item.")}
            actions={[
              dismiss,
              {
                label: t("Start reading"),
                icon: "check",
                primary: true,
                onClick: () => void chat.accept(card),
              },
            ]}
          />
        </div>
      );
  }
}

/** The checked quote a citation names, in the conversation so far. */
function quoteOf(entries: Entry<BinderCard>[], n: number) {
  for (const entry of entries) {
    if (entry.kind !== "assistant") continue;
    for (const card of entry.attachments)
      if (card.type === "quote" && card.n === n) return card;
  }
  return null;
}

function useRender(props: AssistantProps, entries: Entry<BinderCard>[]) {
  const renderAttachment = (card: BinderCard, _entry: AssistantEntry<BinderCard>) => (
    <CardView card={card} props={props} />
  );
  const onCite = (n: number) => {
    const card = quoteOf(entries, n);
    if (card) props.onOpenQuote(card);
  };
  return { renderAttachment, onCite };
}

/** Puts the cursor in the bar or the composer when asked to. */
function useFocusRequests(chat: BinderChat) {
  const input = useRef<HTMLTextAreaElement>(null);
  const { focusRequest } = useChat(chat);
  useEffect(() => {
    if (focusRequest > 0) input.current?.focus();
  }, [focusRequest]);
  return input;
}

/** The draft and sending it, shared by the bar and the composer. */
function useDraft(chat: BinderChat) {
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (!text || chat.working) return;
    setDraft("");
    void chat.ask(text);
  };
  return { draft, setDraft, send };
}

/** What the background reader does now, with a way to stop it. */
function ReadingLine({ reading }: { reading: AssistantProps["reading"] }) {
  const { running, queued } = reading.state;
  if (!running) return null;
  return (
    <div className="assistant-reading" role="status">
      <Sparkles className="size-3.5 flex-none animate-pulse text-tint" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={running.step}>
        {t("Reading {title}", { title: reading.titleOf(running.path) })}
        {queued.length > 0 && (
          <span className="assistant-muted">
            {" "}
            {tn(queued.length, "· {count} more", "· {count} more")}
          </span>
        )}
      </span>
      <button type="button" className="assistant-link" onClick={reading.onStop}>
        {t("Stop")}
      </button>
    </div>
  );
}

/** Reads the selection in the reader, for Cmd+J: its text, page and place on screen. */
function readerSelection(): {
  text: string;
  page: number | null;
  left: number;
  top: number;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const start =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  if (!start?.closest(".reader")) return null;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (text.length < 2) return null;
  const shell = start.closest<HTMLElement>("[data-page]");
  const rect = range.getBoundingClientRect();
  return {
    text,
    page: shell ? Number(shell.dataset.page) : null,
    left: rect.left,
    top: rect.bottom + 6,
  };
}

/** The Ask button next to the avatar; Cmd/Ctrl+J does the same, or opens the Ask menu on a selection in the reader. */
export function AskAssistantButton({
  chat,
  docked,
  readingPath,
}: {
  chat: BinderChat;
  docked: boolean;
  /** The item open in the reader, for a selection in it. */
  readingPath: string | null;
}) {
  const state = useChat(chat);
  const latest = useRef({ docked, readingPath });
  useEffect(() => {
    latest.current = { docked, readingPath };
  });
  useAskShortcut(() => {
    const { docked: isDocked, readingPath: path } = latest.current;
    const selected = path ? readerSelection() : null;
    if (path && selected && !chat.state.menu) {
      chat.openMenu(
        { path, text: selected.text, page: selected.page },
        { left: selected.left, top: selected.top },
      );
      return;
    }
    chat.toggle(isDocked);
  }, true);
  return (
    <AskButton
      on={docked ? state.dockShown : state.barOpen}
      onClick={() => chat.toggle(docked)}
    />
  );
}

/** The floating layout: the bar at the bottom of the binder, the latest answer above it. */
export function AssistantFloatingLayer(props: AssistantProps) {
  const { chat, source } = props;
  const state = useChat(chat);
  const { entries, working } = useChatEntries(chat);
  const { draft, setDraft, send } = useDraft(chat);
  const input = useFocusRequests(chat);
  const { renderAttachment, onCite } = useRender(props, entries);
  if (!state.barOpen) return null;
  return (
    <div
      onKeyDown={(e) => {
        // Escape closes the answer first, then the bar.
        if (e.key === "Escape" && !chat.state.sheetOpen) {
          e.preventDefault();
          chat.hide();
        }
      }}
    >
      <AssistantFloating
        entries={entries}
        open={state.sheetOpen}
        onClose={() => chat.setSheetOpen(false)}
        onDock={() => {
          chat.hide();
          props.onLayout("docked");
          chat.show(true);
        }}
        renderAttachment={renderAttachment}
        onCite={onCite}
        bar={
          <>
            <ReadingLine reading={props.reading} />
            <AskBar
              value={draft}
              onChange={setDraft}
              onSend={send}
              onStop={() => chat.stop()}
              working={working}
              placeholder={source.blocked ?? t("Ask your sources")}
              chips={chat.chips(props.openItem)}
              onRemoveChip={(id) => chat.removeChip(id)}
              model={source.label}
              onPickModel={props.onSettings}
              disabled={source.blocked !== null}
              inputRef={input}
            />
          </>
        }
      />
    </div>
  );
}

const SUGGESTIONS = () => [
  t("What do my sources say about my research question?"),
  t("Which sources in my inbox matter most?"),
  t("Find papers I'm missing"),
];

/** The docked layout: the whole conversation in a panel on the right. */
export function AssistantDock(props: AssistantProps) {
  const { chat, source } = props;
  const state = useChat(chat);
  const { entries, working } = useChatEntries(chat);
  const { draft, setDraft, send } = useDraft(chat);
  const input = useFocusRequests(chat);
  const { renderAttachment, onCite } = useRender(props, entries);
  useEffect(() => {
    if (chat.state.usage === null) void chat.refreshUsage();
  }, [chat]);
  if (!state.dockShown) return null;
  return (
    <aside className="assistant-dock">
      <AssistantPanel
        onClose={() => chat.hide()}
        onNew={() => chat.clear()}
        onFloat={() => {
          chat.hide();
          props.onLayout("floating");
          chat.show(false);
        }}
        composer={
          <>
            <ReadingLine reading={props.reading} />
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              onStop={() => chat.stop()}
              working={working}
              placeholder={t("Ask your sources")}
              chips={chat.chips(props.openItem)}
              onRemoveChip={(id) => chat.removeChip(id)}
              model={source.label}
              onPickModel={props.onSettings}
              disabled={source.blocked !== null}
              inputRef={input}
            />
          </>
        }
        footer={source.usage && <UsageLine source={source.usage} />}
      >
        <ConversationView
          entries={entries}
          renderAttachment={renderAttachment}
          onCite={onCite}
          empty={
            <EmptyState
              title={t("Ask your sources")}
              text={
                source.blocked ??
                t(
                  "The assistant answers from your sources, with quotes it checked against them. It finds papers and proposes notes, properties and highlights for you to keep.",
                )
              }
            >
              {source.blocked === null && (
                <Suggestions
                  items={SUGGESTIONS().map((label) => ({
                    label,
                    onPick: () => void chat.ask(label),
                  }))}
                />
              )}
            </EmptyState>
          }
        />
      </AssistantPanel>
    </aside>
  );
}

const ICON = "size-3.5";

function menuGroups(papers: boolean): MenuGroup[] {
  return [
    {
      label: t("This passage"),
      items: [
        {
          id: t("Explain this passage in plain words."),
          label: t("Explain it"),
          icon: <Lightbulb className={ICON} />,
        },
        {
          id: t("What do my other sources say about this?"),
          label: t("Compare with my other sources"),
          icon: <BookOpenText className={ICON} />,
        },
        {
          id: t("Turn this passage into a note, with the quote checked."),
          label: t("Make a note of it"),
          icon: <NotebookPen className={ICON} />,
        },
        ...(papers
          ? [
              {
                id: t("Find papers about what this passage says."),
                label: t("Find papers on this"),
                icon: <Search className={ICON} />,
              },
            ]
          : []),
        {
          id: t("Find where this source says more about this."),
          label: t("Find more in this source"),
          icon: <FileSearch className={ICON} />,
        },
      ],
    },
  ];
}

/** The Ask menu under a selection in the reader. */
export function AssistantMenuLayer({
  chat,
  docked,
  papers,
}: {
  chat: BinderChat;
  docked: boolean;
  papers: boolean;
}) {
  const { menu } = useChat(chat);
  if (menu === null) return null;
  const ask = (text: string) => {
    chat.closeMenu(true);
    chat.show(docked);
    void chat.ask(text);
  };
  // Kept on screen: the menu is 384px wide and about 300px tall.
  const left = Math.max(8, Math.min(menu.left, window.innerWidth - 392));
  const top = Math.min(menu.top, window.innerHeight - 320);
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={() => chat.closeMenu()} />
      <div className="fixed z-50" style={{ left, top }}>
        <SelectionMenu
          groups={menuGroups(papers)}
          placeholder={t("Ask about the selection…")}
          onPick={ask}
          onAsk={ask}
          onClose={() => chat.closeMenu()}
        />
      </div>
    </>,
    document.body,
  );
}

/** A selection in the reader as the Ask menu takes it, from the highlight menu. */
export type AskSelection = Omit<Selection, "path"> & { left: number; top: number };
