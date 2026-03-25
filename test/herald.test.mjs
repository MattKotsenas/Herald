import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildInjection, shouldInject } from "../herald.mjs";

describe("shouldInject", () => {
  it("returns true on first call", () => {
    const state = { injected: false, lastCwd: null };
    assert.equal(shouldInject(state, "/projects/foo"), true);
  });

  it("returns false on second call with same cwd", () => {
    const state = { injected: false, lastCwd: null };
    shouldInject(state, "/projects/foo");
    state.injected = true;
    assert.equal(shouldInject(state, "/projects/foo"), false);
  });

  it("resets when cwd changes", () => {
    const state = { injected: true, lastCwd: "/projects/foo" };
    assert.equal(shouldInject(state, "/projects/bar"), true);
  });

  it("returns false again after injecting in new cwd", () => {
    const state = { injected: true, lastCwd: "/projects/foo" };
    shouldInject(state, "/projects/bar"); // resets
    state.injected = true;
    assert.equal(shouldInject(state, "/projects/bar"), false);
  });
});

describe("buildInjection", () => {
  it("returns null when no preferences match", () => {
    const result = buildInjection([]);
    assert.equal(result, null);
  });

  it("builds injection text from one preference", () => {
    const result = buildInjection([{ content: "Use conventional commits." }]);
    assert.ok(result.includes("Use conventional commits."));
    assert.ok(result.includes("[Your preferences for this workspace]"));
  });

  it("builds injection text from multiple preferences", () => {
    const result = buildInjection([
      { content: "Rule one." },
      { content: "Rule two.\nWith a second line." },
    ]);
    assert.ok(result.includes("Rule one."));
    assert.ok(result.includes("Rule two."));
    assert.ok(result.includes("With a second line."));
  });

  it("trims content whitespace", () => {
    const result = buildInjection([{ content: "  Padded content.  \n" }]);
    assert.ok(result.includes("Padded content."));
    assert.ok(!result.includes("  Padded"));
  });
});
