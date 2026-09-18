import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.join(import.meta.dirname, "src"),
      // pdf.js ships a browser build and a legacy build; only the latter runs
      // under Node, where the end-to-end test drives the same production
      // modules the browser does. The app itself always gets the browser build.
      "pdfjs-dist": path.join(import.meta.dirname, "node_modules/pdfjs-dist/legacy/build/pdf.mjs"),
    },
  },
});
