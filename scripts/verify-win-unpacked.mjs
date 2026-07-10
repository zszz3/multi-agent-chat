import { stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(repoRoot, "dist", "win-unpacked");
const requiredFiles = [
  "MultiAgentChat.exe",
  "resources/app.asar",
];
const requiredDirectories = [
  "resources/shared/bundled-skills",
  "resources/shared/bundled-workflows",
];

const failures = [];
for (const relativePath of requiredFiles) {
  try {
    const info = await stat(path.join(artifactRoot, relativePath));
    if (!info.isFile()) failures.push(`${relativePath} is not a file`);
  } catch {
    failures.push(`${relativePath} is missing`);
  }
}

for (const relativePath of requiredDirectories) {
  try {
    const info = await stat(path.join(artifactRoot, relativePath));
    if (!info.isDirectory()) failures.push(`${relativePath} is not a directory`);
  } catch {
    failures.push(`${relativePath} is missing`);
  }
}

if (failures.length > 0) {
  throw new Error(`Invalid Windows unpacked artifact:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}

console.log(`Verified Windows unpacked artifact at ${artifactRoot}.`);
