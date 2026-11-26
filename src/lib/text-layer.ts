import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  type PDFContext,
  type PDFPageLeaf,
} from "pdf-lib";
import { INFO_KEY } from "./text-mark";

/**
 * Recognized text, written into a PDF as an invisible layer over each
 * page, as OCRmyPDF and Tesseract write it: the pages look the same, and
 * every app that reads a PDF's text finds the words where they stand.
 *
 * The words are set in Tesseract's GlyphLessFont, a font of one empty
 * glyph that every character maps to, in text that isn't drawn (render
 * mode 3). Each word is stretched to the width it has on the page.
 */

/** A recognized word, placed in the page's own coordinates (PDF points). */
export interface PlacedWord {
  text: string;
  /** Where its baseline starts. */
  x: number;
  y: number;
  /** Its length along the baseline. */
  width: number;
  /** The angle of the baseline, in radians; 0 is left to right. */
  angle: number;
  /** The height of its line. */
  size: number;
  /** Which line of the page it is on: the words of a line share one text matrix. */
  line?: number;
}

/** Marks the content streams Binder adds, so recognizing again replaces them. */
const MARK = PDFName.of("BinderText");
const FONT = PDFName.of("BinderGlyphLess");

/** Tesseract's GlyphLessFont (tessdata/pdf.ttf, Apache-2.0), 572 bytes. */
const GLYPH_LESS_FONT =
  "AAEAAAAKAIAAAwAgT1MvMlbeyJQAAAEoAAAAYGNtYXAACgA0AAABkAAAAB5nbHlmFSJBJAAAAbgAAAAYaGVhZAt48WUAAACsAAAANmhoZWEMAgQCAAAA5AAAACRobXR4BAAAAAAAAYgAAAAIbG9jYQAMAAAAAAGwAAAABm1heHAABAAFAAABCAAAACBuYW1l8usW2gAAAdAAAABLcG9zdAABAAEAAAIcAAAAIAABAAAAAQAAsJRxEF8PPPUEBwgAAAAAAM+a/G4AAAAA1MOn8gAAAAAEAAgAAAAAEAACAAAAAAAAAAEAAAgA//8AAAQAAAAAAAQAAAEAAAAAAAAAAAAAAAAAAAACAAEAAAACAAQAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAwAAAZAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAR09PRwBAAAAAAAAB//8AAAABAAGAAAAAAAAAAAAAAAAAAAABAAAAAAAABAAAAAAAAAIAAQAAAAAAFAADAAAAAAAUAAYACgAAAAAAAAAAAAAAAAAMAAAAAQAAAAAEAAgAAAMAADEhESEEAPwACAAAAAADACoAAAADAAAABQAWAAAAAQAAAAAABQALABYAAwABBAkABQAWAAAAVgBlAHIAcwBpAG8AbgAgADEALgAwVmVyc2lvbiAxLjAAAAEAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAA=";

const TO_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

const bytesOf = (base64: string) =>
  Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

/** The font, added to the document once. */
function addFont(context: PDFContext): PDFRef {
  const font = bytesOf(GLYPH_LESS_FONT);
  const fontFile = context.register(
    context.flateStream(font, { Length1: font.length }),
  );
  const descriptor = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "GlyphLessFont",
      Flags: 5,
      FontBBox: [0, 0, 500, 1000],
      ItalicAngle: 0,
      Ascent: 1000,
      Descent: -1,
      CapHeight: 1000,
      StemV: 80,
      FontFile2: fontFile,
    }),
  );
  // Every character is glyph 1.
  const map = new Uint8Array(65536 * 2);
  for (let i = 1; i < map.length; i += 2) map[i] = 1;
  const cidToGid = context.register(context.flateStream(map));
  const cidFont = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "GlyphLessFont",
      CIDSystemInfo: {
        Registry: PDFString.of("Adobe"),
        Ordering: PDFString.of("Identity"),
        Supplement: 0,
      },
      FontDescriptor: descriptor,
      DW: 500,
      CIDToGIDMap: cidToGid,
    }),
  );
  const toUnicode = context.register(context.flateStream(TO_UNICODE));
  return context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "GlyphLessFont",
      Encoding: "Identity-H",
      DescendantFonts: [cidFont],
      ToUnicode: toUnicode,
    }),
  );
}

/** A number as a content stream writes it: short, and never in exponent form. */
const num = (n: number) => {
  const fixed = n.toFixed(3).replace(/\.?0+$/, "");
  return fixed === "-0" ? "0" : fixed;
};

