import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { addTextLayer, layerOperators, type PlacedWord } from "./text-layer";
import { binderTextOf } from "./text-mark";

/** A page with a picture of text and no text: what a scanner makes. */
async function scan(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawRectangle({ x: 72, y: 700, width: 300, height: 20 });
  return pdf.save();
}

async function textOf(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(0), useSystemFonts: false })
    .promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items = content.items.filter((item) => "str" in item);
  const text = items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join("");
  const metadata = await doc.getMetadata();
  await doc.loadingTask.destroy();
  return { text, items, info: metadata.info };
}

const WORDS: PlacedWord[] = [
  { text: "Reading", x: 72, y: 704, width: 60, angle: 0, size: 14, line: 1 },
  { text: "für", x: 136, y: 704, width: 24, angle: 0, size: 14, line: 1 },
  { text: "Студенты", x: 164, y: 704, width: 70, angle: 0, size: 14, line: 1 },
];

/** Two lines of a page scanned a little askew. */
function askew(): PlacedWord[] {
  const angle = -0.01;
  const along = (x0: number, y0: number, d: number) => ({
    x: x0 + d * Math.cos(angle),
    y: y0 + d * Math.sin(angle),
  });
  return [
    { text: "Reading", ...along(72, 704, 0), width: 60, angle, size: 14, line: 1 },
    { text: "to", ...along(72, 704, 64), width: 16, angle, size: 14, line: 1 },
    { text: "pass", ...along(72, 704, 84), width: 36, angle, size: 14, line: 1 },
    { text: "and", ...along(72, 686, 0), width: 30, angle, size: 14, line: 2 },
    { text: "to", ...along(72, 686, 34), width: 16, angle, size: 14, line: 2 },
    { text: "know", ...along(72, 686, 54), width: 40, angle, size: 14, line: 2 },
  ];
}

describe("recognized text in a PDF", () => {
  it("writes words as text that isn't drawn", () => {
    const ops = layerOperators(WORDS);
    expect(ops).toContain("3 Tr");
    // “Reading ” is 8 glyphs of half an em at 14 pt over 60 pt.
    expect(ops).toContain(
      `${((100 * 60) / (14 * 0.5 * 8)).toFixed(3).replace(/0+$/, "")} Tz`,
    );
    expect(ops).toContain("<00520065006100640069006e00670020> Tj");
  });

  it("makes the words of a scan readable where they stand", async () => {
    const before = await textOf(await scan());
    expect(before.text.trim()).toBe("");
    const after = await addTextLayer(await scan(), new Map([[0, WORDS]]), {
      languages: "eng+deu",
      date: "2026-11-26",
    });
    const read = await textOf(after);
    expect(read.text.replace(/\s+/g, " ").trim()).toBe("Reading für Студенты");
    const first = read.items[0] as { transform: number[]; width: number };
    expect(first.transform[4]).toBeCloseTo(72, 0);
    expect(first.transform[5]).toBeCloseTo(704, 0);
    expect(binderTextOf(read.info)).toEqual({
      languages: "eng+deu",
      date: "2026-11-26",
    });
  });

  it("keeps the words of a line together, and the lines apart, on a page scanned askew", async () => {
    const after = await addTextLayer(await scan(), new Map([[0, askew()]]), {
      languages: "eng",
      date: "2026-11-26",
    });
    const { text } = await textOf(after);
    expect(text.replace(/[ \t]+/g, " ").trim()).toBe("Reading to pass\nand to know");
  });

  it("replaces the text it wrote before, and keeps the page", async () => {
    const once = await addTextLayer(await scan(), new Map([[0, WORDS]]), {
      languages: "eng",
      date: "2026-11-25",
    });
    const twice = await addTextLayer(
      once,
      new Map([[0, [{ text: "Again", x: 72, y: 704, width: 40, angle: 0, size: 14 }]]]),
      { languages: "nld", date: "2026-11-26" },
    );
    const read = await textOf(twice);
    expect(read.text.trim()).toBe("Again");
    expect(binderTextOf(read.info)?.languages).toBe("nld");
    const pdf = await PDFDocument.load(twice);
    expect(pdf.getPageCount()).toBe(1);
  });
});
