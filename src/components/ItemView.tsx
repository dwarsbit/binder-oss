import {
  ArrowLeft,
  BookOpen,
  Globe,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Editor } from "@scholarkit/editor/components/Editor";
import { Backlinks } from "@scholarkit/editor/components/PageLinks";
import { cn } from "@scholarkit/editor/lib/cn";
import type { Backlink } from "@scholarkit/editor/lib/links";
import { baseName } from "@scholarkit/editor/lib/paths";
import {
  isOwnWriting,
  KINDS,
  kindLabel,
  STATUSES,
  type Item,
  type ItemChanges,
  type Kind,
  type Status,
} from "@/lib/binder";
import { READING } from "@/lib/items";
import { KindIcon } from "./KindIcon";
import { t } from "@scholarkit/i18n";

/** A text property, changed when the field is left or Enter is pressed. */
function TextField({
  label,
  value,
  placeholder,
  onCommit,
  action,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  action?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  // A value changed elsewhere replaces the draft.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft.trim() !== value.trim()) onCommit(draft.trim());
  };
  return (
    <>
      <dt>{label}</dt>
      <dd>
        <input
          className="prop-input min-w-0 flex-1"
          aria-label={label}
          value={draft}
          placeholder={placeholder ?? t("Empty")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(value);
              requestAnimationFrame(() => (event.target as HTMLInputElement).blur());
            }
          }}
        />
        {action}
      </dd>
    </>
  );
}

const READ_BUTTON =
  "inline-flex h-6 flex-none items-center gap-1.5 rounded-[5px] border border-primary-edge bg-primary-fill px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-fill/85";

const LINK_BUTTON =
  "inline-flex h-6 flex-none items-center gap-1 rounded-[5px] px-1.5 text-xs font-medium text-tint-foreground hover:bg-tint-soft";

/** Tags as chips, with a field that adds one. */
function Tags({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().replace(/,+$/, "").trim();
    setDraft("");
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
  };
  return (
    <>
      <dt>{t("Tags")}</dt>
      <dd>
        {tags.map((tag) => (
          <span key={tag} className="chip pr-0.5">
            {tag}
            <button
              type="button"
              aria-label={t("Remove the tag {tag}", { tag })}
              title={t("Remove tag")}
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          className="prop-input w-28 flex-1"
          aria-label={t("Add a tag")}
          value={draft}
          placeholder={tags.length ? t("Add tag") : t("Add a tag")}
          onChange={(event) => {
            const value = event.target.value;
            if (value.endsWith(",")) {
              setDraft(value);
              requestAnimationFrame(add);
            } else setDraft(value);
          }}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
            if (event.key === "Backspace" && draft === "" && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
        />
      </dd>
    </>
  );
}

/** Which details a kind shows when they are empty; filled ones always show. */
const FIELDS: Record<Kind, Array<keyof typeof LABELS>> = {
  article: ["authors", "year", "publishedIn", "volume", "issue", "pages", "doi", "url"],
  book: ["authors", "year", "publisher", "isbn", "doi"],
  chapter: ["authors", "year", "publishedIn", "pages", "publisher", "doi"],
  webpage: ["authors", "year", "publishedIn", "url"],
  lecture: ["authors", "year", "url"],
  slides: ["authors", "year", "url"],
  note: [],
  thought: [],
  file: ["authors", "year", "url"],
};

const LABELS = {
  authors: t("Authors"),
  year: t("Year"),
  publishedIn: t("Published in"),
  volume: t("Volume"),
  issue: t("Issue"),
  pages: t("Pages"),
  publisher: t("Publisher"),
  doi: "DOI",
  isbn: "ISBN",
  arxiv: "arXiv",
  pmid: "PubMed",
  url: t("Address"),
} as const;

const KEY_OF = {
  authors: "authors",
  year: "year",
  publishedIn: "published-in",
  volume: "volume",
  issue: "issue",
  pages: "pages",
  publisher: "publisher",
  doi: "doi",
  isbn: "isbn",
  arxiv: "arxiv",
  pmid: "pmid",
  url: "url",
} as const;

const PLACEHOLDERS: Partial<Record<keyof typeof LABELS, string>> = {
  authors: t("Family, Given; Family, Given"),
  pages: "45-67",
};

/** The title: it wraps, and Enter goes on to the notes. */
function TitleField({
  value,
  fieldRef,
  onChange,
  onDone,
  onEnter,
}: {
  value: string;
  fieldRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (title: string) => void;
  onDone: () => void;
  onEnter: () => void;
}) {
  // Where the browser can't size a field to its text, it is sized here.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field || CSS.supports("field-sizing", "content")) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [value, fieldRef]);
  return (
    <textarea
      ref={fieldRef}
      rows={1}
      className="page-title"
      value={value}
      placeholder={t("Untitled")}
      aria-label={t("Title")}
      onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, " "))}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

/** Where an item goes from the inbox. */
function AcceptBar({
  item,
  onStatus,
}: {
  item: Item;
  onStatus: (status: Status | null) => void;
}) {
  return (
    <div className="accept-bar" role="group" aria-label={t("Move out of the inbox")}>
      <span className="mr-1 text-muted-foreground">
        {item.kind === "thought" ? t("Keep this thought:") : t("Move to:")}
      </span>
      {item.kind === "thought" ? (
        <button
          type="button"
          onClick={() => onStatus(null)}
          className="h-7 rounded-md border border-primary-edge bg-primary-fill px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary-fill/85"
        >
          {t("Keep in notes")}
        </button>
      ) : (
        READING.map((status, index) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatus(status)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium",
              index === 0
                ? "border-primary-edge bg-primary-fill text-primary-foreground hover:bg-primary-fill/85"
                : "bg-background hover:bg-muted",
            )}
          >
            {index > 0 && <span className={cn("status-dot", `status-${status}`)} />}
            {STATUSES.find((entry) => entry.id === status)?.label}
          </button>
        ))
      )}
    </div>
  );
}

