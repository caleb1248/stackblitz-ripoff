import { defineConfig } from "vite";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";
import pkg from "./package.json" with { type: "json" };

const localDependencies = Object.entries(pkg.dependencies)
  .filter(([, version]) => version.startsWith("file:../"))
  .map(([name]) => name);
export default defineConfig({
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    // This is require because vite excludes local dependencies from being optimized
    // Monaco-vscode-api packages are local dependencies and the number of modules makes chrome hang
    include: [
      // add all local dependencies...
      ...localDependencies,
      // and their exports
      "vscode/extensions",
      "vscode/services",
      "vscode/monaco",
      "vscode/localExtensionHost",

      // These 2 lines prevent vite from reloading the whole page when starting a worker (so 2 times in a row after cleaning the vite cache - for the editor then the textmate workers)
      // it's mainly empirical and probably not the best way, fix me if you find a better way
      "vscode-textmate",
      "vscode-oniguruma",
      // "@vscode/vscode-languagedetection",
    ],
    exclude: [],
    esbuildOptions: {
      tsconfig: "./tsconfig.json",
      plugins: [importMetaUrlPlugin],
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: ["../"], // allow to load codicon.ttf from monaco-editor in the parent folder
    },
  },
  resolve: {
    dedupe: ["vscode", ...localDependencies],
  },
});
