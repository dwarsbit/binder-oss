import { describe, expect, it } from "vitest";
import { webAddresses } from "./web-address";

const at = webAddresses("/binder/");

describe("webAddresses", () => {
  it("puts the list and each binder under /binder/projects", () => {
    expect(at.list).toBe("/binder/projects");
    expect(at.of("AbC_123-x")).toBe("/binder/projects/AbC_123-x");
  });

  it("reads the binder from an address", () => {
    expect(at.idIn("/binder/projects/AbC_123-x")).toBe("AbC_123-x");
    expect(at.idIn("/binder/projects/AbC_123-x/")).toBe("AbC_123-x");
    expect(at.idIn("/binder/projects/a%20b")).toBe("a b");
  });

  it("finds none on the list or outside the app", () => {
    expect(at.idIn("/binder/projects")).toBeNull();
    expect(at.idIn("/binder/projects/")).toBeNull();
    expect(at.idIn("/binder/")).toBeNull();
    // The address from before the move: the server redirects it, the app doesn't open it.
    expect(at.idIn("/binder/AbC_123-x")).toBeNull();
    expect(at.idIn("/binder/projects/%E0%A4%A")).toBeNull();
  });

  it("leaves a right address alone", () => {
    expect(at.better("/binder/projects")).toBeNull();
    expect(at.better("/binder/projects/AbC_123-x")).toBeNull();
  });

  it("sends an address from before the move to the new one", () => {
    expect(at.better("/binder/AbC_123-x")).toBe("/binder/projects/AbC_123-x");
    expect(at.better("/binder/AbC_123-x/")).toBe("/binder/projects/AbC_123-x");
  });

  it("sends everything else to the list", () => {
    expect(at.better("/binder/")).toBe("/binder/projects");
    expect(at.better("/binder")).toBe("/binder/projects");
    expect(at.better("/binder/projects/")).toBe("/binder/projects");
    expect(at.better("/binder/some/where")).toBe("/binder/projects");
    expect(at.better("/binder/favicon.svg")).toBe("/binder/projects");
  });
});
