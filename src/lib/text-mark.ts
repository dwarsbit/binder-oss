/**
 * How Binder marks a PDF whose text it recognized, apart from `text-layer.ts`
 * and the PDF library it loads, which a reader needs only to write the text.
 */

/** In the document's information: the languages and the date of the recognized text. */
export const INFO_KEY = "BinderText";

/** Whether a PDF has text from Binder: the Info entry pdf.js reports among its custom keys. */
export function binderTextOf(
  info: unknown,
): { languages: string; date: string } | null {
  // pdf.js reports the custom keys as a Map; older versions as an object.
  const custom = (
    info as { Custom?: Map<string, unknown> | Record<string, unknown> } | null
  )?.Custom;
  const value = custom instanceof Map ? custom.get(INFO_KEY) : custom?.[INFO_KEY];
  if (typeof value !== "string") return null;
  const [languages = "", date = ""] = value.split(" ");
  return { languages, date };
}
