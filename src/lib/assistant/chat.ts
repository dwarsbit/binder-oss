import { useSyncExternalStore } from "react";
import {
  AssistantError,
  Conversation,
  type ContextChipData,
  type Entry,
  type SendTurn,
} from "@scholarkit/assistant";
import type { Usage } from "@scholarkit/editor/lib/account";
import type { FoundPaper } from "@scholarkit/editor/references/lookup";
import { t } from "@scholarkit/i18n";
import type { Item } from "../binder";
import type { Highlight } from "../highlights";
import {
  binderKit,
  describeStart,
  newNumbering,
  systemPrompt,
  userMessage,
  type BinderCard,
  type BinderHost,
  type PropertyChange,
} from "./tools";

/**
 * The assistant's conversation in Binder, run by the shared
 * `Conversation` of @scholarkit/assistant with Binder's tools, and what
 * the panel around it shows: the floating bar or the docked panel, the
 * open item and a selection the next question is about, the month used
 * on our model. One per open binder; it starts over with the next.
 */

/** What the cards do once accepted, and where the answers come from. */
export interface ChatHost extends BinderHost {
  /** The model that answers now; null when none can. */
  send(): SendTurn | null;
  /** Whether answers come from our model, which counts the month's use. */
  ours(): boolean;
  /** The item open now, for the question to be about. */
  openItem(): Item | null;
  /** Whether the binder was shared with you to read: its cards then change nothing. */
  readOnly?(): boolean;
  /** Rejects with what went wrong. */
  applyProperties(path: string, changes: PropertyChange[]): void;
  /** Saves a new note; resolves with its path. */
  saveNote(title: string, markdown: string): Promise<string | null>;
  keepHighlights(path: string, highlights: Array<Omit<Highlight, "id">>): void;
  addPaper(paper: FoundPaper): Promise<void>;
  savePdf(path: string, doi: string): Promise<void>;
  readInBackground(paths: string[]): void;
  usage?(): Promise<Usage | null>;
}

/** A selection in the reader, for the next question. */
export interface Selection {
  path: string;
  text: string;
  page: number | null;
}

/** Where the Ask menu opens, in window coordinates. */
export interface MenuAnchor {
  left: number;
  top: number;
}

export interface ChatState {
  /** The floating bar shows (in the floating layout). */
  barOpen: boolean;
  /** The latest answer shows above the bar. */
  sheetOpen: boolean;
  /** The docked panel shows (in the docked layout). */
  dockShown: boolean;
  /** Whether the next question is about the open item; the chip's ×. */
  aboutItem: boolean;
  selection: Selection | null;
  /** The Ask menu on a selection in the reader, while open. */
  menu: MenuAnchor | null;
  usage: Usage | null;
  /** Bumped to put the cursor in the bar or the composer. */
  focusRequest: number;
}

