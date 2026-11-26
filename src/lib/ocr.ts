import { currentLanguage, msg, t } from "@scholarkit/i18n";
import type { PdfDocument } from "./pdf";
import { openPdf, pageText } from "./pdf";
import type { PlacedWord } from "./text-layer";
import { binderTextOf } from "./text-mark";

/**
 * Recognizing the text of a scanned PDF, on this device: each page
 * without text is drawn as a picture, Tesseract reads it in a worker, and
 * the words go into the PDF as an invisible layer (`text-layer.ts`).
 */

/** The languages Binder recognizes text in, as Tesseract names them. */
export const TEXT_LANGUAGES = [
  { code: "eng", name: msg("English") },
  { code: "nld", name: msg("Dutch") },
  { code: "deu", name: msg("German") },
  { code: "fra", name: msg("French") },
  { code: "spa", name: msg("Spanish") },
  { code: "ita", name: msg("Italian") },
  { code: "por", name: msg("Portuguese") },
  { code: "lat", name: msg("Latin") },
  { code: "swe", name: msg("Swedish") },
  { code: "dan", name: msg("Danish") },
  { code: "pol", name: msg("Polish") },
  { code: "rus", name: msg("Russian") },
] as const;

const FROM_INTERFACE: Record<string, string> = {
  en: "eng",
  nl: "nld",
  de: "deu",
  fr: "fra",
  es: "spa",
};

/** The languages to start with: the interface's, and English. */
export function defaultTextLanguages(): string {
  const own = FROM_INTERFACE[currentLanguage().slice(0, 2)] ?? "eng";
  return own === "eng" ? "eng" : `${own}+eng`;
}

/** “Dutch and English”, for languages such as "nld+eng". */
export function textLanguagesLabel(languages: string): string {
  const names = languages
    .split("+")
    .map((code) => TEXT_LANGUAGES.find((l) => l.code === code)?.name)
    .filter((name): name is (typeof TEXT_LANGUAGES)[number]["name"] => Boolean(name))
    .map((name) => t(name));
  return names.length === 2
    ? t("{first} and {second}", { first: names[0], second: names[1] })
    : names.join(", ");
}

/** Where the app fetches the language files: the Scholarkit server, once per language. */
const LANGUAGE_FILES =
  (import.meta.env.VITE_TEXT_LANGUAGES_URL as string | undefined) ??
  (import.meta.env.MODE === "web"
    ? new URL(`${import.meta.env.BASE_URL}tessdata`, window.location.href).href
    : "https://app.scholarkit.app/binder/tessdata");

/** A page with fewer characters than this has no text of its own. */
const MIN_CHARACTERS = 20;

const hasText = (text: string) => text.replace(/\s+/g, "").length >= MIN_CHARACTERS;

/** What a PDF is: text, a scan, or a scan whose text Binder recognized. */
export type ScanState =
  | { kind: "text" }
  | { kind: "scan" }
  | { kind: "recognized"; languages: string; date: string };

/**
 * Whether a PDF is a scan: at least half of its pages have no text. Up
 * to 12 pages, spread over the file, are looked at.
 */
export async function scanStateOf(doc: PdfDocument): Promise<ScanState> {
  const meta = await doc.getMetadata().catch(() => null);
  const recognized = binderTextOf(meta?.info);
  if (recognized) return { kind: "recognized", ...recognized };
  const count = doc.numPages;
  const picks = new Set<number>();
  const looked = Math.min(count, 12);
  for (let i = 0; i < looked; i++) picks.add(1 + Math.floor((i * count) / looked));
  let empty = 0;
  for (const n of picks) if (!hasText(await pageText(doc, n))) empty++;
  return empty * 2 >= picks.size ? { kind: "scan" } : { kind: "text" };
}

/** Why recognizing stopped: the language files didn't come, or Tesseract failed. */
export class RecognizeError extends Error {}

type Worker = import("tesseract.js").Worker;

/**
 * Tesseract, with its worker and engine from the app's own files. A
 * failure in the worker, such as a language file that doesn't download,
 * rejects `failed`, which every step waits on beside its own work.
 */
async function startWorker(
  languages: string,
): Promise<{ worker: Worker; failed: Promise<never> }> {
  const [tesseract, workerUrl, coreUrl] = await Promise.all([
    import("tesseract.js"),
    import("tesseract.js/dist/worker.min.js?url"),
    import("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url"),
  ]);
  const absolute = (url: string) => new URL(url, window.location.href).href;
  let fail: (error: unknown) => void = () => {};
  const failed = new Promise<never>((_, reject) => {
    fail = reject;
  });
  // Waited on only beside other work: never left rejected with no one to hear it.
  failed.catch(() => {});
  const worker = await Promise.race([
    tesseract.createWorker(languages.split("+"), tesseract.OEM.LSTM_ONLY, {
      workerPath: absolute(workerUrl.default),
      corePath: absolute(coreUrl.default),
      langPath: LANGUAGE_FILES,
      gzip: false,
      workerBlobURL: false,
      errorHandler: (error) => fail(error),
    }),
    failed,
  ]).catch((error: unknown) => {
    throw new RecognizeError(
      /fetch|network|load/i.test(String(error))
        ? t("The language files didn't download. Check the connection and try again.")
        : String(error),
    );
  });
  return { worker, failed };
}

