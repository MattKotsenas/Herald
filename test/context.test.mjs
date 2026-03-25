import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { matchesContext, getMatchingPreferences } from "../context.mjs";

const FIXTURE_DIR = join(import.meta.dirname, ".fixtures-ctx");

function setupFixture(files = []) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const f of files) {
    const dir = join(FIXTURE_DIR, f, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(FIXTURE_DIR, f), "", "utf-8");
  }
}

describe("matchesContext", () => {
  afterEach(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("returns true when no when block (always-on)", async () => {
    const result = await matchesContext({}, FIXTURE_DIR);
    assert.equal(result, true);
  });

  it("returns true when when is undefined", async () => {
    const result = await matchesContext(undefined, FIXTURE_DIR);
    assert.equal(result, true);
  });

  it("matches cwdContains (case-insensitive)", async () => {
    const result = await matchesContext(
      { cwdContains: ".fixtures-ctx" },
      FIXTURE_DIR,
    );
    assert.equal(result, true);
  });

  it("rejects cwdContains when not found", async () => {
    const result = await matchesContext(
      { cwdContains: "nonexistent-path" },
      FIXTURE_DIR,
    );
    assert.equal(result, false);
  });

  it("matches fileExists with exact filename", async () => {
    setupFixture(["package.json"]);
    const result = await matchesContext(
      { fileExists: "package.json" },
      FIXTURE_DIR,
    );
    assert.equal(result, true);
  });

  it("rejects fileExists when file missing", async () => {
    setupFixture([]);
    const result = await matchesContext(
      { fileExists: "package.json" },
      FIXTURE_DIR,
    );
    assert.equal(result, false);
  });

  it("matches fileExists with glob pattern", async () => {
    setupFixture(["src/MyApp.csproj"]);
    const result = await matchesContext(
      { fileExists: "**/*.csproj" },
      FIXTURE_DIR,
    );
    assert.equal(result, true);
  });

  it("rejects fileExists glob when no match", async () => {
    setupFixture(["src/index.js"]);
    const result = await matchesContext(
      { fileExists: "**/*.csproj" },
      FIXTURE_DIR,
    );
    assert.equal(result, false);
  });

  it("ANDs multiple conditions", async () => {
    setupFixture(["package.json"]);
    const result = await matchesContext(
      { cwdContains: ".fixtures-ctx", fileExists: "package.json" },
      FIXTURE_DIR,
    );
    assert.equal(result, true);
  });

  it("fails AND when one condition fails", async () => {
    setupFixture(["package.json"]);
    const result = await matchesContext(
      { cwdContains: "nonexistent", fileExists: "package.json" },
      FIXTURE_DIR,
    );
    assert.equal(result, false);
  });

  it("returns false for non-string cwdContains", async () => {
    const result = await matchesContext({ cwdContains: 123 }, FIXTURE_DIR);
    assert.equal(result, false);
  });

  it("returns false for non-string fileExists", async () => {
    const result = await matchesContext({ fileExists: true }, FIXTURE_DIR);
    assert.equal(result, false);
  });

  it("returns false for non-string remote", async () => {
    const result = await matchesContext({ remote: 42 }, FIXTURE_DIR);
    assert.equal(result, false);
  });
});

describe("getMatchingPreferences", () => {
  afterEach(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("returns all always-on preferences", async () => {
    const prefs = [
      { content: "Always on 1" },
      { content: "Always on 2" },
    ];
    const result = await getMatchingPreferences(prefs, FIXTURE_DIR);
    assert.equal(result.length, 2);
  });

  it("filters out non-matching preferences", async () => {
    setupFixture([]);
    const prefs = [
      { content: "Always on" },
      { when: { cwdContains: "nonexistent" }, content: "Should not match" },
    ];
    const result = await getMatchingPreferences(prefs, FIXTURE_DIR);
    assert.equal(result.length, 1);
    assert.equal(result[0].content, "Always on");
  });

  it("includes matching conditional preferences", async () => {
    setupFixture(["package.json"]);
    const prefs = [
      { content: "Always on" },
      { when: { fileExists: "package.json" }, content: "JS project" },
    ];
    const result = await getMatchingPreferences(prefs, FIXTURE_DIR);
    assert.equal(result.length, 2);
  });
});
