import { describe, expect, it } from "vitest";
import { newItemSource, readItem, setProperties } from "./binder";
import { exportFileName, exportReferences, exportText } from "./export";

const article = readItem(
  "items/Screen or paper.md",
  newItemSource(
    {
      title: "Screen or paper: how first-year students read course texts",
      kind: "article",
      status: "to-read",
      authors: ["Okafor, Nkem", "Brandt, Sofie"],
      year: "2021",
      publishedIn: "Journal of Higher Education Research",
      volume: "14",
      issue: "2",
      pages: "112-131",
      doi: "https://doi.org/10.1000/jher.2021.0042",
      tags: ["survey"],
    },
    "2026-11-13",
  ),
);
const second = readItem(
  "items/Reading on screens.md",
  newItemSource({
    title: "Reading on screens",
    kind: "book",
    authors: ["Okafor, Nkem"],
    year: "2021",
    isbn: "9789462981234",
  }),
);
const thought = readItem(
  "items/A thought.md",
  newItemSource({ title: "Does an e-reader count?", kind: "thought" }),
);
const lecture = readItem(
  "items/Guest lecture.md",
  newItemSource({
    title: "Guest lecture",
    kind: "lecture",
    authors: ["Moreno, Luis"],
    year: "2026",
  }),
);

describe("volume, issue and pages", () => {
  it("are read, and written in Binder's order", () => {
    expect(article).toMatchObject({ volume: "14", issue: "2", pages: "112-131" });
    const source = setProperties(
      newItemSource(
        { title: "A", kind: "article", year: "2020", doi: "10.1/x" },
        "2026-11-13",
      ),
      { pages: "1-9", volume: "3" },
    );
    expect(source).toMatch(/year: 2020\nvolume: "?3"?\npages: 1-9\ndoi: 10\.1\/x/);
  });
});

describe("exporting", () => {
  it("leaves out notes and thoughts, and gives each source its own key", () => {
    const refs = exportReferences([article, thought, second, lecture]);
    expect(refs.map((ref) => [ref.key, ref.type])).toEqual([
      ["okafor2021", "article"],
      ["okafor2021a", "book"],
      ["moreno2026", "other"],
    ]);
    expect(refs[0]).toMatchObject({
      container: "Journal of Higher Education Research",
      volume: "14",
      issue: "2",
      pages: "112-131",
      doi: "10.1000/jher.2021.0042",
      keywords: ["survey"],
    });
    expect(refs[1].isbn).toBe("9789462981234");
  });

  it("writes each format", () => {
    expect(exportText("bibtex", [article])).toContain("@article{okafor2021,");
    expect(exportText("ris", [article])).toContain("TY  - JOUR");
    expect(JSON.parse(exportText("csl-json", [article]))[0].id).toBe("okafor2021");
  });

  it("carries arXiv and PubMed IDs, which the item keeps", () => {
    const source = newItemSource(
      {
        title: "Attention is all you need",
        kind: "article",
        authors: ["Vaswani, Ashish"],
        year: "2017",
        publishedIn: "arXiv",
        doi: "10.48550/arXiv.1706.03762",
        arxiv: "1706.03762",
        pmid: "31452104",
        url: "https://arxiv.org/abs/1706.03762",
      },
      "2026-11-26",
    );
    expect(source).toMatch(
      /doi: 10\.48550\/arXiv\.1706\.03762\narxiv: "?1706\.03762"?\npmid: "?31452104"?\nurl: /,
    );
    const preprint = readItem("items/Attention.md", source);
    expect(preprint).toMatchObject({ arxiv: "1706.03762", pmid: "31452104" });
    const bibtex = exportText("bibtex", [preprint]);
    expect(bibtex).toContain("eprint = {1706.03762}");
    expect(bibtex).toContain("archiveprefix = {arXiv}");
    expect(bibtex).toContain("pmid = {31452104}");
    expect(JSON.parse(exportText("csl-json", [preprint]))[0].PMID).toBe("31452104");
  });

  it("names the file", () => {
    expect(exportFileName("Thesis", "bibtex")).toBe("Thesis.bib");
    expect(exportFileName("Thesis (Reading list)", "ris")).toBe(
      "Thesis (Reading list).ris",
    );
    expect(exportFileName("a/b: c", "csl-json")).toBe("a b c.json");
    expect(exportFileName("  ", "bibtex")).toBe("References.bib");
  });
});
