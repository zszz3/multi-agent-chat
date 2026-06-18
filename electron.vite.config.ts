import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const repoRoot = dirname(fileURLToPath(import.meta.url));

function copyBundledSkillsPlugin(): Plugin {
  return {
    name: "copy-bundled-skills",
    closeBundle() {
      const source = resolve(repoRoot, "src/shared/bundled-skills");
      const target = resolve(repoRoot, "out/shared/bundled-skills");
      rmSync(target, { recursive: true, force: true });
      cpSync(source, target, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [copyBundledSkillsPlugin()],
    build: {
      outDir: "out/main",
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: {
      outDir: "../../out/renderer",
    },
  },
});
