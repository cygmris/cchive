import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors out of the entry chunk so the shell paints from a
        // small bundle; the charting and editor stacks ride with the lazy
        // screens that need them (recharts → usage, CodeMirror → config editor)
        // rather than bloating the shared vendor chunk. The app never imports
        // these transitive deps directly, so they stay off the startup path.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const inPkg = (name: string) => id.includes(`node_modules/${name}/`);
          if (["react", "react-dom", "scheduler"].some(inPkg)) {
            return "react";
          }
          // recharts + its charting stack: victory/d3, the redux store it uses
          // internally, and es-toolkit helpers.
          if (
            id.includes("node_modules/d3-") ||
            [
              "recharts",
              "victory-vendor",
              "internmap",
              "decimal.js-light",
              "es-toolkit",
              "tiny-invariant",
              "eventemitter3",
              "react-is",
              "@reduxjs/toolkit",
              "redux",
              "redux-thunk",
              "react-redux",
              "reselect",
              "immer",
            ].some(inPkg)
          ) {
            return "recharts";
          }
          // CodeMirror language grammars: @codemirror/lang-* and their heavy
          // lezer parsers (lang-markdown transitively pulls the html/css/js
          // grammars). Split from the engine so neither chunk crosses 500 kB;
          // the grammars import the engine, never the reverse, so it's acyclic.
          if (
            id.includes("node_modules/@codemirror/lang-") ||
            [
              "@lezer/javascript",
              "@lezer/html",
              "@lezer/css",
              "@lezer/json",
              "@lezer/markdown",
            ].some(inPkg)
          ) {
            return "codemirror-lang";
          }
          // CodeMirror editor engine: @codemirror core, the @uiw wrapper, the
          // lezer primitives, and the low-level helpers.
          if (
            [
              "@codemirror",
              "@uiw",
              "@lezer",
              "@marijn",
              "style-mod",
              "crelt",
              "w3c-keyname",
            ].some(inPkg)
          ) {
            return "codemirror";
          }
          return "vendor";
        },
      },
    },
  },
  // Tauri expects a fixed dev port and should not clear the terminal.
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
});