/** Pictures are drawn at 300 dots per inch, and never wider or taller than this. */
const DPI = 300;
const MAX_SIDE = 4200;

/** The words Tesseract found on one page, in the page's own coordinates. */
async function recognizePage(
  doc: PdfDocument,
  n: number,
  { worker, failed }: Awaited<ReturnType<typeof startWorker>>,
): Promise<PlacedWord[]> {
  const page = await doc.getPage(n);
  const natural = page.getViewport({ scale: 1 });
  const scale = Math.min(DPI / 72, MAX_SIDE / Math.max(natural.width, natural.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return [];
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  const { data } = await Promise.race([
    worker.recognize(canvas, {}, { blocks: true, text: false }),
    failed,
  ]);
  canvas.width = 0;
  const words: PlacedWord[] = [];
  let lineCount = 0;
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        lineCount++;
        const { baseline } = line;
        const slope =
          baseline && baseline.x1 > baseline.x0
            ? (baseline.y1 - baseline.y0) / (baseline.x1 - baseline.x0)
            : null;
        const height = line.rowAttributes?.rowHeight || line.bbox.y1 - line.bbox.y0;
        for (const word of line.words) {
          const text = word.text.trim();
          if (!text) continue;
          const yAt = (x: number) =>
            slope === null ? word.bbox.y1 : baseline.y0 + slope * (x - baseline.x0);
          const [x0, y0] = viewport.convertToPdfPoint(word.bbox.x0, yAt(word.bbox.x0));
          const [x1, y1] = viewport.convertToPdfPoint(word.bbox.x1, yAt(word.bbox.x1));
          words.push({
            text,
            x: x0,
            y: y0,
            width: Math.hypot(x1 - x0, y1 - y0),
            angle: Math.atan2(y1 - y0, x1 - x0),
            size: height / scale,
            line: lineCount,
          });
        }
      }
  return words;
}

export interface Recognizing {
  /** Pages done, and how many there are to do. */
  done: number;
  total: number;
}

/**
 * Recognizes the text of a PDF's pages that have none, and returns the
 * PDF with it. With `again`, every page Binder recognized before is read
 * again too. Stopping keeps the pages done so far; null when none were.
 */
export async function recognizeText(
  doc: PdfDocument,
  bytes: ArrayBuffer,
  options: {
    languages: string;
    again: boolean;
    date: string;
    signal: AbortSignal;
    onProgress: (progress: Recognizing) => void;
  },
): Promise<Uint8Array | null> {
  const todo: number[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (options.again || !hasText(await pageText(doc, n))) todo.push(n);
  }
  // Recognizing again replaces Binder's text, and keeps a page's own.
  if (options.again && todo.length === doc.numPages) {
    const own = await ownTextPages(bytes);
    for (const n of own) todo.splice(todo.indexOf(n), 1);
  }
  if (!todo.length || options.signal.aborted) return null;
  const tesseract = await startWorker(options.languages);
  options.onProgress({ done: 0, total: todo.length });
  const pages = new Map<number, PlacedWord[]>();
  try {
    for (const n of todo) {
      if (options.signal.aborted) break;
      pages.set(n - 1, await recognizePage(doc, n, tesseract));
      options.onProgress({ done: pages.size, total: todo.length });
    }
  } finally {
    void tesseract.worker.terminate();
  }
  if (!pages.size) return null;
  const { addTextLayer } = await import("./text-layer");
  return addTextLayer(bytes, pages, {
    languages: options.languages,
    date: options.date,
  });
}

/**
 * The pages whose text is their own, not Binder's: their text is still
 * there once Binder's is taken out.
 */
async function ownTextPages(bytes: ArrayBuffer): Promise<number[]> {
  const { addTextLayer } = await import("./text-layer");
  const stripped = await addTextLayer(bytes, await everyPage(bytes), {
    languages: "",
    date: "",
  });
  const doc = await openPdf(stripped.buffer as ArrayBuffer);
  try {
    const own: number[] = [];
    for (let n = 1; n <= doc.numPages; n++)
      if (hasText(await pageText(doc, n))) own.push(n);
    return own;
  } finally {
    void doc.loadingTask.destroy();
  }
}

/** Every page of a PDF with no words: what takes Binder's text out of each. */
async function everyPage(bytes: ArrayBuffer): Promise<Map<number, PlacedWord[]>> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  return new Map(pdf.getPages().map((_, i) => [i, []]));
}
