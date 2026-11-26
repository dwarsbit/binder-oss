import { describe, expect, it } from "vitest";
import { newItemSource, readItem } from "./binder";
import { itemOfReference, sameWork } from "./items";
import { emptyReference } from "@scholarkit/editor/references/reference";

const item = (path: string, fields: Parameters<typeof newItemSource>[0]) =>
  readItem(path, newItemSource(fields, "2026-11-26"));

const items = [
  item("items/a.md", {
    title: "Attention is all you need",
    kind: "article",
    doi: "https://doi.org/10.48550/arXiv.1706.03762",
    arxiv: "1706.03762v5",
  }),
  item("items/b.md", { title: "Reading on paper", kind: "article", pmid: "31452104" }),
  item("items/c.md", { title: "The TeXbook", kind: "book", isbn: "978-0-201-13447-6" }),
];

describe("a work the binder has already", () => {
  it("is found by any of its IDs", () => {
    expect(sameWork(items, "doi", "10.48550/ARXIV.1706.03762")?.path).toBe(
      "items/a.md",
    );
    expect(sameWork(items, "arxiv", "1706.03762")?.path).toBe("items/a.md");
    expect(sameWork(items, "pubmed", "31452104")?.path).toBe("items/b.md");
    expect(sameWork(items, "isbn", "9780201134476")?.path).toBe("items/c.md");
    expect(sameWork(items, "pubmed", "1")).toBeUndefined();
  });

  it("keeps the IDs a lookup found, and none from Zotero", () => {
    const found = {
      ...emptyReference("vaswani2017"),
      type: "article" as const,
      title: "Attention is all you need",
      isbn: "",
      arxiv: "1706.03762",
      pmid: "",
    };
    expect(itemOfReference(found)).toMatchObject({
      arxiv: "1706.03762",
      pmid: undefined,
    });
    expect(itemOfReference(emptyReference("x")).arxiv).toBeUndefined();
  });
});
