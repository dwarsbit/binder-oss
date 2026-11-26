import { describe, expect, it, vi } from "vitest";
import type { ToolOutcome } from "@scholarkit/assistant";
import { readItem, type Item } from "../binder";
import type { Highlight } from "../highlights";
import {
  binderKit,
  newNumbering,
  userMessage,
  type BinderCard,
  type BinderHost,
} from "./tools";

const item = (path: string, properties: string, body = ""): Item =>
  readItem(path, `---\n${properties}\n---\n\n${body}`);

const ROOFS = item(
  "items/Green roofs.md",
  "kind: article\nauthors: Santamouris, Mat\nyear: 2014\nfile: Green roofs.pdf\ntags: heat",
  "My notes on roofs.",
);
const STREETS = item(
  "items/Street level.md",
  "kind: article\nauthors: Sailor, David\nyear: 2012\nfile: Street level.pdf",
);
const PRIVATE = item(
  "items/Diary.md",
  "kind: article\nfile: Diary.pdf\nassistant: false",
  "Private.",
);
const THOUGHT = item(
  "items/Idea.md",
  "kind: thought\nstatus: inbox",
  "Roofs and trees?",
);

const TEXTS: Record<string, string[]> = {
  "items/Green roofs.pdf": [
    "Field studies in Athens show large effects. On days above 35 °C, the surface of an extensive green roof stayed between 25 and 30 degrees cooler than a conventional bitumen roof.",
    "Water supply is the main limit. When the substrate dried out, evapotranspiration fell sharply and the roofs lost most of their cooling advantage within a week.",
  ],
  "items/Street level.pdf": [
    "Simulations for a full city block found that greening every roof lowers the pedestrian-level air temperature by 0.3 to 0.8 °C.",
  ],
  "items/Diary.pdf": ["Roofs are cooler in my private diary."],
};

function host(overrides: Partial<BinderHost> = {}): BinderHost {
  const highlights: Record<string, Highlight[]> = {};
  return {
    items: () => [ROOFS, STREETS, PRIVATE, THOUGHT],
    allowed: (entry) => entry.assistant,
    question: () => "How much do green roofs cool a city?",
    highlights: (path) => highlights[path] ?? [],
    pagesOf: async (entry) => (entry.file ? (TEXTS[entry.file] ?? null) : null),
    canRead: (entry) => entry.assistant && Boolean(entry.file),
    ...overrides,
  };
}

async function run(kit: ReturnType<typeof binderKit>, name: string, args: object) {
  const tool = kit.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const out = await tool.run(args as Record<string, unknown>);
  return typeof out === "string"
    ? { result: out, attachment: undefined }
    : (out as ToolOutcome<BinderCard>);
}

