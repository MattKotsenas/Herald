# Herald

**Contextual preferences for Copilot CLI.** Your agent knows your conventions without being told every time.

Herald is a [Copilot CLI extension](https://docs.github.com/en/copilot/how-tos/copilot-cli) that reads
your preferences from a YAML file and injects them into the conversation when they're relevant to
the current workspace. You write the preferences once; Herald announces them at the right time.

## Why Herald exists

AI coding agents start every session with amnesia. They don't know your branch naming conventions,
your preferred test framework, or which projects need special handling. The existing options
each have tradeoffs:

- **Instruction files** (`copilot-instructions.md`, `AGENTS.md`) are eagerly loaded on every turn, competing for the model's limited attention budget with your behavioral rules. Research shows instruction-following degrades with prompt length ([1], [2]).
- **Per-repo files** only apply to one repo and don't carry cross-repo preferences.
- **Auto-memory tools** learn automatically but recall is unpredictable - the agent decides what's relevant, not you.
- **Multi-agent frameworks** compound knowledge across sessions but at high token cost, with [marginal quality gains](https://openreview.net/forum?id=i95lcR2GN5) for same-model setups.

The core issue is **attention, not tokens.** Your behavioral rules ("test before committing",
"match existing style") deserve prompt attention. Your branch naming convention probably
doesn't - until you're actually creating a branch.

Herald solves this with **lazy, contextual injection**: preferences are loaded once when you
enter a workspace and stay out of the way after that.

## How Herald compares

| Approach | Injection | Context-aware | Learning | Attention cost |
|----------|-----------|:---:|:---:|---|
| Instruction files | Every turn, everything | No | No | High |
| **Herald** | Once per workspace, matching subset | Yes | No (manual) | Low |
| Auto-memory tools | Every turn, retrieved subset | Partially | Yes | Variable |
| Multi-agent frameworks | Per-agent spawn, full charter | No | Accumulated | High |

**Use Herald** when your preferences are stable, few (tens not thousands), contextual, and
authored by you. **Use an auto-memory tool** when you want the agent to learn from corrections
automatically or you have hundreds of project-specific facts. **Use instruction files** when the
rule is universal and behavioral. **Use nothing** when the information is already in the repo.

## How it works

Herald hooks into `onUserPromptSubmitted`. On your first message in each workspace, it:

1. Reads `~/.copilot/preferences.yaml`
2. Evaluates which preferences match the current `cwd` (git remotes, file patterns, path)
3. Appends matching preferences to your prompt via `modifiedPrompt`
4. Latches - no further injection until you change directories

```
Session start
  └─ First prompt in ~/projects/my-app
       └─ Herald checks: git remote? files? cwd?
            └─ Matches 3 of 5 preferences
                 └─ Appends to prompt: "[Your preferences for this workspace]: ..."
                      └─ Latch ON - silent until cwd changes

  └─ Second prompt (same cwd)
       └─ Herald: already injected, skip

  └─ /cwd ~/projects/other-project
       └─ Latch RESET
            └─ Next prompt triggers fresh evaluation
```

### Why `modifiedPrompt`, not `additionalContext`?

The extension SDK supports both, but `additionalContext` is currently ignored by the CLI
runtime ([copilot-sdk#775](https://github.com/github/copilot-sdk/issues/775)). Herald returns
both fields so that when the bug is fixed, the transition to invisible injection is automatic.

## Installation

### Prerequisites

- [Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli) v1.0.11+
- Node.js 22.5+

### Install

```bash
git clone https://github.com/MattKotsenas/Herald.git
cd Herald
npm install
node install.mjs
```

This copies Herald into `~/.copilot/extensions/herald/`. Restart Copilot CLI to activate.

> **Note:** Copilot CLI extension discovery doesn't follow symlinks. The install script copies
> files directly. Re-run `node install.mjs` after updating Herald.

### Create your preferences

```bash
cp sample-preferences.yaml ~/.copilot/preferences.yaml
```

Then edit `~/.copilot/preferences.yaml` to match your workflow.

## Preferences format

```yaml
preferences:
  # Always-on (no conditions)
  - content: |
      When writing commit messages, use conventional commits format.

  # Conditional on git remote URL
  - when:
      remote: dev.azure.com
    content: |
      Use branch prefix `users/aturing/` for new branches.

  # Conditional on git remote URL
  - when:
      remote: github.com
    content: |
      Use branch prefixes: `bugfix/`, `feature/`, or `refactor/`.

  # Conditional on file existence (supports glob patterns)
  - when:
      fileExists: "**/*.csproj"
    content: |
      This is a .NET project.
      Use `dotnet add package` rather than editing XML directly.

  # Conditional on working directory path
  - when:
      cwdContains: my-internal-project
    content: |
      This is an internal project. Follow internal coding standards.

  # Multiple conditions (AND logic - all must match)
  - when:
      remote: github.com
      fileExists: package.json
    content: |
      Run `npm test` before committing.
```

### Context matchers

| Matcher | How it's evaluated | Performance |
|---------|-------------------|-------------|
| `remote: <str>` | `git remote -v` output contains `<str>` (case-insensitive) | Cached per cwd |
| `fileExists: <pattern>` | Exact filename: `fs.existsSync`. Glob (`*`, `**`): `fs.globSync` | Exact is fast. Globs like `**/*.csproj` traverse the tree - use judiciously. |
| `cwdContains: <str>` | `cwd.includes(str)` (case-insensitive) | Instant |

Multiple matchers in one `when` block are AND-ed. All must match for the preference to apply.

### What goes in preferences vs. instructions?

| `copilot-instructions.md` | `preferences.yaml` |
|----------------------------|--------------------|
| Behavioral rules: "test before committing" | Workflow facts: "use `users/me/` branch prefix on ADO" |
| Universal across all projects | Varies by project or platform |
| How the agent should think | What conventions apply here |

## Discovering your preferences

You probably have preferences you don't know about yet. Use Copilot CLI's session store or
`/chronicle` to find them:

```
# In Copilot CLI, ask:
"Search my session history for patterns I repeat across projects. What branch naming
conventions do I use? What tools do I prefer? What project-specific rules have I
mentioned? Suggest preferences I should add to ~/.copilot/preferences.yaml."
```

You can also query the session store directly:

```sql
-- Find branch-related patterns
SELECT DISTINCT s.repository, s.branch
FROM sessions s
WHERE s.branch LIKE 'users/%' OR s.branch LIKE 'feature/%'
ORDER BY s.created_at DESC LIMIT 20;

-- Search for repeated instructions
SELECT content FROM search_index
WHERE search_index MATCH 'convention OR prefer OR always use OR branch prefix'
ORDER BY rank LIMIT 20;
```

Common discoveries include branch naming conventions, package management preferences
(e.g., "use `dotnet add package` not XML"), language-specific idioms, and project-specific
facts. If the finding is universal and behavioral, it belongs in your instruction file.
If it varies by workspace, it belongs in Herald.

## How it's built

Herald is a Copilot CLI extension using the `@github/copilot-sdk/extension` API. It registers
an `onUserPromptSubmitted` hook that fires on each user message. The hook implements a latch
pattern: inject preferences on the first message per cwd, then stay silent.

### Why an extension, not a plugin?

Copilot CLI [plugins](https://docs.github.com/en/copilot/reference/hooks-configuration) support
`hooks.json` with command-based hooks, but their `userPromptSubmitted` output is
[explicitly ignored](https://docs.github.com/en/copilot/reference/hooks-configuration#user-prompt-submitted-hook)
by the CLI runtime. Extensions using the SDK's `onUserPromptSubmitted` callback CAN return
`modifiedPrompt`, which is the mechanism Herald uses.

## Development

```bash
npm install
npm test          # Run unit tests
```

Tests use Node.js built-in test runner (`node:test`), no additional test framework needed.

## References

1. [Rethinking the Value of Multi-Agent Workflow](https://openreview.net/forum?id=i95lcR2GN5) - demonstrates that single agents with well-crafted prompts match homogeneous multi-agent setups
2. [Single-Agent vs Multi-Agent LLM Systems for Automated Programming](https://liang-y-yu.github.io/publication/2025-10-01-paper-title-number-10) - controlled study showing marginal quality gains at 4x cost for multi-agent coding

## License

MIT
