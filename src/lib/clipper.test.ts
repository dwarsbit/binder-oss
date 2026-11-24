import { describe, expect, it } from "vitest";
import { CLIP_MAX_HTML, type ClipPayload } from "@scholarkit/contracts";
import { clipHighlights, parseClip, sameUrl } from "./clipper";

const valid = (): ClipPayload => ({
  kind: "page",
  url: "https://example.com/articles/1",
  title: "An article",
  author: "Okafor, Nkem",
  html: "<html><body><article><p>Words.</p></article></body></html>",
  highlights: [{ id: "abc123", category: "claim", text: "A claim worth keeping." }],
  binder: "123e4567-e89b-42d3-a456-426614174000",
  at: "2026-11-23T12:00:00.000Z",
});

describe("parseClip", () => {
  it("accepts a valid clip", () => {
    expect(parseClip(valid())).toEqual(valid());
  });

  it("accepts a selection clip without html", () => {
    const clip = { ...valid(), kind: "selection", text: "Chosen words." };
    delete (clip as Partial<ClipPayload>).html;
    expect(parseClip(clip)?.kind).toBe("selection");
  });

  it("rejects addresses that aren't web pages", () => {
    for (const url of [
      "ftp://example.com/x",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(parseClip({ ...valid(), url })).toBeNull();
    }
  });

  it("rejects a binder that isn't a project id", () => {
    expect(parseClip({ ...valid(), binder: "../../etc" })).toBeNull();
  });

  it("rejects unknown highlight categories and oversized fields", () => {
    expect(
      parseClip({
        ...valid(),
        highlights: [{ id: "a", category: "urgent", text: "x" }],
      }),
    ).toBeNull();
    expect(parseClip({ ...valid(), html: "x".repeat(CLIP_MAX_HTML + 1) })).toBeNull();
    expect(parseClip({ ...valid(), highlights: [] })).not.toBeNull();
  });

  it("rejects anything that isn't an object", () => {
    for (const data of [
      null,
      undefined,
      42,
      "clip",
      [],
      { source: "binder-clipper" },
    ]) {
      expect(parseClip(data)).toBeNull();
    }
  });
});

describe("sameUrl", () => {
  it("sees the same page behind a trailing slash, a fragment and a capital host", () => {
    expect(sameUrl("https://Example.com/a/", "https://example.com/a#top")).toBe(true);
  });

  it("tells different pages apart", () => {
    expect(sameUrl("https://example.com/a", "https://example.com/a?x=1")).toBe(false);
    expect(sameUrl("https://example.com/a", "https://other.example/a")).toBe(false);
    expect(sameUrl("https://example.com/a", "http://example.com/a")).toBe(false);
  });

  it("compares addresses that don't parse as written", () => {
    expect(sameUrl("example", "example")).toBe(true);
    expect(sameUrl("example", "other")).toBe(false);
  });
});

describe("clipHighlights", () => {
  it("keeps the clip's ids where they are free", () => {
    const [highlight] = clipHighlights(valid(), ["zzzzzz"]);
    expect(highlight).toEqual({
      id: "abc123",
      category: "claim",
      page: null,
      text: "A claim worth keeping.",
    });
  });

  it("gives a new id where the clip's is taken", () => {
    const [highlight] = clipHighlights(valid(), ["abc123"]);
    expect(highlight.id).not.toBe("abc123");
    expect(highlight.id).toMatch(/^[a-z0-9]{6}$/);
  });

  it("never hands out the same id twice", () => {
    const clip = {
      ...valid(),
      highlights: [
        { id: "same01", category: "quote" as const, text: "One." },
        { id: "same01", category: "quote" as const, text: "Two." },
      ],
    };
    const ids = clipHighlights(clip).map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });
});
