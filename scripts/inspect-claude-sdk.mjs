import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve("node_modules", "@anthropic-ai", "claude-code");
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const topLevelEntries = (await readdir(packageRoot, { withFileTypes: true }))
  .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  .sort();
const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
const verifiedProgrammaticExportSurface =
  packageJson.exports !== undefined || packageJson.main !== undefined ? "present" : "not verified";

function writeList(title, items) {
  process.stdout.write(`- ${title}:\n`);
  if (items.length === 0) {
    process.stdout.write("  - (none)\n");
    return;
  }
  for (const item of items) {
    process.stdout.write(`  - ${item}\n`);
  }
}

process.stdout.write("# Claude SDK Surface\n\n");
process.stdout.write("Generated from `node scripts/inspect-claude-sdk.mjs` after installing `@anthropic-ai/claude-code`.\n\n");
process.stdout.write(`- package name: ${packageJson.name}\n`);
process.stdout.write(`- package version: ${packageJson.version}\n`);
process.stdout.write(`- type: ${packageJson.type ?? "(none)"}\n`);
process.stdout.write(`- bin.claude: ${packageJson.bin?.claude ?? "(none)"}\n`);
process.stdout.write(`- main: ${packageJson.main ?? "(none)"}\n`);
process.stdout.write(`- exports: ${packageJson.exports === undefined ? "(none)" : JSON.stringify(packageJson.exports)}\n`);
process.stdout.write(`- verified programmatic export surface: ${verifiedProgrammaticExportSurface}\n`);
writeList("files[] from package.json", packageFiles);
writeList("top-level files", topLevelEntries);
