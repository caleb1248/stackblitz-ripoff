import { defineConfig } from "vite";

import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";
import rollupVsixPlugin from '@codingame/monaco-vscode-rollup-vsix-plugin';
import inspect from 'vite-plugin-inspect';

import pkg from "./package.json" with { type: "json" };

import * as fs from 'fs';
import * as path from 'path';

const isWindows = process.platform === 'win32'

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
  worker: {
    format: "es"
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

  plugins: [{
    name: 'force-prevent-transform-assets',
    apply: 'serve',
    configureServer(server) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.originalUrl != null) {
            const pathname = new URL(req.originalUrl.replace(/^\//, ""), import.meta.url).pathname
            if (pathname.endsWith('.html')) {
              res.setHeader('Content-Type', 'text/html')
              res.writeHead(200)
              res.write(fs.readFileSync(path.join(isWindows ? pathname.replace(/^\//, "") : pathname)))
              res.end()
            }
          }

          next()
        })
      }
    }
  },{
    // For the *-language-features extensions which use SharedArrayBuffer
    name: 'configure-response-headers',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        next()
      })
    }
  },rollupVsixPlugin(), inspect()]
});
