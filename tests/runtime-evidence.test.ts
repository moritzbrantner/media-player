import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = new URL("..", import.meta.url).pathname;
const prepareScript = join(repositoryRoot, "scripts/prepare-blue-noise-reference.sh");

function git(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
}

function createCheckout(root, name) {
  const checkout = join(root, name);
  mkdirSync(join(checkout, "scripts"), { recursive: true });
  mkdirSync(join(checkout, "profiles/runtime-profiler"), { recursive: true });
  cpSync(join(repositoryRoot, "scripts/profile-blue-noise.ts"), join(checkout, "scripts/profile-blue-noise.ts"));
  cpSync(
    join(repositoryRoot, "profiles/runtime-profiler/blue-noise.json"),
    join(checkout, "profiles/runtime-profiler/blue-noise.json"),
  );
  git(checkout, "init", "--quiet");
  git(checkout, "add", ".");
  git(checkout, "-c", "user.name=test", "-c", "user.email=test@invalid", "commit", "--quiet", "-m", "initial");
  return checkout;
}

test("preparing an already-identical blue-noise reference is a successful no-op", () => {
  const root = mkdtempSync(join(tmpdir(), "media-player-runtime-evidence-"));
  const candidate = createCheckout(root, "candidate");
  const reference = createCheckout(root, "reference");
  const originalHead = git(reference, "rev-parse", "HEAD");

  execFileSync(prepareScript, [candidate, reference]);

  assert.equal(git(reference, "rev-parse", "HEAD"), originalHead);
  assert.equal(git(reference, "status", "--porcelain"), "");
});

test("preparing an older reference commits the candidate workload once", () => {
  const root = mkdtempSync(join(tmpdir(), "media-player-runtime-evidence-"));
  const candidate = createCheckout(root, "candidate");
  const reference = createCheckout(root, "reference");
  writeFileSync(join(reference, "profiles/runtime-profiler/blue-noise.json"), "{}\n");
  git(reference, "add", ".");
  git(reference, "-c", "user.name=test", "-c", "user.email=test@invalid", "commit", "--quiet", "-m", "older workload");
  const originalHead = git(reference, "rev-parse", "HEAD");

  execFileSync(prepareScript, [candidate, reference]);
  const preparedHead = git(reference, "rev-parse", "HEAD");
  execFileSync(prepareScript, [candidate, reference]);

  assert.notEqual(preparedHead, originalHead);
  assert.equal(git(reference, "rev-parse", "HEAD"), preparedHead);
  assert.equal(git(reference, "status", "--porcelain"), "");
});
