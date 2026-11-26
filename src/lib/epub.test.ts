// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { authorsOf, chapterHtml, chapterTexts, EpubError, openEpub } from "./epub";
import {
  highlightLine,
  placeHref,
  placeOfHref,
  readHighlights,
  writeHighlights,
} from "./highlights";
import { sampleBookFiles, zipEpub } from "./sample-book";
import { isPaged, isReadable, normalize } from "./text";

const buffer = (bytes: Uint8Array) => bytes.slice().buffer;
const SAMPLE = () => buffer(zipEpub(sampleBookFiles()));
const noImages = { image: () => null };

describe("EPUBs", () => {
  it("reads what a book says about itself", () => {
    const book = openEpub(SAMPLE());
    expect(book.title).toBe("The reading student");
    expect(authorsOf(book)).toEqual(["de Boer, Anna"]);
    expect(book.year).toBe("2018");
    expect(book.isbn).toBe("9789462981234");
    expect(book.publisher).toBe("Amsterdam University Press");
  });

  it("finds the chapters in reading order, with their titles", () => {
    const book = openEpub(SAMPLE());
    expect(book.chapters.map((c) => c.title)).toEqual([
      "Introduction",
      "Who reads, and where",
      "The list and the link",
      "Reading for a course",
      "Margins",
      "What stays",
    ]);
    expect(book.contents[3]).toEqual({
      title: "Reading for a course",
      chapter: 4,
      depth: 0,
    });
  });

  it("shows a chapter's text without the book's own styles and scripts", () => {
    const files = sampleBookFiles();
    files["OEBPS/chapter-2.xhtml"] = files["OEBPS/chapter-2.xhtml"].replace(
      "</section>",
      '<script>alert(1)</script><p style="color:red" onclick="x()">See <a href="chapter-4.xhtml#note">the chapter</a> and <a href="https://example.org">the site</a>.</p></section>',
    );
    const book = openEpub(buffer(zipEpub(files)));
    const html = chapterHtml(book, 2, noImages);
    expect(html).toContain("<h1>Who reads, and where</h1>");
    expect(html).not.toContain("script");
    expect(html).not.toContain("style=");
    expect(html).not.toContain("onclick");
    expect(html).toContain('<a data-chapter="4">the chapter</a>');
    expect(html).toContain('<a href="https://example.org">the site</a>');
  });

  it("reads the text of each chapter, for search", () => {
    const texts = chapterTexts(openEpub(SAMPLE()));
    expect(texts).toHaveLength(6);
    expect(normalize(texts[3])).toContain(
      "Reading for a course is reading to be ready, not reading to understand.",
    );
  });

  it("takes its table of contents from an EPUB 2 book's NCX", () => {
    const files = sampleBookFiles();
    delete files["OEBPS/nav.xhtml"];
    files["OEBPS/book.opf"] = files["OEBPS/book.opf"]
      .replace(
        /<item id="nav"[^>]*\/>/,
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
      )
      .replace("<spine>", '<spine toc="ncx">');
    files["OEBPS/toc.ncx"] = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
<navPoint id="a"><navLabel><text>Start</text></navLabel><content src="chapter-1.xhtml"/>
<navPoint id="b"><navLabel><text>Margins, again</text></navLabel><content src="chapter-5.xhtml#top"/></navPoint>
</navPoint></navMap></ncx>`;
    const book = openEpub(buffer(zipEpub(files)));
    expect(book.contents).toEqual([
      { title: "Start", chapter: 1, depth: 0 },
      { title: "Margins, again", chapter: 5, depth: 1 },
    ]);
    // A chapter the contents leave out is named by its heading.
    expect(book.chapters[1].title).toBe("Who reads, and where");
  });

  it("says when a book is locked, and keeps a book with obfuscated fonts", () => {
    const encryption = (uri: string) => `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
<enc:EncryptedData><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData>
</encryption>`;
    const locked = {
      ...sampleBookFiles(),
      "META-INF/encryption.xml": encryption("OEBPS/chapter-1.xhtml"),
    };
    expect(() => openEpub(buffer(zipEpub(locked)))).toThrow(EpubError);
    const fonts = {
      ...sampleBookFiles(),
      "META-INF/encryption.xml": encryption("OEBPS/fonts/a.otf"),
    };
    expect(openEpub(buffer(zipEpub(fonts))).chapters).toHaveLength(6);
    expect(() => openEpub(new TextEncoder().encode("not a book").buffer)).toThrow(
      EpubError,
    );
  });

  it("is a source to read, with numbered places", () => {
    expect(isReadable("items/A.epub")).toBe(true);
    expect(isPaged("items/A.epub")).toBe(true);
    expect(isPaged("items/A.html")).toBe(false);
  });
});

describe("highlights in an EPUB", () => {
  const highlight = {
    id: "r2d7kc",
    category: "claim" as const,
    page: 4,
    text: "Reading for a course is reading to be ready.",
  };

  it("count chapters, and read back as written", () => {
    expect(highlightLine(highlight, "chapter")).toBe(
      "- **Claim** · ch. 4 · “Reading for a course is reading to be ready.” ^r2d7kc",
    );
    const source = writeHighlights("items/Book.md", [highlight], undefined, "chapter");
    expect(readHighlights(source).highlights).toEqual([highlight]);
    expect(
      writeHighlights(
        "items/Book.md",
        readHighlights(source).highlights,
        source,
        "chapter",
      ),
    ).toBe(source);
  });

  it("link to their chapter", () => {
    const href = placeHref("items", {
      file: "items/The reading student.epub",
      page: 4,
      highlight: "r2d7kc",
    });
    expect(href).toBe("The%20reading%20student.epub#chapter=4&highlight=r2d7kc");
    expect(placeOfHref("items", href)).toMatchObject({ page: 4, highlight: "r2d7kc" });
  });
});
