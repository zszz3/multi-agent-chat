import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const repoRoot = dirname(fileURLToPath(import.meta.url));

function copyBundledDirPlugin(name: string, relPath: string): Plugin {
  return {
    name,
    closeBundle() {
      const source = resolve(repoRoot, relPath);
      const target = resolve(repoRoot, relPath.replace("src/shared", "out/shared"));
      rmSync(target, { recursive: true, force: true });
      cpSync(source, target, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [
      copyBundledDirPlugin("copy-bundled-skills", "src/shared/bundled-skills"),
      copyBundledDirPlugin("copy-bundled-workflows", "src/shared/bundled-workflows"),
    ],
    build: {
      outDir: resolve(repoRoot, "out/main"),
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  preload: {
    build: {
      outDir: resolve(repoRoot, "out/preload"),
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  renderer: {
    root: resolve(repoRoot, "src/renderer"),
    plugins: [react()],
    build: {
      outDir: resolve(repoRoot, "out/renderer"),
    },
  },
});
