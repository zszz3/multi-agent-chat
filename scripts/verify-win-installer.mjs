import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const artifactBase = `${packageJson.productName}-${packageJson.version}-x64-setup.exe`;
const installerPath = path.join(repoRoot, "dist", artifactBase);
const blockMapPath = `${installerPath}.blockmap`;

const installer = await stat(installerPath);
if (!installer.isFile() || installer.size < 1024 * 1024) {
  throw new Error(`Windows installer is missing or unexpectedly small: ${installer.size} bytes`);
}

const header = Buffer.alloc(2);
const handle = await open(installerPath, "r");
try {
  await handle.read(header, 0, header.length, 0);
} finally {
  await handle.close();
}
if (header[0] !== 0x4d || header[1] !== 0x5a) {
  throw new Error("Windows installer does not have an MZ executable header.");
}

const blockMap = await stat(blockMapPath);
if (!blockMap.isFile() || blockMap.size === 0) {
  throw new Error("Windows installer block map is missing or empty.");
}

console.log(`Verified Windows installer at ${installerPath}.`);
