import {
  EXPORT_FORMATS,
  writeReferences,
  type ExportFormat,
  type ExportReference,
} from "@scholarkit/editor/references/export";
import {
  emptyReference,
  suggestKey,
  type ReferenceType,
} from "@scholarkit/editor/references/reference";
import { isOwnWriting, type Item, type Kind } from "./binder";
import { t } from "@scholarkit/i18n";

/**
 * Exporting a binder's sources as references for other tools. What a
 * file looks like is up to the editor package's writers; this says
 * which items go in and how an item reads as a reference.
 */

const TYPES: Record<Kind, ReferenceType> = {
  article: "article",
  book: "book",
  chapter: "chapter",
  webpage: "webpage",
  lecture: "other",
  slides: "other",
  file: "other",
  note: "other",
  thought: "other",
};

/** Whether an item goes in an export: every source, not your own notes and thoughts. */
export const isExportable = (item: Item) => !isOwnWriting(item.kind);

/** The items as references, each with its own citation key, like `okafor2021`. */
export function exportReferences(items: Item[]): ExportReference[] {
  const taken = new Set<string>();
  return items.filter(isExportable).map((item) => {
    const ref: ExportReference = {
      ...emptyReference(""),
      type: TYPES[item.kind],
      author: item.authors,
      title: item.title,
      year: item.year,
      container: item.publishedIn,
      publisher: item.publisher,
      volume: item.volume,
      issue: item.issue,
      pages: item.pages,
      doi: item.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""),
      url: item.url,
      isbn: item.isbn,
      keywords: item.tags,
    };
    ref.key = suggestKey(ref, taken);
    taken.add(ref.key);
    return ref;
  });
}

/** The items' references as a file. */
export const exportText = (format: ExportFormat, items: Item[]) =>
  writeReferences(format, exportReferences(items));

/** A file name for an export: the binder's or the list's name with the format's extension. */
export function exportFileName(name: string, format: ExportFormat): string {
  const base =
    name
      .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 80) || t("References");
  const extension =
    EXPORT_FORMATS.find((entry) => entry.id === format)?.extension ?? "txt";
  return `${base}.${extension}`;
}
