# gitwe for VS Code

Run and visualize your [gitwe](https://github.com/idmdakhi/gitwe) branching
workflow — `start`, `finish`, `update`, `sync`, `publish`, `doctor`, and more —
without leaving the editor.

gitwe is a configurable git branching-workflow engine (git-flow/GitHub
Flow/GitLab Flow are just presets on top of it). This extension is a thin,
transparent client around the `gitwe` CLI: every action here maps 1:1 to a
documented `gitwe` command run with `--format json`, so nothing happens that
you couldn't reproduce yourself on the command line.

## Features

- **Status bar** — shows the resolved type/short name of the branch you're
  on (e.g. `feature/login`), or a warning if `gitwe doctor` finds a problem.
  Click it to open the dashboard.
- **Topic Branches view** (Activity Bar) — every topic branch, grouped by
  type, with inline actions: checkout, update, publish, finish, rename,
  delete.
- **Dashboard** (`gitwe: Open Dashboard`) — one webview with the workflow
  overview, `gitwe doctor` findings, and the full branch list with quick
  actions.
- **Command Palette** — every `gitwe` subcommand that makes sense outside a
  terminal: `init`, `start`, `finish`, `update`, `sync`, `pull`, `publish`,
  `delete`, `rename`, `checkout`, `track`, `tag`, `rebase`, `abort`,
  `doctor`, `doctor --fix`, `validate`, `graph`, `log`.
- Merge conflicts surfaced from `finish`/`update` offer **Show Files** and
  **Abort** actions instead of a raw stack trace.

## Requirements

- [gitwe](https://github.com/idmdakhi/gitwe) itself:
  ```bash
  npm install -g gitwe-ts
  # OR
  npm install -g @idmdakhi/gitwe
  ```
  (or leave it uninstalled and let the extension fall back to `npx gitwe`).
- A repository with a workflow definition (`.gitwe/gitwe.yaml`) — the
  Topic Branches view offers to run `gitwe init` if one isn't found.
- Node.js ≥ 20 and `git` on `PATH` (gitwe's own requirements).
- Compatible with **gitwe ≥ 0.40** (JSON envelope `schemaVersion: 1`).

## Settings

| Setting                           | Default | Description                                      |
| --------------------------------- | ------- | ------------------------------------------------ |
| `gitwe.binaryPath`                | `""`    | Explicit path to the `gitwe` executable.         |
| `gitwe.useNpxFallback`            | `true`  | Use `npx gitwe` when no global install is found. |
| `gitwe.confirmDestructiveActions` | `true`  | Confirm before delete / force-finish / abort.    |
| `gitwe.statusBar.enabled`         | `true`  | Show the current topic branch in the status bar. |
| `gitwe.runInTerminal`             | `false` | Reserved for a future terminal-transcript mode.  |

## Development

```bash
npm install
npm run watch     # esbuild --watch
# press F5 in VS Code to launch an Extension Development Host
```

```bash
npm run typecheck # tsc --noEmit
npm run build     # production bundle to dist/extension.js
npm run package   # vsce package -> .vsix
```

## Design notes

The dashboard was redesigned from scratch using **UI/UX Pro Max** design
intelligence:

- **Style:** Dark Mode (OLED) — high contrast, low white emission, eye-friendly
- **Palette:** Developer-tool tokens (`#0F172A` bg, `#22C55E` accent, slate neutrals)
- **Typography:** IBM Plex Sans (UI) + JetBrains Mono (branch names)
- **Density:** Dashboard-oriented (compact cards, 8–12 px gaps)
- **Motion:** Subtle fade-up stagger (respects `prefers-reduced-motion`)
- **Icons:** Inline SVG (Lucide-style), never emoji
- **Accessibility:** Visible focus rings, 4.5:1 contrast, keyboard-friendly buttons

All colors layer on top of VS Code theme variables so the panel still
blends into light themes instead of forcing dark mode.

## License

MIT
