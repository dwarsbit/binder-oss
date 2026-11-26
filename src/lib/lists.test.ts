import { describe, expect, it } from "vitest";
import { readItem, writeBinderInfo } from "./binder";
import { inView } from "./items";
import {
  defaultLists,
  freeListName,
  inList,
  readLists,
  writeLists,
  type SavedList,
} from "./lists";

const ARTICLE = readItem(
  "items/Screen or paper.md",
  `---
title: Screen or paper
kind: article
status: to-read
authors: ["Okafor, Nkem", "Brandt, Sofie"]
year: 2021
published-in: Journal of Higher Education Research
file: Screen or paper.pdf
tags: [survey, laptops]
added: 2026-11-20
---
`,
);

const BOOK = readItem(
  "items/The reading student.md",
  `---
title: The reading student
kind: book
status: reading
authors: ["de Boer, Jan"]
year: 2018
tags: [first year]
added: 2026-10-01
---
`,
);

const THOUGHT = readItem(
  "items/Does an e-reader count.md",
  `---
title: Does an e-reader count?
kind: thought
status: inbox
added: 2026-11-25
---
`,
);

const list = (filters: SavedList["filters"]): SavedList => ({
  name: "List",
  filters,
  unknown: [],
});

const TODAY = new Date(2026, 10, 26);

describe("saved lists", () => {
  it("start with the four lists a binder gets until you change one", () => {
    expect(readLists(undefined).map((entry) => entry.name)).toEqual([
      "Added this week",
      "Ready to read",
      "Missing a PDF",
      "Books and chapters",
    ]);
    expect(readLists(writeBinderInfo(undefined, "A question?"))).toEqual(
      defaultLists(),
    );
  });

  it("are none with an empty list", () => {
    const source = writeLists(writeBinderInfo(undefined, "A question?"), []);
    expect(source).toBe("---\nbinder: 1\nlists: []\n---\n\nA question?\n");
    expect(readLists(source)).toEqual([]);
  });

  it("are written into binder.md, its other lines and the question kept", () => {
    const before = "---\nbinder: 1\nassistant: false\nmine: yes\n---\n\nA question?\n";
    const lists: SavedList[] = [
      list({ status: ["to-read"], hasFile: true }),
      {
        name: "Recent: methods",
        filters: {
          kind: ["article"],
          tags: ["methods", "diary study"],
          yearFrom: 2019,
          yearTo: 2024,
          addedWithin: 30,
          author: "Okafor",
          publishedIn: "Journal",
        },
        unknown: [],
      },
    ];
    const source = writeLists(before, lists);
    expect(source).toBe(`---
binder: 1
assistant: false
mine: yes
lists:
  - name: List
    status: [to-read]
    has-file: true
  - name: "Recent: methods"
    kind: [article]
    tags: [methods, diary study]
    year-from: 2019
    year-to: 2024
    added-within: 30
    author: Okafor
    published-in: Journal
---

A question?
`);
    expect(readLists(source)).toEqual(lists);
    // Written again in its place, not added a second time.
    expect(writeLists(source, lists)).toBe(source);
    expect(writeLists(source, [])).toBe(
      "---\nbinder: 1\nassistant: false\nmine: yes\nlists: []\n---\n\nA question?\n",
    );
  });

  it("read lists as YAML writes them, and keep lines they don't know", () => {
    const source = `---
binder: 1
lists:
- name: First
  kind: [book]
  rating: 5

- name: Second
other: kept
---
`;
    const lists = readLists(source);
    expect(lists.map((entry) => entry.name)).toEqual(["First", "Second"]);
    expect(lists[0].filters).toEqual({ kind: ["book"] });
    const written = writeLists(source, lists);
    expect(written).toContain("  - name: First\n    kind: [book]\n    rating: 5\n");
    expect(written).toContain("other: kept");
    // A filter this Binder doesn't know shows nothing rather than too much.
    expect(inList(BOOK, lists[0])).toBe(false);
    expect(inList(BOOK, lists[1])).toBe(true);
  });

  it("filter on every property they know", () => {
    const passes = (filters: SavedList["filters"]) =>
      [ARTICLE, BOOK, THOUGHT]
        .filter((item) => inList(item, list(filters), TODAY))
        .map((item) => item.title);
    expect(passes({})).toEqual([
      "Screen or paper",
      "The reading student",
      "Does an e-reader count?",
    ]);
    expect(passes({ status: ["to-read", "reading"] })).toEqual([
      "Screen or paper",
      "The reading student",
    ]);
    expect(passes({ kind: ["book", "chapter"] })).toEqual(["The reading student"]);
    expect(passes({ tags: ["laptops", "first year"] })).toEqual([
      "Screen or paper",
      "The reading student",
    ]);
    expect(passes({ yearFrom: 2019 })).toEqual(["Screen or paper"]);
    expect(passes({ yearTo: 2019 })).toEqual(["The reading student"]);
    expect(passes({ addedWithin: 7 })).toEqual([
      "Screen or paper",
      "Does an e-reader count?",
    ]);
    expect(passes({ addedWithin: 1 })).toEqual([]);
    expect(passes({ hasFile: true })).toEqual(["Screen or paper"]);
    expect(passes({ hasFile: false })).toEqual([
      "The reading student",
      "Does an e-reader count?",
    ]);
    expect(passes({ author: "okafor" })).toEqual(["Screen or paper"]);
    expect(passes({ publishedIn: "higher education" })).toEqual(["Screen or paper"]);
    expect(passes({ kind: ["article"], status: ["reading"] })).toEqual([]);
  });

  it("get a name no other list has", () => {
    const lists = [list({}), { ...list({}), name: "List 2" }];
    expect(freeListName(lists, "Other")).toBe("Other");
    expect(freeListName(lists, "list")).toBe("list 3");
    expect(freeListName(lists, "List", "List")).toBe("List");
  });
});

describe("views", () => {
  it("show a thought in the inbox among the notes too", () => {
    expect(inView(THOUGHT, { kind: "inbox" })).toBe(true);
    expect(inView(THOUGHT, { kind: "notes" })).toBe(true);
    expect(inView(ARTICLE, { kind: "notes" })).toBe(false);
  });

  it("show a saved list by its name", () => {
    const lists = [{ ...list({ kind: ["book"] }), name: "Books" }];
    expect(inView(BOOK, { kind: "list", name: "Books" }, lists)).toBe(true);
    expect(inView(ARTICLE, { kind: "list", name: "Books" }, lists)).toBe(false);
    expect(inView(BOOK, { kind: "list", name: "Gone" }, lists)).toBe(false);
  });
});
