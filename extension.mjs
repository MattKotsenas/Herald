import { join } from "node:path";
import { homedir } from "node:os";
import { joinSession } from "@github/copilot-sdk/extension";
import { loadPreferences } from "./preferences.mjs";
import { getMatchingPreferences, clearRemoteCache } from "./context.mjs";
import { shouldInject, buildInjection } from "./herald.mjs";

const PREFS_PATH = join(homedir(), ".copilot", "preferences.yaml");

const state = { injected: false, lastCwd: null };

const session = await joinSession({
  hooks: {
    onUserPromptSubmitted: async (input) => {
      const cwd = input.cwd || process.cwd();

      if (!shouldInject(state, cwd)) return;

      // cwd changed - clear cached remotes
      clearRemoteCache();

      const prefs = loadPreferences(PREFS_PATH);
      if (prefs.length === 0) return;

      const matched = await getMatchingPreferences(prefs, cwd);
      const injection = buildInjection(matched);
      if (!injection) return;

      state.injected = true;

      await session.log(
        `Herald announces: ${matched.length} preference(s) for this workspace`,
        { ephemeral: true },
      );

      // Return both: additionalContext for when the bug is fixed,
      // modifiedPrompt as the working fallback
      return {
        additionalContext: injection,
        modifiedPrompt: input.prompt + injection,
      };
    },
  },
  tools: [],
});

await session.log("Herald standing by", { ephemeral: true });
