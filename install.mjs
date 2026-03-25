#!/usr/bin/env node

/**
 * Install Herald into ~/.copilot/extensions/herald/
 * Copies extension files (symlinks aren't followed by extension discovery).
 */

import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(homedir(), ".copilot", "extensions", "herald");

mkdirSync(target, { recursive: true });

const files = [
  "extension.mjs",
  "preferences.mjs",
  "context.mjs",
  "herald.mjs",
];

for (const f of files) {
  cpSync(join(__dirname, f), join(target, f));
}

// Copy node_modules (yaml dependency)
if (existsSync(join(__dirname, "node_modules"))) {
  cpSync(join(__dirname, "node_modules"), join(target, "node_modules"), {
    recursive: true,
  });
}

console.log(`Herald installed to ${target}`);
console.log("Restart Copilot CLI to activate.");

if (!existsSync(join(homedir(), ".copilot", "preferences.yaml"))) {
  console.log("");
  console.log("No preferences file found. Copy the sample to get started:");
  console.log(`  cp ${join(__dirname, "sample-preferences.yaml")} ~/.copilot/preferences.yaml`);
}
