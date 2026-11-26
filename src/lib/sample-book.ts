import { strToU8, zipSync, type Zippable } from "fflate";

/**
 * The demo's book, “The reading student”, as a small EPUB 3: made here
 * rather than kept as a file, so its text can be read and changed.
 */

const CHAPTERS: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: "Introduction",
    paragraphs: [
      "This book follows forty-one first-year students through their first term at university, and asks one question of each of them: what does reading for a course look like from the inside?",
      "We sat with them in the library, on the bus and at kitchen tables. We asked them to bring the last text they had read for a course, and to show us where they had stopped.",
    ],
  },
  {
    title: "Who reads, and where",
    paragraphs: [
      "Most of the students read at home, in the evening, with a laptop on the table and a phone beside it. The library came second, mostly in the weeks before exams.",
      "Few read on the way to class. Those who did read on a phone, and said they read “the easy parts” there: the introduction, the conclusion, the headings.",
    ],
  },
  {
    title: "The list and the link",
    paragraphs: [
      "A course text arrives as a line on a reading list, and more and more often as a link. The link opens a PDF in the browser, and the PDF is read where it opens.",
      "Students who printed their texts were the exception. Printing costs money, and a printed text has to be carried.",
    ],
  },
  {
    title: "Reading for a course",
    paragraphs: [
      "A course text is not chosen by the reader. It arrives on a list, often as a link, with a week number beside it and a seminar at the end of that week. Most of the students we followed read it the night before.",
      "Reading for a course is reading to be ready, not reading to understand. The students knew the difference, and named it themselves: one called it “reading for the room”.",
      "We came to call the two reading to know and reading to pass. Reading to know follows an argument and judges it. Reading to pass looks for what the seminar will ask, and stops when it has found it.",
      "What they read on screen they read in pieces. A chapter became three sittings, each opened from a different device: the laptop in the library, the phone on the bus, the laptop again at home. Nothing in the text told them where they had stopped.",
    ],
  },
  {
    title: "Margins",
    paragraphs: [
      "We asked each student to bring the last text they had read for a course. Of the forty-one who came, twenty-six brought paper, and nineteen of those had written in the margins.",
      "Those who read on screen had marked almost nothing. Most did not know that the PDF reader they used could highlight.",
    ],
  },
  {
    title: "What stays",
    paragraphs: [
      "A week after the seminar, we asked the students what the text had argued. Those who had read to know could say it in a sentence. Those who had read to pass remembered the question they had been asked about it.",
    ],
  },
];

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const chapterFile = (i: number) => `chapter-${i + 1}.xhtml`;

const chapter = (title: string, paragraphs: string[]) =>
  `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escape(title)}</title></head>
<body><section epub:type="chapter">
<h1>${escape(title)}</h1>
${paragraphs.map((p) => `<p>${escape(p)}</p>`).join("\n")}
</section></body>
</html>`;

/** The book's files, by their path in the EPUB. */
export function sampleBookFiles(): Record<string, string> {
  const files: Record<string, string> = {
    mimetype: "application/epub+zip",
    "META-INF/container.xml": `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    "OEBPS/book.opf": `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="isbn">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="isbn">urn:isbn:9789462981234</dc:identifier>
<dc:title>The reading student</dc:title>
<dc:creator>Anna de Boer</dc:creator>
<dc:publisher>Amsterdam University Press</dc:publisher>
<dc:date>2018-03-01</dc:date>
<dc:language>en</dc:language>
<meta property="dcterms:modified">2018-03-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="book.css" media-type="text/css"/>
${CHAPTERS.map((_, i) => `<item id="c${i + 1}" href="${chapterFile(i)}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine>
${CHAPTERS.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("\n")}
</spine>
</package>`,
    "OEBPS/nav.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>
${CHAPTERS.map((c, i) => `<li><a href="${chapterFile(i)}">${escape(c.title)}</a></li>`).join("\n")}
</ol></nav></body>
</html>`,
    "OEBPS/book.css": "body { font-family: serif; } h1 { font-size: 2em; }",
  };
  CHAPTERS.forEach((c, i) => {
    files[`OEBPS/${chapterFile(i)}`] = chapter(c.title, c.paragraphs);
  });
  return files;
}

/** An EPUB of `files`, with its mimetype first and stored, as readers expect. */
export function zipEpub(files: Record<string, string>): Uint8Array {
  const entries: Zippable = {};
  for (const [path, text] of Object.entries(files))
    entries[path] = path === "mimetype" ? [strToU8(text), { level: 0 }] : strToU8(text);
  return zipSync(entries);
}
