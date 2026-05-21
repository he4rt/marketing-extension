#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'interceptor.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

const scriptFiles = [
  'background.js',
  'content.js',
  'interceptor.js',
  'popup.js'
];

function ok(message) {
  console.log(`ok - ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function assertFileExists(relativePath) {
  await access(path.join(root, relativePath), constants.R_OK);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function assertIncludesAll(actual, expected, label) {
  for (const value of expected) {
    if (!actual.includes(value)) {
      fail(`${label} is missing ${value}`);
    }
  }
}

async function validateRequiredFiles() {
  for (const file of requiredFiles) {
    await assertFileExists(file);
  }
  ok('required extension files exist');
}

async function validateManifest() {
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
  if (manifest.name !== 'He4rt Analytics') fail('manifest name must be He4rt Analytics');
  if (manifest.background?.service_worker !== 'background.js') fail('background service worker must be background.js');

  assertIncludesAll(manifest.permissions || [], ['storage'], 'permissions');
  assertIncludesAll(manifest.host_permissions || [], ['https://x.com/*', 'https://twitter.com/*'], 'host_permissions');

  const contentScripts = manifest.content_scripts || [];
  const mainWorld = contentScripts.find((script) => (script.js || []).includes('interceptor.js'));
  const isolatedWorld = contentScripts.find((script) => (script.js || []).includes('content.js'));

  if (!mainWorld) fail('content_scripts must include interceptor.js');
  if (!isolatedWorld) fail('content_scripts must include content.js');
  if (mainWorld.world !== 'MAIN') fail('interceptor.js must run in MAIN world');
  if (isolatedWorld.world !== 'ISOLATED') fail('content.js must run in ISOLATED world');
  if (mainWorld.run_at !== 'document_start') fail('interceptor.js must run at document_start');
  if (isolatedWorld.run_at !== 'document_start') fail('content.js must run at document_start');

  for (const script of [mainWorld, isolatedWorld]) {
    assertIncludesAll(script.matches || [], ['https://x.com/*', 'https://twitter.com/*'], `${script.js.join(',')} matches`);
  }

  if (manifest.action?.default_popup !== 'popup.html') fail('default popup must be popup.html');

  for (const iconPath of Object.values(manifest.icons || {})) {
    await assertFileExists(iconPath);
  }
  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    await assertFileExists(iconPath);
  }

  ok('manifest wiring is valid');
}

async function validateSyntax() {
  for (const file of scriptFiles) {
    await run(process.execPath, ['--check', file]);
  }
  ok('extension scripts parse');
}

async function runTests() {
  await run(process.execPath, ['--test']);
  ok('fixture tests pass');
}

try {
  await validateRequiredFiles();
  await validateManifest();
  await validateSyntax();
  await runTests();
  console.log('Extension validation complete.');
} catch (error) {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
}
