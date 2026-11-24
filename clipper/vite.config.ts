import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Builds the clipper's extension pages (popup, options) into
 * ../dist-clipper. The content script and the background worker are classic
 * scripts, so they get their own builds in vite.config.content.ts and
 * vite.config.background.ts. scripts/pack.mjs then writes the manifests.
 */

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  build: {
    outDir: fileURLToPath(new URL("../dist-clipper", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        popup: `${root}popup.html`,
        options: `${root}options.html`,
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
