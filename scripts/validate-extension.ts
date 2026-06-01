import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const extensionDir = path.join(root, "dist", "chrome");

const requiredFiles = [
  "manifest.json",
  "background.js",
  "content.js",
  "interceptor.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

const scriptFiles = ["background.js", "content.js", "interceptor.js", "popup.js"];

function ok(message: string) {
  console.log(`ok - ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

async function assertFileExists(relativePath: string) {
  await access(path.join(extensionDir, relativePath), constants.R_OK);
}

function run(command: string, args: string[], cwd = root) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function assertIncludesAll(actual: unknown[] | undefined, expected: string[], label: string) {
  for (const value of expected) {
    if (!actual?.includes(value)) {
      fail(`${label} deve conter ${value}`);
    }
  }
}

async function validateRequiredFiles() {
  for (const file of requiredFiles) {
    await assertFileExists(file);
  }
  ok("arquivos obrigatórios da extensão existem");
}

async function validateManifest() {
  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  if (manifest.manifest_version !== 3) fail("manifest_version deve ser 3");
  if (manifest.name !== "He4rt Analytics") fail("manifest name deve ser He4rt Analytics");
  if (manifest.background?.service_worker !== "background.js") {
    fail("background service worker deve ser background.js");
  }
  if (manifest.background?.type !== "module") {
    fail("background deve ser emitido como módulo MV3");
  }

  assertIncludesAll(manifest.permissions, ["storage", "unlimitedStorage"], "permissions");
  assertIncludesAll(
    manifest.host_permissions,
    ["https://x.com/*", "https://twitter.com/*", "https://www.instagram.com/*"],
    "host_permissions",
  );

  const contentScripts = manifest.content_scripts || [];
  const mainWorld = contentScripts.find((script: { js?: string[] }) =>
    script.js?.includes("interceptor.js"),
  );
  const isolatedWorld = contentScripts.find((script: { js?: string[] }) =>
    script.js?.includes("content.js"),
  );

  if (!mainWorld) fail("content_scripts deve incluir interceptor.js");
  if (!isolatedWorld) fail("content_scripts deve incluir content.js");
  if (mainWorld.world !== "MAIN") fail("interceptor.js deve rodar no mundo MAIN");
  if (isolatedWorld.world !== "ISOLATED") fail("content.js deve rodar no mundo ISOLATED");
  if (mainWorld.run_at !== "document_start") fail("interceptor.js deve rodar em document_start");
  if (isolatedWorld.run_at !== "document_start") fail("content.js deve rodar em document_start");

  for (const script of [mainWorld, isolatedWorld]) {
    assertIncludesAll(
      script.matches,
      ["https://x.com/*", "https://twitter.com/*", "https://www.instagram.com/*"],
      `${script.js.join(",")} matches`,
    );
  }

  if (manifest.action?.default_popup !== "popup.html") fail("default popup deve ser popup.html");

  for (const iconPath of Object.values(manifest.icons || {})) {
    await assertFileExists(String(iconPath));
  }
  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    await assertFileExists(String(iconPath));
  }

  ok("manifest final é válido");
}

async function validateSyntax() {
  for (const file of scriptFiles) {
    await run("node", ["--check", file], extensionDir);
  }
  ok("scripts compilados fazem parse");
}

async function runTests() {
  await run("bun", ["test"]);
  ok("testes passam");
}

try {
  await validateRequiredFiles();
  await validateManifest();
  await validateSyntax();
  await runTests();
  console.log("Validação da extensão concluída.");
} catch (error) {
  console.error(`Validação falhou: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
