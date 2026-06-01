import { mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const distDir = path.join(root, "dist", "chrome");
const packageDir = path.join(root, "dist", "packages");
const zipPath = path.join(packageDir, "he4rt-analytics-chrome.zip");

await Bun.$`bun run build`;
await mkdir(packageDir, { recursive: true });
await Bun.$`rm -f ${zipPath}`;
await Bun.$`cd ${distDir} && zip -qr ${zipPath} .`;

console.log(`Pacote gerado em ${path.relative(root, zipPath)}`);
