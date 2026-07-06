import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve("node_modules", "@anthropic-ai", "claude-code");
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const topLevelEntries = (await readdir(packageRoot, { withFileTypes: true }))
  .map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name))
  .sort();

process.stdout.write("# Claude SDK Surface\n\n");
process.stdout.write("Generated from `node scripts/inspect-claude-sdk.mjs` after installing `@anthropic-ai/claude-code`.\n\n");
process.stdout.write(`- package: ${packageJson.name}@${packageJson.version}\n`);
process.stdout.write(`- type: ${packageJson.type ?? "(none)"}\n`);
process.stdout.write(`- bin.claude: ${packageJson.bin?.claude ?? "(none)"}\n`);
process.stdout.write(`- main: ${packageJson.main ?? "(none)"}\n`);
process.stdout.write(`- exports: ${packageJson.exports ? "present" : "(none)"}\n`);
process.stdout.write("- top-level files:\n");
for (const entry of topLevelEntries) {
  process.stdout.write(`  - ${entry}\n`);
}
