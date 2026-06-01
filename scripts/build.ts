import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../src/manifest";

const root = path.resolve(import.meta.dir, "..");
const distDir = path.join(root, "dist", "chrome");

async function buildEntry(entrypoint: string, outfile: string, format: "esm" | "iife") {
  const result = await Bun.build({
    entrypoints: [path.join(root, entrypoint)],
    format,
    minify: false,
    outdir: path.dirname(path.join(distDir, outfile)),
    naming: path.basename(outfile),
    sourcemap: "external",
    target: "browser",
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error(`Falha ao compilar ${entrypoint}`);
  }
}

async function copyFile(from: string, to: string) {
  await Bun.write(path.join(distDir, to), Bun.file(path.join(root, from)));
}

await rm(distDir, { force: true, recursive: true });
await mkdir(path.join(distDir, "icons"), { recursive: true });

await writeFile(path.join(distDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

await buildEntry("src/background/index.ts", "background.js", "esm");
await buildEntry("src/content/index.ts", "content.js", "iife");
await buildEntry("src/interceptor/index.ts", "interceptor.js", "iife");
await buildEntry("src/popup/index.ts", "popup.js", "iife");

await copyFile("src/popup/index.html", "popup.html");
await copyFile("src/popup/styles.css", "popup.css");
await copyFile("src/assets/icons/icon16.png", "icons/icon16.png");
await copyFile("src/assets/icons/icon48.png", "icons/icon48.png");
await copyFile("src/assets/icons/icon128.png", "icons/icon128.png");

console.log(`Extensão compilada em ${path.relative(root, distDir)}`);
