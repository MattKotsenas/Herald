import { existsSync, globSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Cache git remotes per cwd to avoid repeated subprocess calls
const remoteCache = new Map();

/**
 * Get git remote URLs for a directory. Cached per cwd.
 * @param {string} cwd
 * @returns {string} Raw output of `git remote -v`, or empty string on error
 */
function getRemotes(cwd) {
  if (remoteCache.has(cwd)) return remoteCache.get(cwd);

  let result = "";
  try {
    result = execFileSync("git", ["remote", "-v"], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Not a git repo or git not available
  }
  remoteCache.set(cwd, result);
  return result;
}

/**
 * Clear the remote cache (e.g., when cwd changes).
 */
export function clearRemoteCache() {
  remoteCache.clear();
}

/**
 * Check if a single `when` block matches the given cwd.
 * All conditions in the block must match (AND logic).
 *
 * @param {object|undefined} when - The when conditions
 * @param {string} cwd - Current working directory
 * @returns {Promise<boolean>}
 */
export async function matchesContext(when, cwd) {
  if (!when || Object.keys(when).length === 0) return true;

  if (when.cwdContains) {
    if (typeof when.cwdContains !== "string") return false;
    if (!cwd.toLowerCase().includes(when.cwdContains.toLowerCase())) {
      return false;
    }
  }

  if (when.fileExists) {
    if (typeof when.fileExists !== "string") return false;
    const pattern = when.fileExists;
    // Simple filename (no glob chars) - use existsSync for speed
    if (!/[*?{[]/.test(pattern)) {
      if (!existsSync(join(cwd, pattern))) return false;
    } else {
      // Glob pattern - use fs.globSync
      const matches = globSync(pattern, { cwd });
      if (matches.length === 0) return false;
    }
  }

  if (when.remote) {
    if (typeof when.remote !== "string") return false;
    const remotes = getRemotes(cwd);
    if (!remotes.toLowerCase().includes(when.remote.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * Filter preferences to only those matching the current context.
 *
 * @param {Array<{ content: string, when?: object }>} preferences
 * @param {string} cwd
 * @returns {Promise<Array<{ content: string }>>}
 */
export async function getMatchingPreferences(preferences, cwd) {
  const results = [];
  for (const pref of preferences) {
    if (await matchesContext(pref.when, cwd)) {
      results.push(pref);
    }
  }
  return results;
}
