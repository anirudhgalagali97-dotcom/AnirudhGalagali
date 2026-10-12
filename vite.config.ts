import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages project URLs and any static host.
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 700 },
});
