import { readFileSync, existsSync } from "node:fs";
import { parse } from "yaml";

/**
 * Load preferences from a YAML file.
 * Returns an array of { content, when? } objects.
 * Returns [] if the file doesn't exist, is malformed, or has no preferences key.
 *
 * @param {string} filePath - Absolute path to preferences.yaml
 * @returns {Array<{ content: string, when?: { remote?: string, fileExists?: string, cwdContains?: string } }>}
 */
export function loadPreferences(filePath) {
  if (!existsSync(filePath)) return [];

  let raw;
  try {
    raw = parse(readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }

  if (!raw || !Array.isArray(raw.preferences)) return [];

  return raw.preferences
    .filter((entry) => typeof entry?.content === "string")
    .map((entry) => ({
      content: entry.content,
      ...(entry.when ? { when: entry.when } : {}),
    }));
}
