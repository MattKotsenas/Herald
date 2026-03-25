import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadPreferences } from "../preferences.mjs";

const FIXTURE_DIR = join(import.meta.dirname, ".fixtures-prefs");
const FIXTURE_FILE = join(FIXTURE_DIR, "preferences.yaml");

function writeFixture(content) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(FIXTURE_FILE, content, "utf-8");
}

describe("loadPreferences", () => {
  afterEach(() => {
    rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("returns empty array when file does not exist", () => {
    const prefs = loadPreferences("/nonexistent/path/preferences.yaml");
    assert.deepStrictEqual(prefs, []);
  });

  it("parses a simple always-on preference", () => {
    writeFixture(`
preferences:
  - content: |
      Use conventional commits.
`);
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].content.trim(), "Use conventional commits.");
    assert.equal(prefs[0].when, undefined);
  });

  it("parses a preference with when.remote", () => {
    writeFixture(`
preferences:
  - when:
      remote: dev.azure.com
    content: |
      Use users/alice/ branch prefix.
`);
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].when.remote, "dev.azure.com");
    assert.equal(prefs[0].content.trim(), "Use users/alice/ branch prefix.");
  });

  it("parses a preference with when.fileExists", () => {
    writeFixture(`
preferences:
  - when:
      fileExists: "*.csproj"
    content: |
      This is a .NET project.
`);
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].when.fileExists, "*.csproj");
  });

  it("parses a preference with when.cwdContains", () => {
    writeFixture(`
preferences:
  - when:
      cwdContains: my-project
    content: |
      Project-specific rule.
`);
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].when.cwdContains, "my-project");
  });

  it("parses multiple preferences", () => {
    writeFixture(`
preferences:
  - content: Always applies.
  - when:
      remote: github.com
    content: GitHub only.
  - when:
      fileExists: package.json
      cwdContains: frontend
    content: Frontend JS project.
`);
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.equal(prefs.length, 3);
    assert.equal(prefs[2].when.fileExists, "package.json");
    assert.equal(prefs[2].when.cwdContains, "frontend");
  });

  it("returns empty array for malformed YAML", () => {
    writeFixture("not: [valid: yaml: {{{");
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.deepStrictEqual(prefs, []);
  });

  it("returns empty array when preferences key is missing", () => {
    writeFixture("something_else: true");
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.deepStrictEqual(prefs, []);
  });

  it("skips entries without content", () => {
    writeFixture(`
preferences:
  - when:
      remote: github.com
  - content: Valid entry.
`);
    const prefs = loadPreferences(FIXTURE_FILE);
    assert.equal(prefs.length, 1);
    assert.equal(prefs[0].content, "Valid entry.");
  });
});
