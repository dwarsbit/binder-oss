import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Builds the content script into ../dist-clipper/content.js. Content scripts
 * are classic scripts, so this is a separate, IIFE build that runs after the
 * main one (which empties the output folder).
 */

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  build: {
    outDir: fileURLToPath(new URL("../dist-clipper", import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: `${root}src/content.ts`,
      formats: ["iife"],
      name: "binderClipperContent",
      fileName: () => "content.js",
    },
  },
});
