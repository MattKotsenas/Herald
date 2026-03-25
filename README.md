# Herald

**Contextual preferences for Copilot CLI.** Your agent knows your conventions without being told every time.

Herald is a [Copilot CLI extension](https://docs.github.com/en/copilot/how-tos/copilot-cli) that reads
your preferences from a YAML file and injects them into the conversation when they're relevant to
the current workspace. You write the preferences once; Herald announces them at the right time.

## Why Herald exists

AI coding agents start every session with amnesia. They don't know your branch naming conventions,
your preferred test framework, or which projects need special handling. You have a few options today,
and none of them are great:

| Approach | Problem |
|----------|---------|
| `copilot-instructions.md` | Eagerly loaded on every turn. Competes for model attention with behavioral rules. Gets noisy fast. |
| Per-repo `AGENTS.md` | Only applies to one repo. Doesn't carry cross-repo preferences. |
| Tell the agent each time | Tedious. Easy to forget. |

The core issue is **attention, not tokens.** Research shows that instruction-following degrades
with prompt length ([Rethinking the Value of Multi-Agent Workflow](https://openreview.net/forum?id=i95lcR2GN5),
[Single-Agent vs Multi-Agent LLM Systems](https://liang-y-yu.github.io/publication/2025-10-01-paper-title-number-10)).
Every instruction competes for the model's limited attention budget. Your behavioral rules ("test
before committing", "match existing style") deserve that attention. Your branch naming convention
probably doesn't - until you're actually creating a branch.

Herald solves this with **lazy, contextual injection**: preferences are loaded once when you
enter a workspace and stay out of the way after that.

## How it works

Herald is a Copilot CLI [extension](https://docs.github.com/en/copilot/how-tos/copilot-cli) that
hooks into `onUserPromptSubmitted`. On your first message in each workspace, it:

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

| Put in `copilot-instructions.md` | Put in `preferences.yaml` |
|----------------------------------|--------------------------|
| Behavioral rules (how to think) | Workflow facts (what conventions apply) |
| "Test before committing" | "Use `users/me/` branch prefix on ADO" |
| "Match existing code style" | "This project uses Azure Pipelines" |
| "Don't refactor unrelated code" | "Prefer vitest over jest" |
| Universal across all projects | Varies by project or platform |

**Rule of thumb:** If it's about *how the agent should behave*, it's an instruction. If it's
about *what conventions apply in this workspace*, it's a preference.

## Discovering your preferences

You probably have preferences you don't know about yet - patterns buried in your session history.
Use Copilot CLI's session store or `/chronicle` to mine them:

```
# In Copilot CLI, ask:
"Search my session history for patterns I repeat across projects. What branch naming
conventions do I use? What tools do I prefer? What project-specific rules have I
mentioned? Suggest preferences I should add to ~/.copilot/preferences.yaml."
```

You can also query the session store directly via SQL:

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

The goal isn't to automate preference extraction (that's error-prone), but to help you notice
patterns you'd otherwise keep re-explaining.

### What session mining typically reveals

Based on analysis of real developer session histories, the most common discoverable preferences are:

| Category | Example finding | Belongs in |
|----------|----------------|-----------|
| Branch naming | `users/me/` on ADO, `bugfix/` on GitHub | **preferences.yaml** (varies by platform) |
| Package management | "use `dotnet add package` not XML" | **preferences.yaml** (varies by project type) |
| XML doc conventions | "use `<see langword="null"/>` not `<c>null</c>`" | **preferences.yaml** (.NET-specific) |
| Commit references | "use function names, not line numbers" | Could go either way - if universal, **instructions** |
| No em-dashes | "use a hyphen instead" | **instructions** (universal writing style) |
| Test-first workflow | "write failing test, then fix" | **instructions** (behavioral) |
| Backward compatibility | "ask if it's shipped before changing APIs" | **instructions** (behavioral) |

The pattern: **facts about this workspace** go in preferences, **rules about how to think** stay
in instructions.

## How Herald compares to other approaches

There are several ways to give AI agents persistent memory. Herald occupies a specific niche -
understanding when to use it (and when not to) saves you from over- or under-engineering.

### The memory landscape

| Approach | How it works | Strengths | Weaknesses |
|----------|-------------|-----------|------------|
| **Instruction files** (`copilot-instructions.md`, `AGENTS.md`) | Eagerly loaded into every prompt | Always available, zero latency | Competes for attention, doesn't vary by context |
| **Herald** (this tool) | Lazily injects preferences once per workspace based on context matchers | Low attention cost, context-aware, user-controlled | Manual curation, no learning |
| **Auto-memory tools** (agent-managed memory stores) | Agent writes observations to a persistent store, retrieves them via embedding search | Scales to thousands of memories, learns automatically | Noisy, unpredictable recall, agent decides what to remember |
| **Multi-agent frameworks** (persistent team files in git) | Each "agent" has its own history and charter committed to the repo | Knowledge compounds across sessions | High token overhead, [marginal quality gains](https://openreview.net/forum?id=i95lcR2GN5) for same-model setups |

### When to use Herald

Herald is right when your preferences are:
- **Stable** - they don't change session to session ("always use `users/me/` on ADO")
- **Few** - tens of preferences, not thousands
- **Contextual** - different workspaces need different preferences
- **Authored by you** - you know what matters, the agent doesn't need to figure it out

### When to use something else

Consider an auto-memory tool when:
- You want the agent to **learn from corrections** automatically ("I told you to use X, remember that")
- You have **hundreds of project-specific facts** that vary too much for manual curation
- You want **semantic search** over accumulated knowledge rather than rule-based matching

Consider instruction files when:
- The rule is **universal and behavioral** ("test before committing", "match existing style")
- It should apply to **every prompt** regardless of workspace
- Attention cost doesn't matter because the rule is critical

Consider nothing when:
- The information is **already in the repo** (README, AGENTS.md, config files) and the agent
  will find it by reading the codebase

### The attention argument

All of these approaches ultimately inject text into the model's context window. The difference
is *when* and *how much*:

- Instruction files: every turn, full content, always
- Herald: once per workspace, matching subset only
- Auto-memory: every turn (or tool call), retrieved subset, variable quality
- Multi-agent frameworks: per-agent charter on every spawn, full content

Research on LLM instruction-following shows degradation as prompt length increases
([Single-Agent vs Multi-Agent](https://liang-y-yu.github.io/publication/2025-10-01-paper-title-number-10)).
Herald minimizes this by injecting once and only the relevant subset.

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

## License

MIT
