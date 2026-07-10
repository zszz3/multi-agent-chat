import { access } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const requiredPaths = [
  "out/main/index.js",
  "out/preload/index.mjs",
  "out/renderer/index.html",
  "out/shared/bundled-skills",
  "out/shared/bundled-workflows",
];

const missing = [];
for (const relativePath of requiredPaths) {
  try {
    await access(path.join(repoRoot, relativePath));
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length > 0) {
  throw new Error(`Missing package inputs:\n${missing.map((item) => `- ${item}`).join("\n")}`);
}

console.log(`Verified ${requiredPaths.length} package inputs.`);
