import * as vscode from "vscode";
import { formatTarget } from "./util";

import {
  GitweRepo,
  GitweCliError,
  GitweNotFoundError,
  GitweDoctorFinding,
} from "./cli";

type InboundMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "runCommand"; command: string }
  | { type: "checkout"; branch: string }
  | { type: "finish"; branch: string };

export class GitweDashboardPanel {
  private static current: GitweDashboardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    context: vscode.ExtensionContext,
    getRepo: () => GitweRepo | undefined,
  ): void {
    if (GitweDashboardPanel.current) {
      GitweDashboardPanel.current.panel.reveal();
      void GitweDashboardPanel.current.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "gitwe.dashboard",
      "gitwe: Dashboard",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    GitweDashboardPanel.current = new GitweDashboardPanel(
      panel,
      context,
      getRepo,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private readonly getRepo: () => GitweRepo | undefined,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.renderHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: InboundMessage) => void this.handleMessage(message),
      null,
      this.disposables,
    );

    context.subscriptions.push(
      vscode.window.onDidChangeActiveColorTheme(
        () => void this.refresh(),
        null,
        this.disposables,
      ),
    );
  }

  private async handleMessage(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case "ready":
      case "refresh":
        await this.refresh();
        return;
      case "runCommand":
        await vscode.commands.executeCommand(message.command);
        await this.refresh();
        return;
      case "checkout":
        await vscode.commands.executeCommand(
          "gitwe.checkoutBranchByName",
          message.branch,
        );
        await this.refresh();
        return;
      case "finish":
        await vscode.commands.executeCommand(
          "gitwe.finishBranchByName",
          message.branch,
        );
        await this.refresh();
        return;
    }
  }

  async refresh(): Promise<void> {
    const repo = this.getRepo();
    if (!repo) {
      void this.panel.webview.postMessage({ type: "noWorkspace" });
      return;
    }

    try {
      const [overview, doctor, list] = await Promise.all([
        repo.overview(),
        repo.doctor(false),
        repo.list(),
      ]);
      void this.panel.webview.postMessage({
        type: "data",
        overview,
        doctor,
        list,
      });
    } catch (err) {
      if (err instanceof GitweNotFoundError) {
        void this.panel.webview.postMessage({
          type: "notInstalled",
          message: err.message,
        });
        return;
      }
      const message = err instanceof GitweCliError ? err.message : String(err);
      void this.panel.webview.postMessage({ type: "error", message });
    }
  }

  dispose(): void {
    GitweDashboardPanel.current = undefined;
    for (const d of this.disposables.splice(0)) d.dispose();
    this.panel.dispose();
  }

  private renderHtml(): string {
    const nonce = String(Math.random()).slice(2);
    const csp = [
      "default-src 'none'",
      `style-src 'unsafe-inline'`,
      `font-src https://fonts.gstatic.com`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>gitwe dashboard</title>
<style>
  /* ============================================================
     UI/UX Pro Max — Developer-tool Dashboard (v2)
     Style: Dark OLED + Soft Glassmorphism
     Palette: Slate neutrals + Emerald accent (#22C55E)
     Typography: IBM Plex Sans (UI) + JetBrains Mono (code)
     Density: Dashboard (8–16px scale)
     Motion: Subtle stagger + micro-interactions
     Accessibility: 4.5:1 contrast, visible focus, reduced-motion
     ============================================================ */
  :root {
    --gw-bg: var(--vscode-editor-background);
    --gw-fg: var(--vscode-editor-foreground);
    --gw-card: color-mix(in srgb, var(--vscode-sideBar-background, #1b2336) 92%, transparent);
    --gw-card-solid: var(--vscode-sideBar-background, #1b2336);
    --gw-card-hover: color-mix(in srgb, var(--gw-card-solid) 100%, var(--gw-fg) 5%);
    --gw-muted-fg: var(--vscode-descriptionForeground, #94a3b8);
    --gw-border: color-mix(in srgb, var(--vscode-widget-border, #475569) 70%, transparent);
    --gw-border-strong: var(--vscode-widget-border, #475569);
    --gw-accent: #22c55e;
    --gw-accent-fg: #0f172a;
    --gw-accent-muted: color-mix(in srgb, var(--gw-accent) 18%, transparent);
    --gw-accent-glow: color-mix(in srgb, var(--gw-accent) 28%, transparent);
    --gw-destructive: #ef4444;
    --gw-warning: #f59e0b;
    --gw-info: #38bdf8;
    --gw-radius: 12px;
    --gw-radius-sm: 8px;
    --gw-radius-xs: 6px;
    --gw-space-1: 4px;
    --gw-space-2: 8px;
    --gw-space-3: 12px;
    --gw-space-4: 16px;
    --gw-space-5: 20px;
    --gw-space-6: 24px;
    --gw-space-8: 32px;
    --gw-font-ui: var(--vscode-font-family), "IBM Plex Sans", system-ui, sans-serif;
    --gw-font-mono: var(--vscode-editor-font-family), "JetBrains Mono", ui-monospace, monospace;
    --gw-ease: cubic-bezier(0.4, 0, 0.2, 1);
    --gw-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --gw-t-fast: 140ms;
    --gw-t-med: 220ms;
    --gw-t-slow: 320ms;
    --gw-shadow-sm: 0 1px 2px color-mix(in srgb, #000 12%, transparent);
    --gw-shadow-md: 0 4px 16px -4px color-mix(in srgb, #000 22%, transparent);
    --gw-shadow-lg: 0 12px 32px -8px color-mix(in srgb, #000 28%, transparent);
    --gw-shadow-accent: 0 0 0 1px var(--gw-accent), 0 8px 24px -8px var(--gw-accent-glow);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      transition-duration: 0.001ms !important;
    }
  }

  body {
    font-family: var(--gw-font-ui);
    color: var(--gw-fg);
    background: var(--gw-bg);
    padding: var(--gw-space-6);
    font-size: 13px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }

  /* ---------- Typography ---------- */
  h1 {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }
  h2 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--gw-muted-fg);
    margin: 0 0 var(--gw-space-3);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: var(--gw-space-2);
  }
  h2 .icon { color: var(--gw-muted-fg); opacity: 0.85; }

  .branch-name { font-family: var(--gw-font-mono); font-size: 12.5px; }

  /* ---------- Icons ---------- */
  .icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .icon svg { width: 100%; height: 100%; display: block; }

  /* ---------- Header ---------- */
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--gw-space-8);
    gap: var(--gw-space-4);
    flex-wrap: wrap;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: var(--gw-space-2);
  }
  .title-row .icon {
    width: 20px;
    height: 20px;
    color: var(--gw-accent);
  }
  .subtitle {
    color: var(--gw-muted-fg);
    font-size: 12px;
    margin-top: 5px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .subtitle .icon { width: 13px; height: 13px; color: var(--gw-accent); }
  .subtitle.detached .icon { color: var(--gw-warning); }

  .actions {
    display: flex;
    gap: var(--gw-space-2);
    flex-wrap: wrap;
    align-items: center;
  }

  /* ---------- Buttons ---------- */
  button {
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    border-radius: var(--gw-radius-sm);
    border: 1px solid var(--gw-border-strong);
    background: color-mix(in srgb, var(--vscode-button-secondaryBackground, transparent) 80%, transparent);
    color: var(--vscode-button-secondaryForeground, var(--gw-fg));
    padding: 7px 13px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition:
      background-color var(--gw-t-fast) var(--gw-ease),
      border-color var(--gw-t-fast) var(--gw-ease),
      transform var(--gw-t-fast) var(--gw-ease-out),
      box-shadow var(--gw-t-fast) var(--gw-ease);
  }
  button:hover {
    border-color: var(--gw-accent);
    background: var(--gw-accent-muted);
    transform: translateY(-1px);
  }
  button:active { transform: translateY(0); }
  button:focus-visible {
    outline: 2px solid var(--gw-accent);
    outline-offset: 2px;
  }
  button.primary {
    background: var(--gw-accent);
    color: var(--gw-accent-fg);
    border-color: var(--gw-accent);
    font-weight: 600;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--gw-accent) 40%, transparent);
  }
  button.primary:hover {
    filter: brightness(1.07);
    box-shadow: 0 0 0 3px var(--gw-accent-glow), 0 4px 12px -2px var(--gw-accent-glow);
  }
  button.small {
    padding: 4px 10px;
    font-size: 11px;
    border-radius: var(--gw-radius-xs);
  }
  button.icon-btn {
    padding: 7px;
    min-width: 32px;
    min-height: 32px;
    justify-content: center;
  }
  button.icon-btn .icon { margin: 0; }
  #refresh-btn.spinning .icon svg {
    animation: gw-spin 650ms linear;
  }
  @keyframes gw-spin { to { transform: rotate(360deg); } }

  /* ---------- Grid & Cards ---------- */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--gw-space-3);
    margin-bottom: var(--gw-space-6);
  }

  .card {
    background: var(--gw-card);
    border: 1px solid var(--gw-border);
    border-radius: var(--gw-radius);
    padding: var(--gw-space-4);
    box-shadow: var(--gw-shadow-sm);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition:
      border-color var(--gw-t-med) var(--gw-ease),
      box-shadow var(--gw-t-med) var(--gw-ease),
      transform var(--gw-t-med) var(--gw-ease-out),
      background var(--gw-t-med) var(--gw-ease);
  }

  .stat-card {
    position: relative;
    overflow: hidden;
  }
  .stat-card::before {
    content: "";
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--gw-type-color, var(--gw-accent)), transparent);
    opacity: 0;
    transition: opacity var(--gw-t-med) var(--gw-ease);
  }
  .stat-card:hover {
    border-color: color-mix(in srgb, var(--gw-type-color, var(--gw-accent)) 55%, var(--gw-border));
    box-shadow: var(--gw-shadow-accent);
    transform: translateY(-2px);
    background: var(--gw-card-hover);
  }
  .stat-card:hover::before { opacity: 1; }
  .stat-card .icon {
    color: var(--gw-type-color, var(--gw-accent));
    width: 16px;
    height: 16px;
    margin-bottom: var(--gw-space-2);
  }
  .stat-card .value {
    font-size: 24px;
    font-weight: 700;
    font-family: var(--gw-font-mono);
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .stat-card .label {
    color: var(--gw-muted-fg);
    font-size: 11px;
    margin-top: 5px;
  }
  .stat-card .label.branch-name {
    text-transform: none;
    letter-spacing: 0;
    font-size: 11.5px;
  }

  /* ---------- Sections ---------- */
  section {
    margin-bottom: var(--gw-space-8);
    animation: gw-fade-up var(--gw-t-slow) var(--gw-ease-out) both;
  }
  section:nth-of-type(1) { animation-delay: 0ms; }
  section:nth-of-type(2) { animation-delay: 40ms; }
  section:nth-of-type(3) { animation-delay: 80ms; }

  @keyframes gw-fade-up {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ---------- Doctor findings ---------- */
  .finding {
    display: flex;
    align-items: flex-start;
    gap: var(--gw-space-2);
    padding: var(--gw-space-3) var(--gw-space-1);
    border-bottom: 1px solid var(--gw-border);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .finding:last-child { border-bottom: none; }
  .finding .icon { margin-top: 2px; }
  .finding.ok .icon { color: var(--gw-accent); }
  .finding.warning .icon { color: var(--gw-warning); }
  .finding.error .icon { color: var(--gw-destructive); }
  .finding .fix-badge {
    color: var(--gw-accent);
    font-size: 10px;
    font-weight: 600;
    border: 1px solid color-mix(in srgb, var(--gw-accent) 50%, transparent);
    border-radius: 999px;
    padding: 2px 9px;
    margin-inline-start: auto;
    flex-shrink: 0;
    background: var(--gw-accent-muted);
  }
  .doctor-ok {
    display: flex;
    align-items: center;
    gap: var(--gw-space-2);
    color: var(--gw-accent);
    padding: var(--gw-space-3) var(--gw-space-1);
    font-weight: 600;
    font-size: 13px;
  }

  /* ---------- Branch list ---------- */
  ul.branch-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ul.branch-list li {
    display: flex;
    align-items: center;
    gap: var(--gw-space-2);
    padding: 8px 10px;
    border-radius: var(--gw-radius-sm);
    transition: background-color var(--gw-t-fast) var(--gw-ease);
    animation: gw-fade-up var(--gw-t-med) var(--gw-ease-out) both;
  }
  ul.branch-list li:hover {
    background: color-mix(in srgb, var(--gw-fg) 5%, transparent);
  }
  ul.branch-list li.is-current {
    background: var(--gw-accent-muted);
    border: 1px solid color-mix(in srgb, var(--gw-accent) 30%, transparent);
  }
  ul.branch-list li.is-current .branch-name {
    color: var(--gw-accent);
    font-weight: 600;
  }
  ul.branch-list .branch-icon { color: var(--gw-muted-fg); }
  ul.branch-list li.is-current .branch-icon { color: var(--gw-accent); }

  ul.branch-list .type-badge {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    border-radius: 5px;
    padding: 2px 7px;
    flex-shrink: 0;
    color: var(--gw-type-color, var(--gw-muted-fg));
    border: 1px solid color-mix(in srgb, var(--gw-type-color, var(--gw-border)) 50%, transparent);
    background: color-mix(in srgb, var(--gw-type-color, var(--gw-border)) 12%, transparent);
  }
  ul.branch-list .spacer { flex: 1; min-width: 8px; }
  ul.branch-list li:not(:hover) .row-actions {
    opacity: 0;
    pointer-events: none;
  }
  .row-actions {
    display: flex;
    gap: 6px;
    transition: opacity var(--gw-t-fast) var(--gw-ease);
  }
  @media (hover: none) {
    .row-actions { opacity: 1; pointer-events: auto; }
  }

  /* ---------- Empty state ---------- */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--gw-space-2);
    color: var(--gw-muted-fg);
    padding: var(--gw-space-8) var(--gw-space-4);
    text-align: center;
  }
  .empty-state .icon {
    width: 28px;
    height: 28px;
    color: var(--gw-muted-fg);
    opacity: 0.55;
    margin-bottom: 4px;
  }
  .empty-state .hint { font-size: 12px; opacity: 0.85; }

  /* ---------- Skeleton ---------- */
  .skel {
    border-radius: var(--gw-radius-sm);
    background: linear-gradient(
      90deg,
      var(--gw-border) 0%,
      color-mix(in srgb, var(--gw-border) 50%, var(--gw-card-solid)) 50%,
      var(--gw-border) 100%
    );
    background-size: 200% 100%;
    animation: gw-shimmer 1.5s ease-in-out infinite;
  }
  @keyframes gw-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .skel-card { height: 72px; }
  .skel-row  { height: 32px; margin-bottom: var(--gw-space-2); }

  /* ---------- Banner ---------- */
  .banner {
    display: flex;
    align-items: center;
    gap: var(--gw-space-2);
    color: var(--gw-muted-fg);
    padding: var(--gw-space-3) var(--gw-space-4);
    border-radius: var(--gw-radius);
    border: 1px solid var(--gw-border);
    background: var(--gw-card);
    box-shadow: var(--gw-shadow-sm);
    margin-top: var(--gw-space-4);
  }
  .banner .icon { width: 16px; height: 16px; }
  .banner.error {
    color: var(--gw-destructive);
    border-color: color-mix(in srgb, var(--gw-destructive) 40%, var(--gw-border));
    background: color-mix(in srgb, var(--gw-destructive) 6%, var(--gw-card));
  }
  .banner.error .icon { color: var(--gw-destructive); }
  .hidden { display: none !important; }
</style>
</head>
<body>
  <header>
    <div>
      <div class="title-row">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.gitBranch}</span>
        <h1 id="workflow-name">gitwe</h1>
      </div>
      <div class="subtitle" id="current-branch">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.clock}</span>
        loading…
      </div>
    </div>
    <div class="actions">
      <button class="primary" data-cmd="gitwe.start">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.play}</span>
        Start branch
      </button>
      <button data-cmd="gitwe.finishCurrent">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.checkCircle}</span>
        Finish current
      </button>
      <button data-cmd="gitwe.sync">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.sync}</span>
        Sync
      </button>
      <button data-cmd="gitwe.doctorFix">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.wrench}</span>
        Doctor --fix
      </button>
      <button id="refresh-btn" class="icon-btn" title="Refresh" aria-label="Refresh">
        <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.refresh}</span>
      </button>
    </div>
  </header>

  <section aria-labelledby="overview-heading">
    <h2 id="overview-heading">
      <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.grid}</span>
      Overview
    </h2>
    <div class="grid" id="overview-grid" aria-busy="true">
      <div class="card skel skel-card"></div>
      <div class="card skel skel-card"></div>
      <div class="card skel skel-card"></div>
    </div>
  </section>

  <section aria-labelledby="health-heading">
    <h2 id="health-heading">
      <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.stethoscope}</span>
      Health (gitwe doctor)
    </h2>
    <div class="card" id="doctor-card" aria-busy="true">
      <div class="skel skel-row"></div>
      <div class="skel skel-row"></div>
    </div>
  </section>

  <section aria-labelledby="branches-heading">
    <h2 id="branches-heading">
      <span class="icon" aria-hidden="true">${GitweDashboardPanel.ICONS.list}</span>
      Topic branches
    </h2>
    <div class="card">
      <ul class="branch-list" id="branch-list" aria-busy="true">
        <li><div class="skel skel-row" style="flex:1"></div></li>
        <li><div class="skel skel-row" style="flex:1"></div></li>
      </ul>
    </div>
  </section>

  <div id="banner" class="banner hidden" role="status"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (sel) => document.querySelector(sel);

  const ICONS = {
    gitBranch: ${JSON.stringify(GitweDashboardPanel.ICONS.gitBranch)},
    check: ${JSON.stringify(GitweDashboardPanel.ICONS.check)},
    checkCircle: ${JSON.stringify(GitweDashboardPanel.ICONS.checkCircle)},
    xCircle: ${JSON.stringify(GitweDashboardPanel.ICONS.xCircle)},
    warning: ${JSON.stringify(GitweDashboardPanel.ICONS.warning)},
    info: ${JSON.stringify(GitweDashboardPanel.ICONS.info)},
    clock: ${JSON.stringify(GitweDashboardPanel.ICONS.clock)},
    inbox: ${JSON.stringify(GitweDashboardPanel.ICONS.inbox)},
    hash: ${JSON.stringify(GitweDashboardPanel.ICONS.hash)},
  };

  const TYPE_COLORS = {
    feature: '#38bdf8',
    release: '#a78bfa',
    hotfix: '#ef4444',
    bugfix: '#f59e0b',
    chore: '#94a3b8',
    support: '#22c55e',
  };

  function typeColor(type) {
    return TYPE_COLORS[String(type).toLowerCase()] || '#94a3b8';
  }

  function severityIcon(sev) {
    return sev === 'error' ? ICONS.xCircle
         : sev === 'warning' ? ICONS.warning
         : ICONS.check;
  }

  document.querySelectorAll('button[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () =>
      vscode.postMessage({ type: 'runCommand', command: btn.dataset.cmd })
    );
  });

  $('#refresh-btn').addEventListener('click', () => {
    $('#refresh-btn').classList.add('spinning');
    setTimeout(() => $('#refresh-btn').classList.remove('spinning'), 650);
    vscode.postMessage({ type: 'refresh' });
  });

  function showBanner(text, isError) {
    const el = $('#banner');
    el.innerHTML =
      '<span class="icon" aria-hidden="true">' +
      (isError ? ICONS.xCircle : ICONS.info) +
      '</span><span>' + text + '</span>';
    el.classList.toggle('error', !!isError);
    el.classList.remove('hidden');
  }

  function hideBanner() {
    $('#banner').classList.add('hidden');
  }

  function renderOverview(overview) {
    $('#workflow-name').textContent = 'gitwe — ' + overview.workflowName;

    const branchEl = $('#current-branch');
    if (overview.currentBranch) {
      branchEl.classList.remove('detached');
      branchEl.innerHTML =
        '<span class="icon" aria-hidden="true">' + ICONS.gitBranch + '</span>' +
        'On <span class="branch-name" style="margin-left:4px">' +
        overview.currentBranch + '</span>';
    } else {
      branchEl.classList.add('detached');
      branchEl.innerHTML =
        '<span class="icon" aria-hidden="true">' + ICONS.warning + '</span>' +
        'Detached HEAD';
    }

    const grid = $('#overview-grid');
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = '';

    const baseCard = document.createElement('div');
    baseCard.className = 'card stat-card';
    baseCard.innerHTML =
      '<span class="icon" aria-hidden="true">' + ICONS.hash + '</span>' +
      '<div class="value">' + overview.baseBranches.length + '</div>' +
      '<div class="label">Base branches</div>';
    grid.appendChild(baseCard);

    for (const t of overview.branchTypes) {
      const card = document.createElement('div');
      card.className = 'card stat-card';
      card.style.setProperty('--gw-type-color', typeColor(t.type));
      card.innerHTML =
        '<span class="icon" aria-hidden="true" style="color:var(--gw-type-color)">' +
        ICONS.gitBranch + '</span>' +
        '<div class="value">' + t.count + '</div>' +
        '<div class="label branch-name">' + t.type + ' → ' +
        formatTarget(t.target) + '</div>';
      grid.appendChild(card);
    }
  }

  function renderDoctor(doctor) {
    const card = $('#doctor-card');
    card.setAttribute('aria-busy', 'false');
    card.innerHTML = '';

    if (!doctor.findings.length) {
      card.innerHTML =
        '<div class="doctor-ok">' +
        '<span class="icon" aria-hidden="true">' + ICONS.checkCircle + '</span>' +
        'All checks passed — workflow is healthy.' +
        '</div>';
      return;
    }

    for (const f of doctor.findings) {
      const row = document.createElement('div');
      row.className = 'finding ' + f.severity;
      row.innerHTML =
        '<span class="icon" aria-hidden="true">' + severityIcon(f.severity) + '</span>' +
        '<span>' + f.message + '</span>' +
        (f.fixable ? '<span class="fix-badge">Fixable</span>' : '');
      card.appendChild(row);
    }
  }

  function renderBranches(list, currentBranch) {
    const ul = $('#branch-list');
    ul.setAttribute('aria-busy', 'false');
    ul.innerHTML = '';

    if (!list.branches.length) {
      const li = document.createElement('li');
      li.innerHTML =
        '<div class="empty-state" style="width:100%">' +
        '<span class="icon" aria-hidden="true">' + ICONS.inbox + '</span>' +
        '<div>No topic branches yet.</div>' +
        '<div class="hint">Click “Start branch” above to create one.</div>' +
        '</div>';
      ul.appendChild(li);
      return;
    }

    list.branches.forEach((b, i) => {
      const li = document.createElement('li');
      li.style.animationDelay = Math.min(i * 28, 220) + 'ms';

      const isCurrent = currentBranch &&
        (b.branch === currentBranch || b.shortName === currentBranch);
      if (isCurrent) li.classList.add('is-current');

      const typeBadge = document.createElement('span');
      typeBadge.className = 'type-badge';
      typeBadge.style.setProperty('--gw-type-color', typeColor(b.type));
      typeBadge.textContent = b.type;

      const branchIcon = document.createElement('span');
      branchIcon.className = 'icon branch-icon';
      branchIcon.setAttribute('aria-hidden', 'true');
      branchIcon.innerHTML = ICONS.gitBranch;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'branch-name';
      nameSpan.textContent = b.shortName;

      const spacer = document.createElement('span');
      spacer.className = 'spacer';

      const rowActions = document.createElement('span');
      rowActions.className = 'row-actions';

      const checkoutBtn = document.createElement('button');
      checkoutBtn.className = 'small';
      checkoutBtn.textContent = 'Checkout';
      checkoutBtn.addEventListener('click', () =>
        vscode.postMessage({ type: 'checkout', branch: b.branch })
      );

      const finishBtn = document.createElement('button');
      finishBtn.className = 'small';
      finishBtn.textContent = 'Finish…';
      finishBtn.addEventListener('click', () =>
        vscode.postMessage({ type: 'finish', branch: b.branch })
      );

      rowActions.append(checkoutBtn, finishBtn);
      li.append(typeBadge, branchIcon, nameSpan, spacer, rowActions);
      ul.appendChild(li);
    });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'data':
        hideBanner();
        renderOverview(msg.overview);
        renderDoctor(msg.doctor);
        renderBranches(msg.list, msg.overview?.currentBranch);
        break;
      case 'notInstalled':
        showBanner('gitwe is not installed: ' + msg.message, true);
        break;
      case 'noWorkspace':
        showBanner('Open a folder with a gitwe workflow to see its dashboard.', false);
        break;
      case 'error':
        showBanner(msg.message, true);
        break;
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }

  /**
   * Inline Phosphor-style (outline) SVG icons — ui-ux-pro-max icons domain.
   * Inlined for strict CSP (default-src 'none').
   */
  private static readonly ICONS = {
    gitBranch:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M104 40a24 24 0 1 0-32 22.6v50.8a24 24 0 0 0 0 45.2v9.4a24 24 0 0 0 24 24h40a8 8 0 0 0 8-8v-9.4a24 24 0 1 0-16 0V184h-32a8 8 0 0 1-8-8v-9.4a24 24 0 0 0 0-45.2V62.6A24 24 0 0 0 104 40Zm64 152a8 8 0 1 1-8-8 8 8 0 0 1 8 8ZM72 40a8 8 0 1 1-8 8 8 8 0 0 1 8-8Zm0 96a8 8 0 1 1-8 8 8 8 0 0 1 8-8Z" fill="currentColor"/></svg>',
    check:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m226.8 74.8-133.5 133.5a8 8 0 0 1-11.3 0l-52.8-52.8a8 8 0 0 1 11.3-11.3l47.1 47.1L215.5 63.5a8 8 0 1 1 11.3 11.3Z" fill="currentColor"/></svg>',
    checkCircle:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24Zm45.7 85.7-56 56a8 8 0 0 1-11.4 0l-24-24a8 8 0 0 1 11.4-11.4L112 148.7l50.3-50.4a8 8 0 0 1 11.4 11.4Z" fill="currentColor"/></svg>',
    xCircle:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24Zm29.7 118.3a8 8 0 0 1-11.4 11.4L128 135.3l-18.3 18.4a8 8 0 0 1-11.4-11.4L116.7 124l-18.4-18.3a8 8 0 0 1 11.4-11.4L128 112.7l18.3-18.4a8 8 0 0 1 11.4 11.4L139.3 124Z" fill="currentColor"/></svg>',
    warning:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M236.8 188.1 149.5 44.5a24.8 24.8 0 0 0-43 0L19.2 188.1A23.7 23.7 0 0 0 39.7 224h176.6a23.7 23.7 0 0 0 20.5-35.9ZM120 104a8 8 0 0 1 16 0v56a8 8 0 0 1-16 0Zm8 100a12 12 0 1 1 12-12 12 12 0 0 1-12 12Z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24Zm-8 56a12 12 0 1 1 12 12 12 12 0 0 1-12-12Zm20 100a8 8 0 0 1-16 0v-56a8 8 0 0 1 16 0Z" fill="currentColor"/></svg>',
    clock:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M128 24a104 104 0 1 0 104 104A104.1 104.1 0 0 0 128 24Zm8 104a8 8 0 0 1-8 8H80a8 8 0 0 1 0-16h40V72a8 8 0 0 1 16 0Z" fill="currentColor"/></svg>',
    refresh:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M197.7 58.3A96 96 0 0 0 32 128a8 8 0 0 1-16 0 112 112 0 0 1 191.6-79.3L226 27.2a8 8 0 0 1 13.7 5.6v56a8 8 0 0 1-8 8h-56a8 8 0 0 1-5.6-13.7ZM224 120a8 8 0 0 0-8 8 96 96 0 0 1-165.7 66.3l18.4-18.4a8 8 0 0 0-5.6-13.7h-56a8 8 0 0 0-8 8v56a8 8 0 0 0 13.7 5.7l19-19A112 112 0 0 0 232 128a8 8 0 0 0-8-8Z" fill="currentColor"/></svg>',
    sync: '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M216 66.7V40a8 8 0 0 0-16 0v10.1A103.9 103.9 0 0 0 128 24a104.3 104.3 0 0 0-96.9 66.1 8 8 0 1 0 14.9 5.8A88.3 88.3 0 0 1 128 40a87.9 87.9 0 0 1 62.3 25.7H168a8 8 0 0 0 0 16h40a8 8 0 0 0 8-8ZM216.9 168A8 8 0 0 0 206 173.9 88.3 88.3 0 0 1 128 216a87.9 87.9 0 0 1-62.3-25.7H88a8 8 0 0 0 0-16H48a8 8 0 0 0-8 8v40a8 8 0 0 0 16 0v-10.1A103.9 103.9 0 0 0 128 232a104.3 104.3 0 0 0 96.9-66.1 8 8 0 0 0-8-8Z" fill="currentColor"/></svg>',
    wrench:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M226.8 152.2 194.6 120a55.9 55.9 0 0 0-13.8-58.2 56.7 56.7 0 0 0-56.5-13.9 8 8 0 0 0-3.9 13.4L153 94l-13 13-32.7-32.6a8 8 0 0 0-13.4 3.9 56.7 56.7 0 0 0 13.9 56.5A55.9 55.9 0 0 0 136 148.6l55.4 55.4a28.3 28.3 0 0 0 40-40Z" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M232.4 114.5 88.3 26.4a16 16 0 0 0-24.3 13.6v176a16 16 0 0 0 24.3 13.6l144.1-88.1a15.5 15.5 0 0 0 0-26.6Z" fill="currentColor"/></svg>',
    grid: '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M104 40H56a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h48a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16Zm96 0h-48a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h48a16 16 0 0 0 16-16V56a16 16 0 0 0-16-16Zm-96 96H56a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h48a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16Zm96 0h-48a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h48a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16Z" fill="currentColor"/></svg>',
    stethoscope:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M164 40a12 12 0 1 0 12 12 12 12 0 0 0-12-12Zm40 12a28 28 0 1 1-33.9-27.3A28 28 0 0 1 204 52ZM60 40a12 12 0 1 0 12 12 12 12 0 0 0-12-12Zm0-16a28 28 0 1 0 28 28 28 28 0 0 0-28-28Zm128 96a8 8 0 0 0-8 8 44 44 0 0 1-88 0v-11.4a48 48 0 0 0 40-47.3V56a8 8 0 0 0-16 0v13.3a48 48 0 0 0-24 41.5V128a44 44 0 0 0 44 44v0a44 44 0 0 0 44-44 8 8 0 0 0-8-8Z" fill="currentColor"/></svg>',
    list: '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M96 64a8 8 0 0 1 8-8h112a8 8 0 0 1 0 16H104a8 8 0 0 1-8-8Zm120 56H104a8 8 0 0 0 0 16h112a8 8 0 0 0 0-16Zm0 64H104a8 8 0 0 0 0 16h112a8 8 0 0 0 0-16ZM60 56a12 12 0 1 0 12 12 12 12 0 0 0-12-12Zm0 64a12 12 0 1 0 12 12 12 12 0 0 0-12-12Zm0 64a12 12 0 1 0 12 12 12 12 0 0 0-12-12Z" fill="currentColor"/></svg>',
    inbox:
      '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M223 116.3 199.4 40A16 16 0 0 0 184 24H72a16 16 0 0 0-15.4 16L33 116.3a8 8 0 0 0-1 3.7v88a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16v-88a8 8 0 0 0-1-3.7ZM72 40h112l20.1 72H172a8 8 0 0 0-7.4 5l-9.5 23H100.9l-9.5-23a8 8 0 0 0-7.4-5H51.9Z" fill="currentColor"/></svg>',
    hash: '<svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M224 96h-38.7l7.4-44.3a8 8 0 0 0-15.8-2.6L168.6 96h-49.9l7.4-44.3a8 8 0 1 0-15.8-2.6L102.6 96H56a8 8 0 0 0 0 16h43.9l-9.4 56H32a8 8 0 0 0 0 16h55.8l-7.4 44.3a8 8 0 0 0 6.6 9.2 8.4 8.4 0 0 0 1.3.1 8 8 0 0 0 7.9-6.7L103.9 184h49.9l-7.4 44.3a8 8 0 0 0 6.6 9.2 8.4 8.4 0 0 0 1.3.1 8 8 0 0 0 7.9-6.7L169.9 184H216a8 8 0 0 0 0-16h-43.9l9.4-56H224a8 8 0 0 0 0-16Zm-71.5 72h-49.9l9.4-56h49.9Z" fill="currentColor"/></svg>',
  };
}

/** Re-exported so extension.ts can type-annotate findings without importing cli.ts twice. */
export type { GitweDoctorFinding };