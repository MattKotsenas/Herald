/**
 * Herald - core logic for latch-based preference injection.
 *
 * The latch pattern: inject preferences once when cwd changes, then stay
 * silent until the next cwd change. This keeps token usage low while
 * ensuring the agent always knows your preferences for the current workspace.
 */

/**
 * Check if preferences should be injected for this message.
 * Mutates state.lastCwd when cwd changes. Does NOT set state.injected -
 * the caller sets that after successful injection.
 *
 * @param {{ injected: boolean, lastCwd: string|null }} state
 * @param {string} cwd
 * @returns {boolean}
 */
export function shouldInject(state, cwd) {
  if (state.lastCwd !== cwd) {
    state.lastCwd = cwd;
    state.injected = false;
  }
  return !state.injected;
}

/**
 * Build the injection text from matching preferences.
 * Returns null if no preferences matched.
 *
 * @param {Array<{ content: string }>} matchedPrefs
 * @returns {string|null}
 */
export function buildInjection(matchedPrefs) {
  if (matchedPrefs.length === 0) return null;

  const lines = matchedPrefs
    .map((p) => p.content.trim())
    .join("\n");

  return `\n\n[Your preferences for this workspace]:\n${lines}`;
}