describe("Binder's tools", () => {
  it("list the items, without the ones the assistant is kept away from", async () => {
    const kit = binderKit(host(), newNumbering());
    const { result } = await run(kit, "list_items", {});
    expect(result).toContain("items/Green roofs.md");
    expect(result).toContain("has text");
    expect(result).not.toContain("Diary");
    expect((await run(kit, "list_items", { view: "inbox" })).result).toContain(
      "items/Idea.md",
    );
    expect((await run(kit, "list_items", { tag: "heat" })).result).not.toContain(
      "Street level",
    );
    await expect(run(kit, "read_item", { path: "items/Diary.md" })).rejects.toThrow(
      "may read",
    );
  });

  it("search every source, the best passage first", async () => {
    const kit = binderKit(host(), newNumbering());
    const { result } = await run(kit, "search_sources", {
      query: "pedestrian air temperature",
    });
    expect(result).toMatch(/^Searched 2 sources/);
    expect(result.split("\n\n")[1]).toContain("[items/Street level.md]");
    expect(result).not.toContain("private diary");
  });

  it("check quotes word for word, and number them once", async () => {
    const numbers = newNumbering();
    const kit = binderKit(host(), numbers);
    const quote =
      "stayed between 25 and 30 degrees cooler than a conventional bitumen roof";
    const first = await run(kit, "quote", { path: ROOFS.path, quote });
    expect(first.result).toBe("Checked. Cite it as [1].");
    expect(first.attachment).toMatchObject({
      type: "quote",
      n: 1,
      page: 1,
      source: "Santamouris · 2014 · p. 1",
    });
    const second = await run(kit, "quote", {
      path: STREETS.path,
      quote: "lowers the pedestrian-level air temperature by 0.3 to 0.8 °C",
    });
    expect(second.result).toContain("[2]");
    // Cited again: the same number, its card under the new answer too.
    const again = await run(kit, "quote", { path: ROOFS.path, quote });
    expect(again.result).toContain("[1]");
    expect(numbers.quotes).toHaveLength(2);
    const wrong = await run(kit, "quote", {
      path: ROOFS.path,
      quote: "green roofs cool the whole city by ten degrees every day",
    });
    expect(wrong.result).toMatch(/^Not found word for word/);
    expect(wrong.attachment).toBeUndefined();
  });

  it("propose only the properties that change", async () => {
    const kit = binderKit(host(), newNumbering());
    const { attachment } = await run(kit, "propose_properties", {
      path: ROOFS.path,
      year: "2014",
      title: "Green roofs and the urban heat island",
      tags: ["heat", "roofs"],
    });
    expect(attachment).toMatchObject({
      type: "properties",
      id: 1,
      changes: [
        {
          field: "title",
          before: "Green roofs",
          after: "Green roofs and the urban heat island",
        },
        { field: "tags", after: "roofs" },
      ],
    });
    expect(
      (await run(kit, "propose_properties", { path: ROOFS.path, year: "2014" })).result,
    ).toMatch(/^Nothing to change/);
  });

  it("propose highlights that are in the source, and leave out the others", async () => {
    const kit = binderKit(host(), newNumbering());
    const { result, attachment } = await run(kit, "propose_highlights", {
      path: ROOFS.path,
      highlights: [
        {
          quote: "the roofs lost most of their cooling advantage within a week",
          category: "finding",
        },
        { quote: "this sentence is nowhere in the source at all", category: "claim" },
      ],
    });
    expect(result).toContain("1 were left out");
    expect(attachment).toMatchObject({
      type: "highlights",
      highlights: [{ category: "finding", page: 2 }],
    });
  });

  it("offer the account's tools only with an account, and look up through it", async () => {
    expect(binderKit(host(), newNumbering()).get("find_papers")).toBeUndefined();
    const searchPapers = vi.fn(async () => ({
      works: [
        {
          type: "article" as const,
          author: ["Clinton, Virginia"],
          editor: [],
          title: "Reading from paper compared to screens",
          year: "2019",
          container: "Journal of Research in Reading",
          publisher: "",
          place: "",
          volume: "",
          issue: "",
          pages: "",
          doi: "10.1111/1467-9817.12269",
          url: "",
          isbn: "",
          arxiv: "",
          pmid: "",
          openAlexId: "W1",
          freePdf: true,
          detailed: true,
        },
      ],
    }));
    const freePdfs = vi.fn(async () => ["https://example.org/a.pdf"]);
    const kit = binderKit(
      host({ searchPapers, freePdfs, lookUp: async () => null }),
      newNumbering(),
    );
    const papers = await run(kit, "find_papers", { query: "paper screens" });
    expect(searchPapers).toHaveBeenCalledWith("paper screens");
    expect(papers.attachment).toMatchObject({
      type: "papers",
      papers: [{ openAlexId: "W1" }],
    });
    expect((await run(kit, "find_free_pdf", { path: THOUGHT.path })).result).toContain(
      "no DOI",
    );
  });

  it("propose background reading only for what can be read", async () => {
    const kit = binderKit(host(), newNumbering());
    const { attachment } = await run(kit, "read_in_background", {
      paths: [ROOFS.path, PRIVATE.path, THOUGHT.path],
    });
    expect(attachment).toMatchObject({ type: "reading", paths: [ROOFS.path] });
  });

  it("tell the model what the question is about", () => {
    expect(
      userMessage("What does it say?", {
        item: ROOFS,
        selection: { text: "35 °C", page: 1 },
      }),
    ).toBe(
      'The user has "Green roofs" open (path: items/Green roofs.md). They selected this in its source on page 1: "35 °C"\n\nWhat does it say?',
    );
  });
});
