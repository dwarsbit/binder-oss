import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Builds the background worker into ../dist-clipper/background.js as a
 * classic script, so the same file runs as Chrome's service worker and as
 * Firefox's background script. Runs after the main build, which empties the
 * output folder.
 */

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  build: {
    outDir: fileURLToPath(new URL("../dist-clipper", import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: `${root}src/background.ts`,
      formats: ["iife"],
      name: "binderClipperBackground",
      fileName: () => "background.js",
    },
  },
});
