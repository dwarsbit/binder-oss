import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  newDoc,
  readAssets,
  readPages,
  writeDocPage,
  type PageChange,
} from "@scholarkit/editor/lib/project-doc";
import type { Connect } from "@scholarkit/editor/lib/sync";
import type { Body } from "@scholarkit/editor/lib/account";
import { BinderServer } from "./server";
import { memoryFiles, serverStore } from "./server-store";

/** A server's document that every connected window's document follows, and its uploads. */
function hub(writable = true) {
  const remote = newDoc();
  const uploads: Array<{ path: string; type?: string }> = [];
  const connect: Connect = async (_id, doc) => {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
    const up = (update: Uint8Array, origin: unknown) => {
      if (origin !== "hub") Y.applyUpdate(remote, update, doc);
    };
    const down = (update: Uint8Array, origin: unknown) => {
      if (origin !== doc) Y.applyUpdate(doc, update, "hub");
    };
    doc.on("update", up);
    remote.on("update", down);
    return {
      unsynced: () => 0,
      onUnsynced: () => {},
      close: () => {
        doc.off("update", up);
        remote.off("update", down);
      },
    };
  };
  const server = new BinderServer(async (method, path, body?: Body) => {
    if (method === "PUT") {
      uploads.push({ path, type: body && "bytes" in body ? body.type : undefined });
      return { status: 204, body: "" };
    }
    return {
      status: 200,
      body: JSON.stringify({ id: "b1", name: "Thesis", writable, role: "owner" }),
    };
  });
  const local = memoryFiles();
  return {
    remote,
    uploads,
    open: () => serverStore(server, "b1", { connect, local }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("serverStore", () => {
  it("loads the account's binder and writes changes to its document", async () => {
    const { remote, open } = hub();
    writeDocPage(remote, "binder.md", "---\nbinder: 1\n---\n");
    const store = open();
    expect(store.place).toBe("account");
    const binder = await store.load();
    expect(binder).toEqual({
      name: "Thesis",
      folders: [],
      files: [],
      pages: { "binder.md": "---\nbinder: 1\n---\n" },
    });

    await store.writePage("items/Screen or paper.md", "# Screen or paper\n");
    await store.rename("items/Screen or paper.md", "items/Paper.md");
    expect(Object.keys(readPages(remote)).sort()).toEqual([
      "binder.md",
      "items/Paper.md",
    ]);
    await store.remove("items");
    expect(Object.keys(readPages(remote))).toEqual(["binder.md"]);
  });

  it("tells of changes from another window, and not of its own", async () => {
    const { open } = hub();
    const mine = open();
    const theirs = open();
    await mine.load();
    await theirs.load();
    const heard: PageChange[][] = [];
    mine.subscribe!((changes) => heard.push(changes));

    await mine.writePage("items/a.md", "A\n");
    expect(heard).toEqual([]);
    await theirs.writePage("items/a.md", "A, from the other tab\n");
    expect(heard).toEqual([
      [{ path: "items/a.md", base: "A\n", text: "A, from the other tab\n" }],
    ]);
  });

  it("uploads a file, names it in the document and knows its checksum", async () => {
    const { remote, uploads, open } = hub();
    const store = open();
    await store.load();
    const files: string[][] = [];
    const other = open();
    await other.load();
    other.onFiles!((list) => files.push(list));

    await store.writeFile(
      "items/Paper.pdf",
      new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    );
    const ref = readAssets(remote)["items/Paper.pdf"];
    expect(ref).toMatchObject({ size: 8, type: "application/pdf" });
    expect(uploads).toEqual([
      { path: `/api/projects/b1/assets/${ref.hash}`, type: "application/pdf" },
    ]);
    expect(await store.fileHashes!()).toEqual({ "items/Paper.pdf": ref.hash });
    expect(await store.fileUrl("items/Paper.pdf")).toBe(
      `/api/projects/b1/assets/${ref.hash}`,
    );
    // Read back without asking the server: the bytes were just sent.
    expect(new TextDecoder().decode((await store.readBytes("items/Paper.pdf"))!)).toBe(
      "%PDF-1.4",
    );
    expect(files).toEqual([["items/Paper.pdf"]]);
  });

  it("keeps Binder's own files in this browser, not in the account", async () => {
    const { remote, uploads, open } = hub();
    const store = open();
    await store.load();
    await store.writeFile(".binder/text.json", new Blob(['{"files":{}}']));
    expect(uploads).toEqual([]);
    expect(readAssets(remote)).toEqual({});
    expect(
      new TextDecoder().decode((await store.readBytes(".binder/text.json"))!),
    ).toBe('{"files":{}}');
  });

  it("fetches a link through the server, and saves its PDF without fetching again", async () => {
    const { remote, open } = hub();
    const store = open();
    await store.load();
    const fetchMock = vi.fn(
      async () =>
        new Response("%PDF-1.4", {
          headers: {
            "content-type": "application/pdf",
            "x-fetched-url": "https://example.org/paper.pdf",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const found = await store.fetchWeb!("https://doi.org/10.1000/xyz123");
    expect(found).toEqual({
      url: "https://example.org/paper.pdf",
      contentType: "application/pdf",
      html: "",
    });
    await store.download!("https://example.org/paper.pdf", "items/Paper.pdf");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readAssets(remote)["items/Paper.pdf"]).toMatchObject({
      type: "application/pdf",
    });
  });

  it("gives a page's HTML, and the server's message when it can't", async () => {
    const { open } = hub();
    const store = open();
    await store.load();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<h1>Where students read</h1>", {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
      ),
    );
    expect((await store.fetchWeb!("https://example.org/survey")).html).toBe(
      "<h1>Where students read</h1>",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "address_not_allowed",
              message: "Only addresses on the public internet can be fetched.",
            }),
            { status: 400 },
          ),
      ),
    );
    await expect(store.fetchWeb!("http://10.0.0.1/")).rejects.toThrow(
      "Only addresses on the public internet can be fetched.",
    );
  });
});
