import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // The web build is served by the Scholarkit server under /binder.
  base: mode === "web" ? "/binder/" : "/",
  build: { outDir: mode === "web" ? "dist-web" : "dist" },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  // The desktop app loads the dev server from a fixed port, next to
  // Cursive's 1430, and its Rust errors stay on screen.
  clearScreen: false,
  server: {
    port: 1440,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
    // `pnpm dev:web` runs the web build against a Scholarkit server on
    // this computer (`pnpm dev` in apps/api).
    proxy:
      mode === "web"
        ? {
            "/api": {
              target: process.env.BINDER_SERVER ?? "http://localhost:4000",
              ws: true,
            },
          }
        : undefined,
  },
}));