export interface ItemViewProps {
  item: Item;
  /** The title as its file has it: empty while it is being typed anew. */
  title: string;
  /** Counts the times the item was opened or changed elsewhere: a fresh editor each time. */
  opened: number;
  /** Where the item is in the list it was opened from. */
  position: { index: number; total: number } | null;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Shown in a narrow window, where the list and the item take turns. */
  onBack: () => void;
  backLabel: string;
  onTitle: (title: string) => void;
  /** The title field was left: the item's file gets its name. */
  onTitleDone: () => void;
  onChange: (changes: ItemChanges) => void;
  onMarkdown: (markdown: string) => void;
  onOpenFile: (path: string) => void;
  onOpenLink: (url: string) => void;
  /** Opens the item's file in the reader; absent when it can't be read there. */
  onRead?: () => void;
  /** Keeps the text of the item's web page; absent where the app can't fetch it. */
  onKeep?: () => void;
  keeping?: boolean;
  onDelete: () => void;
  /** What the assistant wrote about the item, between its details and the notes. */
  assistant?: React.ReactNode;
  backlinks: Backlink[];
  focusRef: React.RefObject<(() => void) | null>;
  focusEndRef: React.RefObject<(() => void) | null>;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
}

/** An item: its details over the notes on it, in blocks. */
export function ItemView({ focusRef, focusEndRef, titleRef, ...props }: ItemViewProps) {
  const { item } = props;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [props.opened]);

  const shown = (Object.keys(LABELS) as Array<keyof typeof LABELS>).filter((field) => {
    const value = item[field];
    return (
      (Array.isArray(value) ? value.length > 0 : value !== "") ||
      FIELDS[item.kind].includes(field)
    );
  });
  /** Where a detail's Open button goes: the DOI, the arXiv or PubMed page, the address. */
  const linkOf = (field: keyof typeof LABELS): string => {
    switch (field) {
      case "doi":
        return item.doi
          ? `https://doi.org/${item.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`
          : "";
      case "arxiv":
        return item.arxiv ? `https://arxiv.org/abs/${encodeURI(item.arxiv)}` : "";
      case "pmid":
        return /^\d+$/.test(item.pmid)
          ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`
          : "";
      case "url":
        return /^https?:\/\//i.test(item.url) ? item.url : "";
      default:
        return "";
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 flex-none items-center gap-1.5 border-b px-3 text-xs text-muted-foreground">
        <button
          type="button"
          className="back-button size-6 flex-none items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
          aria-label={props.backLabel}
          title={props.backLabel}
          onClick={props.onBack}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
        </button>
        <KindIcon kind={item.kind} className="size-3.5 flex-none" />
        <span className="font-medium text-foreground">{kindLabel(item.kind)}</span>
        {item.zotero && (
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => props.onOpenLink(item.zotero)}
          >
            {t("Open in Zotero")}
          </button>
        )}
        <span className="flex-1" />
        {props.onRead && (
          <button type="button" className={READ_BUTTON} onClick={props.onRead}>
            <BookOpen className="size-3.5" aria-hidden />
            {t("Read")}
          </button>
        )}
        {props.position && props.position.total > 1 && (
          <>
            <span className="tabular-nums">
              {t("{number} of {total}", {
                number: props.position.index + 1,
                total: props.position.total,
              })}
            </span>
            <button
              type="button"
              aria-label={t("Previous item")}
              title={t("Previous item")}
              disabled={!props.onPrevious}
              onClick={props.onPrevious}
              className="grid size-6 place-items-center rounded-md enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-40"
            >
              <ChevronUp className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={t("Next item")}
              title={t("Next item")}
              disabled={!props.onNext}
              onClick={props.onNext}
              className="grid size-6 place-items-center rounded-md enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-40"
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
          </>
        )}
        <button
          type="button"
          aria-label={t("Delete item")}
          title={t("Delete item")}
          onClick={props.onDelete}
          className="grid size-6 place-items-center rounded-md hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" id="page-scroll">
        <article className="page" key={props.opened}>
          <TitleField
            value={props.title}
            fieldRef={titleRef}
            onChange={props.onTitle}
            onDone={props.onTitleDone}
            onEnter={() => focusRef.current?.()}
          />
          <dl className="item-props">
            <dt>{t("Kind")}</dt>
            <dd>
              <select
                className="prop-input w-auto pr-1"
                aria-label={t("Kind")}
                value={item.kind}
                onChange={(event) => {
                  const kind = event.target.value as Kind;
                  // A note has no status; a source taken for a note keeps none either.
                  const status = isOwnWriting(kind)
                    ? kind === "thought"
                      ? item.status
                      : null
                    : (item.status ?? "inbox");
                  props.onChange({ kind, status });
                }}
              >
                {KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </dd>
            {item.kind !== "note" && (
              <>
                <dt>{t("Status")}</dt>
                <dd className="flex-nowrap">
                  <span
                    className={cn("status-dot", item.status && `status-${item.status}`)}
                  />
                  <select
                    className="prop-input w-auto pr-1"
                    aria-label={t("Status")}
                    value={item.status ?? ""}
                    onChange={(event) =>
                      props.onChange({ status: event.target.value || null })
                    }
                  >
                    {item.kind === "thought" && (
                      <option value="">{t("In notes")}</option>
                    )}
                    {STATUSES.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </dd>
              </>
            )}
            {shown.map((field) => (
              <TextField
                key={field}
                label={LABELS[field]}
                value={field === "authors" ? item.authors.join("; ") : item[field]}
                placeholder={PLACEHOLDERS[field]}
                onCommit={(value) =>
                  props.onChange({
                    [KEY_OF[field]]:
                      field === "authors"
                        ? value
                            .split(";")
                            .map((name) => name.trim())
                            .filter(Boolean)
                        : value,
                  })
                }
                action={
                  linkOf(field) ? (
                    <button
                      type="button"
                      className={LINK_BUTTON}
                      onClick={() => props.onOpenLink(linkOf(field))}
                    >
                      <ExternalLink className="size-3" aria-hidden />
                      {t("Open")}
                    </button>
                  ) : undefined
                }
              />
            ))}
            {!item.file && props.onKeep && (
              <>
                <dt>{t("File")}</dt>
                <dd>
                  <button
                    type="button"
                    className={LINK_BUTTON}
                    disabled={props.keeping}
                    onClick={props.onKeep}
                  >
                    <Globe className="size-3" aria-hidden />
                    {props.keeping ? t("Keeping the page…") : t("Keep the page text")}
                  </button>
                </dd>
              </>
            )}
            {item.file && (
              <>
                <dt>{t("File")}</dt>
                <dd>
                  <span className="min-w-0 truncate" title={item.file}>
                    {baseName(item.file)}
                  </span>
                  <button
                    type="button"
                    className={LINK_BUTTON}
                    onClick={() => item.file && props.onOpenFile(item.file)}
                  >
                    <ExternalLink className="size-3" aria-hidden />
                    {t("Open")}
                  </button>
                </dd>
              </>
            )}
            <Tags tags={item.tags} onChange={(tags) => props.onChange({ tags })} />
            {item.added && (
              <>
                <dt>{t("Added")}</dt>
                <dd className="text-muted-foreground tabular-nums">{item.added}</dd>
              </>
            )}
          </dl>
          {props.assistant}
          <Editor
            markdown={item.markdown}
            onChange={(change) => props.onMarkdown(change.markdown)}
            focusRef={focusRef}
            focusEndRef={focusEndRef}
          />
          <Backlinks links={props.backlinks} />
        </article>
      </div>
      {item.status === "inbox" && (
        <AcceptBar item={item} onStatus={(status) => props.onChange({ status })} />
      )}
    </div>
  );
}
