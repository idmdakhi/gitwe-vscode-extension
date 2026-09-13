# Changelog

## 0.2.1

- **Sync with gitwe 0.40.x**
  - npx fallback now uses `gitwe` (the published package name) instead of the non-existent `gitwe` package.
  - Install instructions and error messages updated to `npm install -g gitwe-ts` / `@idmdakhi/gitwe`.
  - `package.json` repository URL corrected to point at `gitwe-vscode`.
  - Documented compatibility with gitwe ≥ 0.40 (RFC-0004 JSON envelope).

## 0.2.0

- **Dashboard redesign** — complete visual overhaul guided by [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
  - Dark Mode (OLED) developer-tool palette with VS Code theme fallbacks
  - IBM Plex Sans + JetBrains Mono typography
  - Stat cards with accent bar + soft icons
  - Color-coded branch type badges (feature / hotfix / release / chore)
  - SVG icons throughout (no emoji)
  - Subtle stagger animations (respects reduced-motion)
  - Improved empty states, doctor findings, and hover affordances
  - Responsive layout for narrow webview widths

## 0.1.0

Initial release:

- Status bar current-topic indicator.
- Topic Branches Activity Bar view with inline actions.
- Dashboard webview (overview, doctor findings, branch list).
- Command Palette commands for every relevant `gitwe` subcommand.
- Configurable binary resolution (`PATH` → `npx gitwe` → `gitwe.binaryPath`).