const INITIAL: ChatState = {
  barOpen: false,
  sheetOpen: false,
  dockShown: false,
  aboutItem: true,
  selection: null,
  menu: null,
  usage: null,
  focusRequest: 0,
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class BinderChat {
  state: ChatState = INITIAL;
  readonly conversation: Conversation<BinderCard>;
  private numbers = newNumbering();
  /** Outcomes of cards since the last question, told to the model with the next one. */
  private notes: string[] = [];
  private listeners = new Set<() => void>();

  /**
   * `features` says which of the tools that need an account to offer: they
   * are there when the chat starts with one.
   */
  constructor(
    private host: () => ChatHost,
    private features: { papers: boolean; lookUp: boolean; freePdfs: boolean },
  ) {
    this.conversation = new Conversation<BinderCard>(this.options());
  }

  private options() {
    const send: SendTurn = (messages, tools, onText, signal) => {
      const model = this.host().send();
      if (!model)
        return Promise.reject(
          new AssistantError("provider", t("Set up the assistant in Settings to ask.")),
        );
      return model(messages, tools, onText, signal);
    };
    return {
      send,
      kit: binderKit(this.proxy(), this.numbers),
      system: () => systemPrompt(this.host().question(), this.features.papers),
      describeStart,
    };
  }

  /** The host as the tools reach it: always the latest one. */
  private proxy(): BinderHost {
    const latest = () => this.host();
    const { papers, lookUp, freePdfs } = this.features;
    return {
      items: () => latest().items(),
      allowed: (item) => latest().allowed(item),
      question: () => latest().question(),
      highlights: (path) => latest().highlights(path),
      pagesOf: (item) => latest().pagesOf(item),
      canRead: (item) => latest().canRead(item),
      searchPapers: papers ? (q) => latest().searchPapers!(q) : undefined,
      lookUp: lookUp ? (kind, id) => latest().lookUp!(kind, id) : undefined,
      freePdfs: freePdfs ? (doi) => latest().freePdfs!(doi) : undefined,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    const off = this.conversation.subscribe(listener);
    return () => {
      this.listeners.delete(listener);
      off();
    };
  };

  getState = () => this.state;

  private set(change: Partial<ChatState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  get working(): boolean {
    return this.conversation.working;
  }

  /** The chips above the question: the open item, a selection. */
  chips(item: Item | null): ContextChipData[] {
    const chips: ContextChipData[] = [];
    const { selection, aboutItem } = this.state;
    if (selection)
      chips.push({
        id: "selection",
        label:
          selection.page === null
            ? t("Selection")
            : t("Selection, page {page}", { page: selection.page }),
        icon: "text-select",
      });
    else if (item && aboutItem)
      chips.push({ id: "item", label: item.title, icon: "file-text" });
    return chips;
  }

  removeChip(id: string) {
    if (id === "selection") this.set({ selection: null });
    else this.set({ aboutItem: false });
  }

  async ask(text: string): Promise<void> {
    const question = text.trim();
    if (!question || this.conversation.working) return;
    const host = this.host();
    const item = this.state.aboutItem ? host.openItem() : null;
    const selection = this.state.selection;
    const selected =
      selection &&
      (host.items().find((entry) => entry.path === selection.path) ?? null);
    const chips = this.chips(host.openItem());
    const forModel =
      (this.notes.length ? `${this.notes.join(" ")}\n\n` : "") +
      userMessage(question, {
        item: selected ?? item,
        selection: selection && { text: selection.text, page: selection.page },
      });
    this.notes = [];
    this.set({ selection: null, menu: null, sheetOpen: true });
    const outcome = await this.conversation.ask({ text: question, forModel, chips });
    if (outcome !== "failed" && host.ours()) void this.refreshUsage();
  }

  stop() {
    this.conversation.stop();
  }

  /** Starts over: a new conversation, the cursor in the bar. */
  clear() {
    this.conversation.reset();
    this.numbers.quotes = [];
    this.numbers.cards = 0;
    this.notes = [];
    this.set({ sheetOpen: false, selection: null, aboutItem: true });
    this.focus();
  }

  focus() {
    this.set({ focusRequest: this.state.focusRequest + 1 });
  }

  /** Shows the assistant in the layout chosen, with the cursor in it. */
  show(docked: boolean) {
    if (docked) this.set({ dockShown: true });
    else this.set({ barOpen: true, sheetOpen: this.conversation.entries.length > 0 });
    this.focus();
    if (this.state.usage === null) void this.refreshUsage();
  }

  hide() {
    this.set({ barOpen: false, sheetOpen: false, dockShown: false });
  }

  toggle(docked: boolean) {
    const shown = docked ? this.state.dockShown : this.state.barOpen;
    if (shown) this.hide();
    else this.show(docked);
  }

  setSheetOpen(open: boolean) {
    this.set({ sheetOpen: open });
  }

  /** The Ask menu on a selection in the reader. */
  openMenu(selection: Selection, anchor: MenuAnchor) {
    this.set({ selection, menu: anchor });
  }

  closeMenu(keepSelection = false) {
    this.set({ menu: null, ...(keepSelection ? {} : { selection: null }) });
  }

  async refreshUsage() {
    const usage = this.host().usage;
    if (!usage) return;
    try {
      this.set({ usage: await usage() });
    } catch {
      // Signed out or offline: the usage line stays away.
      this.set({ usage: null });
    }
  }

  /** Accepts a card: does what it proposes, and tells the model with the next question. */
  async accept(card: BinderCard, which?: number) {
    if ((card.state ?? "open") !== "open" && card.type !== "papers") return;
    const host = this.host();
    const fail = (error: unknown) =>
      this.conversation.update(card, { ...card, note: messageOf(error) });
    try {
      if (host.readOnly?.()) {
        throw new Error(t("You can read this binder, but not change it."));
      }
      switch (card.type) {
        case "properties":
          host.applyProperties(card.path, card.changes);
          this.notes.push(`The user accepted card ${card.id}.`);
          break;
        case "note": {
          const path = await host.saveNote(card.title, card.markdown);
          this.notes.push(
            `The user saved card ${card.id} as a note${path ? ` at ${path}` : ""}.`,
          );
          break;
        }
        case "highlights":
          host.keepHighlights(card.path, card.highlights);
          this.notes.push(`The user kept the highlights of card ${card.id}.`);
          break;
        case "pdf":
          await host.savePdf(card.path, card.doi);
          this.notes.push(`The user saved the free PDF of card ${card.id}.`);
          break;
        case "reading":
          host.readInBackground(card.paths);
          this.notes.push(
            `The user started the background reading of card ${card.id}.`,
          );
          break;
        case "papers": {
          if (which === undefined || card.added?.includes(which)) return;
          const paper = card.papers[which];
          try {
            await host.addPaper(paper);
          } catch (error) {
            this.conversation.update(card, {
              ...card,
              notes: { ...card.notes, [which]: messageOf(error) },
            });
            return;
          }
          this.conversation.update(card, {
            ...card,
            added: [...(card.added ?? []), which],
          });
          this.notes.push(`The user added "${paper.title}" from card ${card.id}.`);
          return;
        }
        case "quote":
          return;
      }
    } catch (error) {
      fail(error);
      return;
    }
    this.conversation.update(card, { ...card, state: "applied", note: null });
    this.focus();
  }

  dismiss(card: BinderCard) {
    if ((card.state ?? "open") !== "open" || card.type === "quote") return;
    this.conversation.update(card, { ...card, state: "discarded", note: null });
    this.notes.push(`The user dismissed card ${card.id}.`);
    this.focus();
  }
}

/** The chat's state, for components. */
export function useChat(chat: BinderChat): ChatState {
  return useSyncExternalStore(chat.subscribe, chat.getState);
}

/** The conversation's entries and whether it is working, for components. */
export function useChatEntries(chat: BinderChat): {
  entries: Entry<BinderCard>[];
  working: boolean;
} {
  const entries = useSyncExternalStore(chat.subscribe, () => chat.conversation.entries);
  return { entries, working: chat.conversation.working };
}
