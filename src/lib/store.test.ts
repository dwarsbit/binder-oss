import { describe, expect, it, vi } from "vitest";
import { guardWrites, type BinderStore } from "./store";

function fakeStore() {
  const calls: string[] = [];
  const note = (name: string) => (path: string) => {
    calls.push(`${name} ${path}`);
    return Promise.resolve();
  };
  const store = {
    place: "account",
    load: vi.fn(),
    writePage: note("writePage"),
    createFolder: note("createFolder"),
    rename: note("rename"),
    remove: note("remove"),
    writeFile: note("writeFile"),
    download: (_url: string, path: string) => note("download")(path),
    fileUrl: vi.fn(),
    openFile: vi.fn(),
    readBytes: vi.fn(),
  } as unknown as BinderStore;
  return { store, calls };
}

describe("guardWrites", () => {
  it("changes nothing in the binder while it is read-only", async () => {
    const { store, calls } = fakeStore();
    const guarded = guardWrites(store, () => true);
    await guarded.writePage("items/a.md", "x");
    await guarded.createFolder("files");
    await guarded.rename("items/a.md", "items/b.md");
    await guarded.remove("items/a.md");
    await guarded.writeFile("files/a.pdf", new Blob());
    await guarded.download?.("https://example.org/a.pdf", "files/a.pdf");
    expect(calls).toEqual([]);
  });

  it("still writes the app's own files, and everything once it can", async () => {
    const { store, calls } = fakeStore();
    let readOnly = true;
    const guarded = guardWrites(store, () => readOnly);
    await guarded.writeFile(".binder/cache.json", new Blob());
    readOnly = false;
    await guarded.writePage("items/a.md", "x");
    expect(calls).toEqual(["writeFile .binder/cache.json", "writePage items/a.md"]);
  });
});