/** The characters of a word as the font's codes: UTF-16, one glyph each. Others are left out. */
const hexOf = (text: string) =>
  [...text]
    .map((c) => c.codePointAt(0)!)
    .filter((code) => code > 0 && code <= 0xffff)
    .map((code) => code.toString(16).padStart(4, "0"))
    .join("");

/** Lines within this of a quarter turn are written straight. */
const SKEW = (3 * Math.PI) / 180;

/**
 * A line's angle, straightened when the scan is only a little askew: pdf.js
 * reads a stretched word on a slanted line as a line of its own, and a few
 * degrees don't move a word off its place on the page.
 */
function straightened(angle: number): number {
  const quarter = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  return Math.abs(angle - quarter) < SKEW ? quarter : angle;
}

/**
 * The content stream of one page's words. A line starts with its own text
 * matrix, and each word after it moves along the line, as Tesseract writes
 * it: readers then find the line's words side by side, with spaces between.
 */
export function layerOperators(words: PlacedWord[]): string {
  const lines = ["q", "BT", "3 Tr"];
  // Where the text line stands: the start of the last word written, and the line's direction.
  let at: { x: number; y: number; angle: number; line?: number } | null = null;
  let size = 0;
  for (const word of words) {
    // A space ends each word, so the words stay apart when the text is read out.
    const hex = hexOf(`${word.text.trim()} `);
    const count = hex.length / 4;
    if (count < 2 || word.size <= 0 || word.width <= 0) continue;
    if (word.size !== size) lines.push(`/BinderGlyphLess ${num(word.size)} Tf`);
    size = word.size;
    // A glyph is half an em wide: the stretch fits the word to its width.
    lines.push(`${num((100 * word.width) / (word.size * 0.5 * count))} Tz`);
    if (at && word.line !== undefined && word.line === at.line) {
      // Along the line, in its own direction, from the start of the word before.
      const dx = word.x - at.x;
      const dy = word.y - at.y;
      const cos = Math.cos(at.angle);
      const sin = Math.sin(at.angle);
      lines.push(`${num(cos * dx + sin * dy)} ${num(cos * dy - sin * dx)} Td`);
      at = { x: word.x, y: word.y, angle: at.angle, line: at.line };
    } else {
      const angle = straightened(word.angle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      lines.push(
        `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(word.x)} ${num(word.y)} Tm`,
      );
      at = { x: word.x, y: word.y, angle, line: word.line };
    }
    lines.push(`<${hex}> Tj`);
  }
  lines.push("ET", "Q");
  return lines.join("\n");
}

const isMarked = (context: PDFContext, entry: unknown) => {
  const stream = entry instanceof PDFRef ? context.lookup(entry) : entry;
  return (
    (stream instanceof PDFRawStream || stream instanceof PDFStream) &&
    stream.dict.has(MARK)
  );
};

/** Takes out the text a page got from Binder before. True when it had some. */
function removeLayer(context: PDFContext, page: PDFPageLeaf): boolean {
  const contents = page.Contents();
  if (!(contents instanceof PDFArray)) return false;
  const kept = contents.asArray().filter((entry) => !isMarked(context, entry));
  if (kept.length === contents.size()) return false;
  page.set(PDFName.of("Contents"), context.obj(kept));
  return true;
}

/**
 * The PDF with the words of its pages written in as text, replacing text
 * Binder wrote before. `pages` holds the words by page index, from 0;
 * pages it leaves out keep what they have.
 */
export async function addTextLayer(
  bytes: Uint8Array | ArrayBuffer,
  pages: Map<number, PlacedWord[]>,
  info: { languages: string; date: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = pdf.context;
  let font: PDFRef | null = null;
  const all = pdf.getPages();
  for (const [index, words] of pages) {
    const page = all[index]?.node;
    if (!page) continue;
    const had = removeLayer(context, page);
    if (!words.length) continue;
    font ??= addFont(context);
    page.normalize();
    page.setFontDictionary(FONT, font);
    if (!had) {
      // The page's own content may leave its drawing state changed: it is wrapped, so the text starts clean.
      page.wrapContentStreams(
        context.register(context.stream("q\n")),
        context.register(context.stream("\nQ\n")),
      );
    }
    const stream = context.flateStream(layerOperators(words), { BinderText: true });
    page.addContentStream(context.register(stream));
  }
  const trailer = context.trailerInfo;
  let infoDict = trailer.Info ? context.lookup(trailer.Info) : undefined;
  if (!(infoDict instanceof PDFDict)) {
    infoDict = context.obj({});
    trailer.Info = context.register(infoDict);
  }
  (infoDict as PDFDict).set(
    PDFName.of(INFO_KEY),
    PDFString.of(`${info.languages} ${info.date}`),
  );
  return pdf.save();
}
