import { describe, expect, it } from "vitest";
import { firstPdf } from "./free-pdf";

describe("firstPdf", () => {
  it("takes the first link that gives a PDF", async () => {
    const tried: string[] = [];
    const found = await firstPdf(["a", "b", "c"], async (url) => {
      tried.push(url);
      return url === "b" ? { kind: "pdf", url: "https://x.org/b.pdf" } : null;
    });
    expect(found).toBe("https://x.org/b.pdf");
    expect(tried).toEqual(["a", "b"]);
  });

  it("skips a page and a failed download", async () => {
    const found = await firstPdf(["page", "fails", "pdf"], async (url) => {
      if (url === "fails") throw new Error("403");
      return url === "pdf" ? { kind: "pdf", url } : { kind: "page" };
    });
    expect(found).toBe("pdf");
  });

  it("tries three links at most", async () => {
    const tried: string[] = [];
    const found = await firstPdf(["a", "b", "c", "d"], async (url) => {
      tried.push(url);
      return url === "d" ? { kind: "pdf", url } : null;
    });
    expect(found).toBeNull();
    expect(tried).toEqual(["a", "b", "c"]);
  });

  it("finds nothing without links", async () => {
    expect(await firstPdf([], async () => ({ kind: "pdf", url: "x" }))).toBeNull();
  });
});
