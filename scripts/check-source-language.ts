import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["web", "scripts", "tests"];
const javascriptExtensions = new Set([".js", ".mjs", ".cjs"]);
const violations = [];

async function scan(relativeDirectory) {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);
  for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await scan(relativePath);
      continue;
    }
    if (javascriptExtensions.has(path.extname(entry.name))) {
      violations.push(relativePath);
    }
  }
}

for (const sourceRoot of sourceRoots) {
  await scan(sourceRoot);
}

if (violations.length > 0) {
  throw new Error(`JavaScript source is not allowed; use TypeScript instead:\n${violations.join("\n")}`);
}

console.log("Source language check passed: no JavaScript source files.");
