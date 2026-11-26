import { Check, ChevronDown, MoreHorizontal, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@scholarkit/editor/lib/cn";
import { ContextMenu, type MenuAt } from "@scholarkit/editor/components/ContextMenu";
import { messageOf } from "@scholarkit/editor/components/Dialog";
import { KINDS, STATUSES } from "@/lib/binder";
import type { Filters, SavedList } from "@/lib/lists";
import { t, tn } from "@scholarkit/i18n";

/** A chip in the filter bar: one filter, or the year's two. */
type Group =
  "status" | "kind" | "tags" | "year" | "added" | "file" | "author" | "publishedIn";

const GROUPS: Group[] = [
  "status",
  "kind",
  "tags",
  "year",
  "added",
  "file",
  "author",
  "publishedIn",
];

const groupLabel = (group: Group) =>
  ({
    status: t("Status"),
    kind: t("Kind"),
    tags: t("Tag"),
    year: t("Year"),
    added: t("Added"),
    file: t("File"),
    author: t("Author"),
    publishedIn: t("Published in"),
  })[group];

/** The filters a chip sets, so that taking it away takes them out. */
const KEYS_OF: Record<Group, Array<keyof Filters>> = {
  status: ["status"],
  kind: ["kind"],
  tags: ["tags"],
  year: ["yearFrom", "yearTo"],
  added: ["addedWithin"],
  file: ["hasFile"],
  author: ["author"],
  publishedIn: ["publishedIn"],
};

const isSet = (filters: Filters, group: Group) =>
  KEYS_OF[group].some((key) => {
    const value = filters[key];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });

const without = (filters: Filters, group: Group): Filters => {
  const next = { ...filters };
  for (const key of KEYS_OF[group]) delete next[key];
  return next;
};

const ADDED_DAYS = [7, 30, 90, 365];

const lastDays = (days: number) => tn(days, "Last {count} day", "Last {count} days");

const names = (list: Array<{ id: string; label: string }>, ids: string[] = []) =>
  ids.map((id) => list.find((entry) => entry.id === id)?.label ?? id).join(", ");

/** What a chip says after its name. */
function valueOf(group: Group, filters: Filters): string {
  switch (group) {
    case "status":
      return names(STATUSES, filters.status);
    case "kind":
      return names(KINDS, filters.kind);
    case "tags":
      return (filters.tags ?? []).join(", ");
    case "year": {
      const { yearFrom: from, yearTo: to } = filters;
      if (from !== undefined && to !== undefined)
        return from === to ? String(from) : `${from}–${to}`;
      if (from !== undefined) return t("{year} or later", { year: from });
      if (to !== undefined) return t("{year} or earlier", { year: to });
      return "";
    }
    case "added":
      return filters.addedWithin === undefined ? "" : lastDays(filters.addedWithin);
    case "file":
      return filters.hasFile === undefined
        ? ""
        : filters.hasFile
          ? t("Has a file")
          : t("Has no file");
    case "author":
      return filters.author ?? "";
    case "publishedIn":
      return filters.publishedIn ?? "";
  }
}

/** A box under a chip that closes on Escape and on a click elsewhere. */
function Popover({
  onClose,
  align = "left",
  className,
  children,
}: {
  onClose: () => void;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Element;
      // The chip that opened it toggles it itself.
      if (!ref.current?.parentElement?.contains(target)) onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={cn(
        "popover filter-popover",
        align === "right" ? "right-0" : "left-0",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {children}
    </div>
  );
}

function Option({
  on,
  round = false,
  onClick,
  children,
}: {
  on: boolean;
  /** One of several, as opposed to any number of them. */
  round?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={round ? "menuitemradio" : "menuitemcheckbox"}
      aria-checked={on}
      className="filter-option"
      onClick={onClick}
    >
      <span className={cn("check-box", round && "rounded-full", on && "check-box-on")}>
        {on && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
      </span>
      {children}
    </button>
  );
}

/** A text filter: written down on Enter or when the box closes. */
function TextEditor({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  placeholder: string;
  label: string;
  onChange: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  const done = () => {
    if (draft.trim() !== value) onChange(draft.trim() || undefined);
  };
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      // Whatever is typed counts once you leave the field.
      onBlur={done}
      onKeyDown={(event) => {
        if (event.key === "Enter") done();
      }}
      className="filter-input w-52"
    />
  );
}

function YearEditor({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const year = (text: string) => {
    const value = Number.parseInt(text, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const field = (key: "yearFrom" | "yearTo", label: string) => (
    <label className="flex flex-col gap-1 text-2xs text-muted-foreground">
      {label}
      <input
        autoFocus={key === "yearFrom"}
        inputMode="numeric"
        defaultValue={filters[key] ?? ""}
        placeholder={key === "yearFrom" ? "2015" : String(new Date().getFullYear())}
        onBlur={(event) => onChange({ ...filters, [key]: year(event.target.value) })}
        onKeyDown={(event) => {
          if (event.key === "Enter")
            onChange({ ...filters, [key]: year(event.currentTarget.value) });
        }}
        className="filter-input w-20 text-xs text-foreground"
      />
    </label>
  );
  return (
    <div className="flex items-end gap-2 p-1">
      {field("yearFrom", t("From"))}
      {field("yearTo", t("To"))}
    </div>
  );
}

/** What a chip opens: the choices or the field for its filter. */
function Editor({
  group,
  filters,
  tags,
  onChange,
}: {
  group: Group;
  filters: Filters;
  tags: string[];
  onChange: (filters: Filters) => void;
}) {
  const toggle = <T extends string>(list: T[] | undefined, value: T): T[] =>
    list?.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...(list ?? []), value];
  switch (group) {
    case "status":
      return STATUSES.map((status) => (
        <Option
          key={status.id}
          on={filters.status?.includes(status.id) ?? false}
          onClick={() =>
            onChange({ ...filters, status: toggle(filters.status, status.id) })
          }
        >
          <span className={cn("status-dot", `status-${status.id}`)} />
          {status.label}
        </Option>
      ));
    case "kind":
      return KINDS.map((kind) => (
        <Option
          key={kind.id}
          on={filters.kind?.includes(kind.id) ?? false}
          onClick={() => onChange({ ...filters, kind: toggle(filters.kind, kind.id) })}
        >
          {kind.label}
        </Option>
      ));
    case "tags":
      return tags.length ? (
        <div className="max-h-72 overflow-y-auto">
          {tags.map((tag) => (
            <Option
              key={tag}
              on={filters.tags?.includes(tag) ?? false}
              onClick={() => onChange({ ...filters, tags: toggle(filters.tags, tag) })}
            >
              {tag}
            </Option>
          ))}
        </div>
      ) : (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          {t("No tags in this binder yet.")}
        </p>
      );
    case "year":
      return <YearEditor filters={filters} onChange={onChange} />;
    case "added":
      return ADDED_DAYS.map((days) => (
        <Option
          key={days}
          round
          on={filters.addedWithin === days}
          onClick={() => onChange({ ...filters, addedWithin: days })}
        >
          {lastDays(days)}
        </Option>
      ));
    case "file":
      return [true, false].map((has) => (
        <Option
          key={String(has)}
          round
          on={filters.hasFile === has}
          onClick={() => onChange({ ...filters, hasFile: has })}
        >
          {has ? t("Has a file") : t("Has no file")}
        </Option>
      ));
    case "author":
      return (
        <TextEditor
          label={t("Author")}
          value={filters.author ?? ""}
          placeholder={t("Part of a name")}
          onChange={(author) => onChange({ ...filters, author })}
        />
      );
    case "publishedIn":
      return (
        <TextEditor
          label={t("Published in")}
          value={filters.publishedIn ?? ""}
          placeholder={t("Part of a journal’s name")}
          onChange={(publishedIn) => onChange({ ...filters, publishedIn })}
        />
      );
  }
}

/** The filters of a saved list, over its items: a chip for each, and a button for more. */
export function FilterBar({
  list,
  tags,
  onChange,
  onRename,
  onDuplicate,
  onDelete,
}: {
  list: SavedList;
  /** Every tag in the binder. */
  tags: string[];
  onChange: (filters: Filters) => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { filters } = list;
  // The chip whose box is open: shown even while it has no value yet.
  const [open, setOpen] = useState<Group | "add" | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const shown = GROUPS.filter((group) => isSet(filters, group) || open === group);
  const close = () => setOpen(null);

  return (
    <div
      className="flex min-h-10 flex-none flex-wrap items-center gap-1.5 border-b px-3 py-2"
      role="group"
      aria-label={t("Filters")}
    >
      {shown.map((group) => (
        <span key={group} className="relative">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-md border bg-background pr-0.5 pl-2 text-xs",
              open === group && "border-ring",
            )}
          >
            <button
              type="button"
              aria-expanded={open === group}
              className="inline-flex max-w-64 items-center gap-1"
              onClick={() => setOpen(open === group ? null : group)}
            >
              <span className="flex-none text-muted-foreground">
                {groupLabel(group)}
              </span>
              <span className="truncate font-medium">{valueOf(group, filters)}</span>
              <ChevronDown
                className="size-3 flex-none text-muted-foreground"
                aria-hidden
              />
            </button>
            <button
              type="button"
              aria-label={t("Remove the {filter} filter", {
                filter: groupLabel(group),
              })}
              title={t("Remove")}
              onClick={() => {
                close();
                onChange(without(filters, group));
              }}
              className="grid size-5 place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
          {open === group && (
            <Popover onClose={close}>
              <Editor group={group} filters={filters} tags={tags} onChange={onChange} />
            </Popover>
          )}
        </span>
      ))}

      <span className="relative">
        <button
          type="button"
          aria-expanded={open === "add"}
          onClick={() => setOpen(open === "add" ? null : "add")}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
            open === "add" && "bg-accent text-foreground",
          )}
        >
          <Plus className="size-3.5" aria-hidden />
          {shown.length ? t("Filter") : t("Add a filter")}
        </button>
        {open === "add" && (
          <Popover onClose={close}>
            {GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="menuitem"
                disabled={shown.includes(group)}
                className="filter-option disabled:text-muted-foreground"
                onClick={() => setOpen(group)}
              >
                {groupLabel(group)}
              </button>
            ))}
          </Popover>
        )}
      </span>

      <span className="flex-1" />
      <button
        type="button"
        aria-label={t("List options")}
        title={t("List options")}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu({
            x: box.right - 168,
            y: box.bottom + 4,
            entries: [
              { label: t("Rename…"), onSelect: onRename },
              { label: t("Duplicate"), onSelect: onDuplicate },
              "separator",
              { label: t("Delete list…"), onSelect: onDelete, destructive: true },
            ],
          });
        }}
        className={cn(
          "grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
          menu && "bg-accent text-foreground",
        )}
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </button>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

/** The list's name over its items, which a click renames. Rejects with why not. */
export function ListName({
  name,
  renaming,
  onRenaming,
  onRename,
}: {
  name: string;
  renaming: boolean;
  onRenaming: (renaming: boolean) => void;
  onRename: (name: string) => void;
}) {
  if (!renaming) {
    return (
      <button
        type="button"
        title={t("Rename list")}
        onClick={() => onRenaming(true)}
        className="-mx-1 h-7 min-w-0 truncate rounded-md px-1 text-sm font-semibold hover:bg-accent"
      >
        <h1 className="truncate">{name}</h1>
      </button>
    );
  }
  return <NameField name={name} onRenaming={onRenaming} onRename={onRename} />;
}

/** The field a list's name is typed in, with what is wrong with it. */
function NameField({
  name,
  onRenaming,
  onRename,
}: {
  name: string;
  onRenaming: (renaming: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const commit = () => {
    const wanted = draft.trim();
    if (!wanted || wanted === name) return onRenaming(false);
    try {
      onRename(wanted);
      onRenaming(false);
    } catch (error) {
      setProblem(messageOf(error));
    }
  };
  return (
    <span className="relative min-w-0">
      <input
        autoFocus
        value={draft}
        aria-label={t("List name")}
        aria-invalid={problem !== null}
        maxLength={80}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(null);
        }}
        onBlur={() => (problem ? onRenaming(false) : commit())}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") onRenaming(false);
        }}
        className="-mx-1 h-7 w-64 max-w-full rounded-md border border-ring bg-background px-1 text-sm font-semibold outline-none"
      />
      {problem && (
        <span
          role="alert"
          className="popover absolute top-full left-0 z-20 mt-1 w-56 px-2 py-1.5 text-xs font-normal text-destructive"
        >
          {problem}
        </span>
      )}
    </span>
  );
}
